# -*- coding: utf-8 -*-
"""
多模型路由器 - AB Console 专用

功能：
1. 多模型支持（Kimi/Gemini/DeepSeek）
2. 自动故障转移
3. 根据 payload 大小选择模型
4. 健康检查和统计

配置优先级：
1. 环境变量 LLM_PRIMARY_MODEL
2. 默认 kimi-2.5
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class ModelConfig:
    """模型配置"""
    name: str
    base_url: str
    api_key: str
    model_id: str
    max_tokens: int = 32000
    timeout: int = 300
    enabled: bool = True
    priority: int = 0  # 越小优先级越高
    # 统计
    success_count: int = 0
    fail_count: int = 0
    last_error: Optional[str] = None
    last_success: float = 0


@dataclass
class RouterStats:
    """路由统计"""
    total_requests: int = 0
    success_count: int = 0
    fail_count: int = 0
    fallback_count: int = 0
    model_stats: Dict[str, Dict] = field(default_factory=dict)


class LLMRouter:
    """
    多模型路由器

    使用方式：
        router = LLMRouter()
        content, raw = await router.call(messages)
    """

    def __init__(self):
        self.models: Dict[str, ModelConfig] = {}
        self.stats = RouterStats()
        self._load_models()

    def _load_models(self):
        """从环境变量加载模型配置"""
        # Kimi 2.5 - 主力模型
        kimi_key = os.getenv("KIMI_API_KEY") or os.getenv("EXTERNAL_API_KEY")
        if kimi_key:
            self.models["kimi"] = ModelConfig(
                name="Kimi 2.5",
                base_url=os.getenv("KIMI_API_BASE_URL", "https://api.moonshot.cn/v1"),
                api_key=kimi_key,
                model_id=os.getenv("KIMI_MODEL", "moonshot-v1-8k"),
                max_tokens=int(os.getenv("KIMI_MAX_TOKENS", "32000")),
                priority=0,  # 最高优先级
            )

        # Gemini 反代 - 备用模型
        gemini_key = os.getenv("GEMINI_API_KEY")
        gemini_url = os.getenv("GEMINI_API_BASE_URL")
        if gemini_key and gemini_url:
            self.models["gemini"] = ModelConfig(
                name="Gemini (反代)",
                base_url=gemini_url,
                api_key=gemini_key,
                model_id=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
                max_tokens=int(os.getenv("GEMINI_MAX_TOKENS", "128000")),
                priority=1,
            )

        # DeepSeek - 大 context 备用
        deepseek_key = os.getenv("DEEPSEEK_API_KEY")
        if deepseek_key:
            self.models["deepseek"] = ModelConfig(
                name="DeepSeek",
                base_url=os.getenv("DEEPSEEK_API_BASE_URL", "https://api.deepseek.com/v1"),
                api_key=deepseek_key,
                model_id=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
                max_tokens=int(os.getenv("DEEPSEEK_MAX_TOKENS", "64000")),
                priority=2,
            )

        # 如果没有配置任何模型，使用默认的 OpenAI 兼容配置
        if not self.models:
            base_url = os.getenv("LLM_API_BASE_URL")
            api_key = os.getenv("EXTERNAL_API_KEY")
            if base_url and api_key:
                self.models["default"] = ModelConfig(
                    name="Default LLM",
                    base_url=base_url,
                    api_key=api_key,
                    model_id=os.getenv("LLM_MODEL", "gpt-3.5-turbo"),
                    max_tokens=int(os.getenv("LLM_MAX_TOKENS", "32000")),
                    priority=0,
                )

        logger.info(f"[LLMRouter] 已加载 {len(self.models)} 个模型: {list(self.models.keys())}")

    def _select_model(self, payload_size: int = 0) -> Optional[str]:
        """
        选择模型

        策略：
        1. 优先使用主力模型（priority 最小）
        2. 如果主力模型连续失败 3 次，切换到备用
        3. 大 payload (>30KB) 优先使用大 context 模型
        """
        if not self.models:
            return None

        # 按优先级排序
        sorted_models = sorted(
            [(k, v) for k, v in self.models.items() if v.enabled],
            key=lambda x: x[1].priority
        )

        if not sorted_models:
            return None

        # 大 payload 优先使用大 context 模型
        if payload_size > 30000:
            for name, config in sorted_models:
                if config.max_tokens >= 64000:
                    return name

        # 检查主力模型健康状态
        primary_name, primary_config = sorted_models[0]
        if primary_config.fail_count >= 3:
            # 主力模型连续失败，检查是否有备用
            if len(sorted_models) > 1:
                logger.warning(f"[LLMRouter] 主力模型 {primary_name} 连续失败 {primary_config.fail_count} 次，切换到备用")
                return sorted_models[1][0]

        return primary_name

    async def call(
        self,
        messages: List[Dict[str, str]],
        model_hint: Optional[str] = None,
        max_retries: int = 2,
    ) -> Tuple[str, str]:
        """
        调用 LLM

        Args:
            messages: OpenAI 兼容的消息列表
            model_hint: 指定模型（可选）
            max_retries: 最大重试次数

        Returns:
            (content, raw_response)
        """
        self.stats.total_requests += 1

        # 计算 payload 大小
        payload_size = len(json.dumps(messages, ensure_ascii=False))

        # 选择模型
        if model_hint and model_hint in self.models:
            model_name = model_hint
        else:
            model_name = self._select_model(payload_size)

        if not model_name:
            return "[ROUTER_ERROR] 没有可用的模型", json.dumps({"error": "no_model"})

        # 尝试调用
        tried_models = set()
        last_error = None

        for attempt in range(max_retries + 1):
            if model_name in tried_models:
                # 切换到下一个模型
                available = [k for k in self.models.keys() if k not in tried_models and self.models[k].enabled]
                if not available:
                    break
                model_name = available[0]

            tried_models.add(model_name)
            config = self.models[model_name]

            logger.info(f"[LLMRouter] 尝试 {config.name} (attempt {attempt + 1})")

            try:
                content, raw = await self._call_model(config, messages)

                # 检查是否成功
                if not content.startswith("[") or not "_ERROR]" in content:
                    # 成功
                    config.success_count += 1
                    config.fail_count = 0  # 重置连续失败计数
                    config.last_success = time.time()
                    self.stats.success_count += 1

                    if attempt > 0:
                        self.stats.fallback_count += 1

                    return content, raw
                else:
                    # 失败
                    config.fail_count += 1
                    config.last_error = content
                    last_error = content
                    logger.warning(f"[LLMRouter] {config.name} 失败: {content[:100]}")

            except Exception as e:
                config.fail_count += 1
                config.last_error = str(e)
                last_error = str(e)
                logger.error(f"[LLMRouter] {config.name} 异常: {e}")

        # 所有模型都失败
        self.stats.fail_count += 1
        return f"[ROUTER_ERROR] 所有模型都失败: {last_error}", json.dumps({"error": "all_failed"})

    async def _call_model(
        self,
        config: ModelConfig,
        messages: List[Dict[str, str]],
    ) -> Tuple[str, str]:
        """调用单个模型"""
        url = config.base_url.rstrip("/") + "/chat/completions"
        payload = {
            "model": config.model_id,
            "messages": messages,
            "temperature": 0.5,
            "stream": False,
            "max_tokens": config.max_tokens,
        }
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        }

        def _request():
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=config.timeout) as resp:
                return resp.read().decode("utf-8")

        try:
            loop = asyncio.get_event_loop()
            raw = await loop.run_in_executor(None, _request)
            resp = json.loads(raw)
            content = resp.get("choices", [{}])[0].get("message", {}).get("content")
            if not content:
                content = raw
            return content, raw
        except urllib.error.HTTPError as e:
            try:
                body = e.read().decode("utf-8")
            except Exception:
                body = str(e)
            return f"[HTTP_ERROR] {e.code}: {body[:200]}", json.dumps({"error": body})
        except Exception as e:
            return f"[REQUEST_ERROR] {e}", json.dumps({"error": str(e)})

    def get_stats(self) -> Dict:
        """获取统计信息"""
        return {
            "total_requests": self.stats.total_requests,
            "success_count": self.stats.success_count,
            "fail_count": self.stats.fail_count,
            "fallback_count": self.stats.fallback_count,
            "success_rate": (
                self.stats.success_count / self.stats.total_requests * 100
                if self.stats.total_requests > 0 else 0
            ),
            "models": {
                name: {
                    "name": config.name,
                    "enabled": config.enabled,
                    "priority": config.priority,
                    "success_count": config.success_count,
                    "fail_count": config.fail_count,
                    "last_error": config.last_error,
                }
                for name, config in self.models.items()
            }
        }

    def reset_model(self, model_name: str):
        """重置模型状态（用于手动恢复）"""
        if model_name in self.models:
            self.models[model_name].fail_count = 0
            self.models[model_name].last_error = None
            logger.info(f"[LLMRouter] 已重置模型 {model_name}")


# 全局路由器实例
_router: Optional[LLMRouter] = None


def get_router() -> LLMRouter:
    """获取全局路由器实例"""
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router


async def call_llm_with_router(
    messages: List[Dict[str, str]],
    model_hint: Optional[str] = None,
) -> Tuple[str, str]:
    """
    使用路由器调用 LLM（便捷函数）

    Args:
        messages: OpenAI 兼容的消息列表
        model_hint: 指定模型（可选）

    Returns:
        (content, raw_response)
    """
    router = get_router()
    return await router.call(messages, model_hint)


__all__ = ["LLMRouter", "get_router", "call_llm_with_router"]

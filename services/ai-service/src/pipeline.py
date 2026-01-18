# -*- coding: utf-8 -*-
"""
AI 分析管道
- 获取全量数据 -> 构建提示词 -> 调用 LLM -> 保存结果
- 不做数据精简，完整喂给 LLM
"""
from __future__ import annotations

import asyncio
import os
from typing import Dict, Any

from src.data import fetch_payload
from src.prompt import build_prompt
from src.llm import call_llm
from src.utils.run_recorder import RunRecorder


async def run_analysis(
    symbol: str,
    interval: str,
    prompt_name: str | None = None,
    lang: str | None = None,
) -> Dict[str, Any]:
    """
    执行 AI 分析
    
    Args:
        symbol: 交易对，如 BTCUSDT
        interval: 时间周期，如 1h
        prompt_name: 提示词名称
        
    Returns:
        分析结果字典
    """
    # 0. 选择默认提示词
    prompt_name = prompt_name or os.getenv("AI_DEFAULT_PROMPT", "市场全局解析")

    # 1. 获取全量数据
    payload = await asyncio.to_thread(fetch_payload, symbol, interval)

    # 2. 构建提示词（完整数据，不精简）
    system_prompt, data_json = await asyncio.to_thread(build_prompt, prompt_name, payload, lang)

    # 数据完整性提示
    data_quality = payload.get("data_quality") if isinstance(payload, dict) else None
    quality_warning = ""
    if isinstance(data_quality, dict) and data_quality.get("warnings"):
        quality_warning = (
            "数据完整性警告："
            + "; ".join(str(w) for w in data_quality.get("warnings", []))
            + "\n"
        )

    # 根据语言调整输出要求，默认中文
    lang_hint = "中文" if not lang or (isinstance(lang, str) and lang.startswith("zh")) else "English"
    user_content = (
        quality_warning +
        f"请基于以下交易数据进行市场分析，输出{lang_hint}结论\n"
        "禁止原样粘贴 DATA_JSON 或长表格；只输出摘要和关键数值\n"
        "===DATA_JSON===\n"
        f"{data_json}"
    )

    # 3. 调用 LLM
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    analysis_text, raw_response = await _call_llm_with_large_payload_guard(messages, data_json)
    status, error = _detect_llm_status(analysis_text, raw_response)

    # 4. 保存结果
    recorder = RunRecorder()
    await asyncio.to_thread(
        recorder.save_run,
        symbol,
        interval,
        prompt_name,
        payload,
        system_prompt,
        analysis_text,
        messages,
        status=status,
        error=error,
    )

    return {
        "status": status,
        "error": error,
        "analysis": analysis_text,
        "raw_response": raw_response,
        "payload": payload,
    }


async def _call_llm_with_large_payload_guard(messages: list, data_json: str) -> tuple[str, str]:
    """对超大 payload 进行保护性处理。"""
    max_chars = _env_int("AI_LARGE_PAYLOAD_CHAR_LIMIT", 200_000)
    force_gemini = _env_flag("AI_FORCE_GEMINI_ON_LARGE_PAYLOAD", True)
    backend = os.getenv("LLM_BACKEND", "cli")

    if data_json and len(data_json) > max_chars and backend != "cli":
        if force_gemini:
            return await call_llm(messages, backend="cli")
        return (
            "[PAYLOAD_TOO_LARGE] 超出限制，请改用 Gemini CLI 或提高阈值",
            "{\"error\":\"payload_too_large\"}",
        )

    return await call_llm(messages)


def _detect_llm_status(analysis_text: str, raw_response: str) -> tuple[str, str | None]:
    """识别 LLM 失败并返回状态。"""
    error_prefixes = ("[API_ERROR]", "[CLI_ERROR]", "[OPENAI_COMPAT_ERROR]", "[PAYLOAD_TOO_LARGE]")
    if isinstance(analysis_text, str) and analysis_text.startswith(error_prefixes):
        return "error", analysis_text

    try:
        import json

        parsed = json.loads(raw_response) if raw_response else {}
        if isinstance(parsed, dict) and parsed.get("error"):
            return "error", json.dumps(parsed.get("error"), ensure_ascii=False)
    except Exception:
        pass

    return "ok", None


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


__all__ = ["run_analysis"]

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LLM API客户端工具

为其他服务提供简单的接口来调用LLM API网关，自动处理身份认证和请求。
"""

import json
import requests
from typing import Dict, List, Optional, Any
from libs.common.utils.路径助手 import 获取仓库根目录


class LLM客户端:
    """LLM API网关客户端

    提供简单的接口调用LLM API服务，自动从.env文件读取配置。

    示例:
        client = LLM客户端()
        response = client.聊天(
            messages=[{"role": "user", "content": "Hello!"}],
            model="gemini-2.5-flash"
        )
        print(response["choices"][0]["message"]["content"])
    """

    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        """初始化LLM客户端

        Args:
            base_url: LLM API网关地址，默认从.env读取或使用localhost:8000
            api_key: 外部访问密钥，默认从.env读取
        """
        from dotenv import load_dotenv
        import os

        # 加载.env文件（统一读取 config/.env）
        env_path = 获取仓库根目录() / "config" / ".env"
        load_dotenv(env_path)

        # 设置API地址
        self.base_url = base_url or os.getenv("LLM_API_BASE_URL", "http://localhost:8000")
        self.api_key = api_key or os.getenv("EXTERNAL_API_KEY")

        if not self.api_key:
            raise ValueError(
                f"未找到EXTERNAL_API_KEY配置，请确保在 {env_path} 文件中设置了该值"
            )

        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def 聊天(
        self,
        messages: List[Dict[str, str]],
        model: str = "gemini-2.5-flash",
        temperature: float = 0.7,
        max_tokens: int = 1000,
        stream: bool = False,
        req_timeout: int = 60,
        **kwargs
    ) -> Dict[str, Any]:
        """发送聊天请求

        Args:
            messages: 消息列表，格式: [{"role": "user", "content": "..."}]
            model: 模型名称，支持 gemini-2.5-flash, gemini-pro, gpt-3.5-turbo, gpt-4
            temperature: 温度参数，0-2之间
            max_tokens: 最大生成token数
            stream: 是否使用流式响应
            **kwargs: 其他参数，如top_p, n, stop等

        Returns:
            API响应字典

        示例:
            response = client.聊天(
                messages=[
                    {"role": "user", "content": "你好，请介绍一下自己"}
                ],
                model="gemini-2.5-flash",
                temperature=0.7
            )
            content = response["choices"][0]["message"]["content"]
        """
        url = f"{self.base_url}/v1/chat/completions"

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
            **kwargs
        }

        try:
            response = requests.post(url, headers=self.headers, json=payload, timeout=req_timeout)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"LLM API请求失败: {str(e)}")

    def 嵌入(self, input_text: str, model: str = "text-embedding-ada-002") -> Dict[str, Any]:
        """创建文本嵌入向量

        Args:
            input_text: 输入文本
            model: 嵌入模型，默认使用 text-embedding-ada-002

        Returns:
            包含嵌入向量的响应
        """
        url = f"{self.base_url}/v1/embeddings"

        payload = {
            "model": model,
            "input": input_text
        }

        try:
            response = requests.post(url, headers=self.headers, json=payload, timeout=60)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"嵌入API请求失败: {str(e)}")

    def 获取模型列表(self) -> List[Dict[str, Any]]:
        """获取可用的模型列表

        Returns:
            模型列表
        """
        url = f"{self.base_url}/v1/models"

        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            return response.json().get("data", [])
        except requests.exceptions.RequestException as e:
            raise Exception(f"获取模型列表失败: {str(e)}")

    def 获取统计信息(self) -> Dict[str, Any]:
        """获取API使用统计信息

        Returns:
            包含密钥状态、请求统计等信息的字典
        """
        url = f"{self.base_url}/stats"

        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"获取统计信息失败: {str(e)}")

    def 健康检查(self) -> bool:
        """检查LLM API服务是否正常运行

        Returns:
            True表示服务正常，False表示服务异常
        """
        url = f"{self.base_url}/"

        try:
            response = requests.get(url, headers=self.headers, timeout=5)
            return response.status_code == 200
        except:
            return False


def 创建LLM客户端() -> LLM客户端:
    """快速创建LLM客户端实例

    示例:
        client = 创建LLM客户端()
        response = client.聊天([{"role": "user", "content": "Hello!"}])
        print(response)
    """
    return LLM客户端()


# 预定义的系统提示模板
系统提示模板 = {
    "代码审查": "你是一个专业的代码审查助手。请审查以下代码，并提供改进建议：",
    "文档生成": "你是一个技术文档编写助手。请为以下代码生成清晰的文档：",
    "错误分析": "你是一个错误分析专家。请分析以下错误信息，并提供解决方案：",
    "优化建议": "你是一个代码优化专家。请分析以下代码，并提供性能优化建议：",
}


if __name__ == "__main__":
    # 简单的测试
    print("🧪 测试LLM客户端...")

    try:
        # 创建客户端
        client = 创建LLM客户端()

        # 执行健康检查
        if client.健康检查():
            print("✅ LLM API服务正常运行")
        else:
            print("❌ LLM API服务不可用")
            exit(1)

        # 获取模型列表
        models = client.获取模型列表()
        print(f"✅ 可用模型数量: {len(models)}")
        for model in models[:3]:  # 显示前3个
            print(f"   - {model['id']} ({model['owned_by']})")

        # 获取统计信息
        stats = client.获取统计信息()
        print(f"✅ 活跃密钥数: {stats['active_keys']}/{stats['total_keys']}")

        # 测试聊天（可选）
        # response = client.聊天(
        #     messages=[{"role": "user", "content": "Hello, are you working?"}],
        #     max_tokens=50
        # )
        # print(f"✅ 测试响应: {response['choices'][0]['message']['content'][:50]}...")

        print("\n🎉 LLM客户端测试完成！")

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        print("\n请确保：")
        print("1. LLM API服务已启动 (python services/llm-service/src/api/llm_api.py)")
        print("2. 根目录的.env文件配置了正确的EXTERNAL_API_KEY")
        print("3. 网络连接正常")
        exit(1)

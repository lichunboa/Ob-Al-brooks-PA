# -*- coding: utf-8 -*-
"""
AI 分析服务（独立服务）

核心功能：
- run_analysis: 执行 AI 分析
- PromptRegistry: 提示词注册表
- call_llm: 调用 LLM
- fetch_payload: 获取分析数据
"""
from src.pipeline import run_analysis
from src.prompt import PromptRegistry, build_prompt
from src.llm import call_llm
from src.data import fetch_payload

__all__ = [
    "run_analysis",
    "PromptRegistry",
    "build_prompt",
    "call_llm",
    "fetch_payload",
]

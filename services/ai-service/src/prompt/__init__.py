# -*- coding: utf-8 -*-
"""提示词管理模块"""
from .registry import PromptRegistry
from .builder import build_prompt

__all__ = ["PromptRegistry", "build_prompt"]

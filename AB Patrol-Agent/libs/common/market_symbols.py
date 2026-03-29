"""共享品种标准化工具。"""

from __future__ import annotations

import re

_SETTLEMENT_SUFFIX_RE = re.compile(r":(USDT|USD|USDC|BUSD)$", re.IGNORECASE)
_SPACE_RE = re.compile(r"\s+")
_NON_ALNUM_RE = re.compile(r"[^A-Z0-9]")


def strip_symbol_settlement(value: str) -> str:
    """移除交易所结算后缀，例如 `:USDT`。"""
    return _SETTLEMENT_SUFFIX_RE.sub("", str(value or "").strip().upper())


def normalize_bar_symbol(value: str) -> str:
    """统一图表与执行层的传输 symbol。"""
    text = strip_symbol_settlement(value)
    if not text:
        return ""
    text = text.replace("-", "")
    if "/" in text:
        text = text.replace("/", "")
    text = _SPACE_RE.sub(" ", text).strip()
    return text


def normalize_symbol_key(value: str) -> str:
    """统一内部匹配 key，仅保留字母数字。"""
    text = normalize_bar_symbol(value)
    return _NON_ALNUM_RE.sub("", text)


def safe_symbol_storage_name(value: str) -> str:
    """统一文件名与缓存目录里的安全 symbol 名称。"""
    return normalize_symbol_key(value)


def same_symbol(left: str, right: str) -> bool:
    """判断两个 symbol 是否属于同一品种。"""
    left_key = normalize_symbol_key(left)
    right_key = normalize_symbol_key(right)
    return bool(left_key) and left_key == right_key


def is_crypto_symbol(value: str) -> bool:
    """粗略判断是否为加密合约品种。"""
    text = normalize_bar_symbol(value)
    return text.endswith(("USDT", "USDC", "BUSD"))

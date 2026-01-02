"""CCXT 适配器 - 使用全局限流器"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

import ccxt

from adapters.rate_limiter import acquire, release, set_ban, parse_ban

logger = logging.getLogger(__name__)

_clients: Dict[str, ccxt.Exchange] = {}
_symbols: Dict[str, List[str]] = {}
DEFAULT_PROXY = os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")


def get_client(exchange: str = "binance") -> ccxt.Exchange:
    if exchange not in _clients:
        cls = getattr(ccxt, exchange, None)
        if not cls:
            raise ValueError(f"不支持: {exchange}")
        _clients[exchange] = cls({
            "enableRateLimit": True,  # 保留内置限流作为双重保护
            "timeout": 30000,
            "proxies": {"http": DEFAULT_PROXY, "https": DEFAULT_PROXY} if DEFAULT_PROXY else None,
            "options": {"defaultType": "swap"},
        })
    return _clients[exchange]


# 币种过滤配置
SYMBOLS_MODE = os.getenv("SYMBOLS_MODE", "all").lower()
SYMBOLS_LIST = [s.strip().upper() for s in os.getenv("SYMBOLS", "").split(",") if s.strip()]


def _filter_symbols(symbols: List[str]) -> List[str]:
    """根据配置过滤币种"""
    if SYMBOLS_MODE == "whitelist" and SYMBOLS_LIST:
        return [s for s in symbols if s in SYMBOLS_LIST]
    elif SYMBOLS_MODE == "blacklist" and SYMBOLS_LIST:
        return [s for s in symbols if s not in SYMBOLS_LIST]
    return symbols


def load_symbols(exchange: str = "binance") -> List[str]:
    key = f"{exchange}_usdt"
    if key not in _symbols:
        acquire(5)
        try:
            client = get_client(exchange)
            client.load_markets()
            all_symbols = sorted({
                f"{m['base']}USDT" for m in client.markets.values()
                if m.get("swap") and m.get("settle") == "USDT" and m.get("linear")
            })
            _symbols[key] = _filter_symbols(all_symbols)
            logger.info("加载 %s USDT永续 %d 个 (模式=%s)", exchange, len(_symbols[key]), SYMBOLS_MODE)
        finally:
            release()
    return _symbols[key]


def fetch_ohlcv(exchange: str, symbol: str, interval: str = "1m", 
               since_ms: Optional[int] = None, limit: int = 1000) -> List[List]:
    symbol = symbol.upper()
    if not symbol.endswith("USDT"):
        return []
    
    ccxt_sym = f"{symbol[:-4]}/USDT:USDT"
    
    for attempt in range(3):
        acquire(2)
        try:
            return get_client(exchange).fetch_ohlcv(ccxt_sym, interval, since=since_ms, limit=limit)
        except ccxt.RateLimitExceeded as e:
            # ccxt 会抛出 429/418，解析错误信息
            err_str = str(e)
            if "418" in err_str:
                # 已被 ban，等待更长时间
                ban_time = parse_ban(err_str)
                set_ban(ban_time if ban_time > time.time() else time.time() + 120)
            else:
                # 429 警告，立即停止
                set_ban(time.time() + 60)
            if attempt == 2:
                logger.warning("fetch_ohlcv 限流: %s", e)
                return []
        except (ccxt.NetworkError, ccxt.ExchangeNotAvailable, ccxt.RequestTimeout) as e:
            if attempt == 2:
                logger.warning("fetch_ohlcv 网络错误: %s", e)
                return []
            time.sleep(1 * (2 ** attempt))
        finally:
            release()


def to_rows(exchange: str, symbol: str, candles: List[List], source: str = "ccxt") -> List[dict]:
    return [{
        "exchange": exchange, "symbol": symbol.upper(),
        "bucket_ts": datetime.fromtimestamp(c[0] / 1000, tz=timezone.utc),
        "open": float(c[1]), "high": float(c[2]), "low": float(c[3]), 
        "close": float(c[4]), "volume": float(c[5]),
        "quote_volume": None, "trade_count": None, "is_closed": True, "source": source,
        "taker_buy_volume": None, "taker_buy_quote_volume": None,
    } for c in candles if len(c) >= 6]


def normalize_symbol(symbol: str) -> Optional[str]:
    s = symbol.upper().replace("/", "").replace(":", "").replace("-", "")
    return s if s.endswith("USDT") else None


# 兼容旧代码
class _CompatLimiter:
    def acquire(self, w=1): acquire(w)
_limiter = _CompatLimiter()
_check_and_wait_ban = lambda: None
_parse_ban_time = parse_ban
_ban_until = 0
_ban_lock = None

async def async_acquire(weight: int = 1):
    await asyncio.to_thread(acquire, weight)

async def async_check_and_wait_ban():
    pass

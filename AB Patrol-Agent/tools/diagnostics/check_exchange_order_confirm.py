"""
检查交易所订单确认链的诊断脚本。

用途：
1. 使用执行服务同一套 .env 配置初始化交易所客户端
2. 查询指定订单号是否真实存在于交易所
3. 对比 fetch_order / fetch_open_orders / fetch_orders / native api 的返回差异
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import ccxt
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / "config" / ".env"


def _env_first(*keys: str, default: str = "") -> str:
    """按顺序读取环境变量。"""
    for key in keys:
        value = os.getenv(key)
        if value is not None and str(value).strip() != "":
            return str(value).strip()
    return default


def _is_true(value: str) -> bool:
    """解析布尔开关。"""
    return str(value).strip().lower() in {"1", "true", "yes", "on", "demo", "testnet"}


def _build_binance_client() -> tuple[Any, str, str]:
    """构建与执行服务一致的 Binance 客户端。"""
    load_dotenv(ENV_FILE, override=True)
    mode = _env_first("EXCHANGE_MODE", "AB_PATROL_EXECUTION_MODE").lower()
    binance_mode = _env_first("BINANCE_MODE", "AB_PATROL_BINANCE_MODE").lower()
    if not binance_mode:
        binance_mode = "demo" if _is_true(_env_first("AB_PATROL_BINANCE_TESTNET", default="1" if mode in {"", "demo"} else "0")) else "mainnet"
    if not mode:
        mode = "demo" if binance_mode in {"demo", "testnet"} else "mainnet"

    if binance_mode in {"demo", "testnet"}:
        api_key = _env_first("BINANCE_TESTNET_API_KEY", "AB_PATROL_BINANCE_API_KEY")
        secret = _env_first("BINANCE_TESTNET_SECRET", "AB_PATROL_BINANCE_API_SECRET")
    else:
        api_key = _env_first("BINANCE_API_KEY", "AB_PATROL_BINANCE_API_KEY")
        secret = _env_first("BINANCE_SECRET", "AB_PATROL_BINANCE_API_SECRET")

    client = ccxt.binanceusdm(
        {
            "apiKey": api_key,
            "secret": secret,
            "enableRateLimit": True,
            "options": {
                "defaultType": "future",
                "adjustForTimeDifference": True,
                "warnOnFetchOpenOrdersWithoutSymbol": False,
                "fetchCurrencies": False,
            },
        }
    )
    if binance_mode == "demo":
        client.enable_demo_trading(True)
    return client, mode, binance_mode


def _normalize_market_id(symbol: str) -> str:
    """从 symbol 直接推导 Binance 原生 market id，避免诊断脚本依赖 load_markets。"""
    text = str(symbol or "").strip().upper()
    if not text:
        return ""
    base = text.split(":", 1)[0]
    return base.replace("/", "")


def _order_matches_identifier(item: Any, order_id: str, client_order_id: str = "") -> bool:
    """统一判断订单列表项是否匹配目标订单。"""
    payload = item if isinstance(item, dict) else {}
    info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
    if order_id and any(
        str(candidate or "").strip() == str(order_id).strip()
        for candidate in (
            payload.get("id"),
            payload.get("orderId"),
            info.get("orderId"),
            info.get("id"),
        )
    ):
        return True
    if client_order_id and any(
        str(candidate or "").strip() == str(client_order_id).strip()
        for candidate in (
            payload.get("clientOrderId"),
            payload.get("client_order_id"),
            info.get("clientOrderId"),
            info.get("origClientOrderId"),
        )
    ):
        return True
    return False


def _safe_call(label: str, func) -> dict[str, Any]:
    """包装交易所调用，统一返回结构。"""
    try:
        value = func()
    except Exception as exc:  # pragma: no cover - 诊断脚本
        return {
            "label": label,
            "ok": False,
            "error_type": type(exc).__name__,
            "error": str(exc),
        }

    if isinstance(value, list):
        return {
            "label": label,
            "ok": True,
            "count": len(value),
            "items": value,
        }

    return {
        "label": label,
        "ok": True,
        "item": value,
    }


def main() -> int:
    """执行订单确认诊断。"""
    if len(sys.argv) < 3:
        print("用法: uv run --python .venv/bin/python --no-project python check_exchange_order_confirm.py <symbol> <order_id> [client_order_id]")
        return 1

    symbol = sys.argv[1]
    order_id = sys.argv[2]
    client_order_id = sys.argv[3] if len(sys.argv) >= 4 else ""

    client, mode, binance_mode = _build_binance_client()
    market_id = _normalize_market_id(symbol)

    result: dict[str, Any] = {
        "symbol": symbol,
        "order_id": order_id,
        "client_order_id": client_order_id,
        "exchange_mode": mode,
        "binance_mode": binance_mode,
        "market_id": market_id,
        "checks": [],
    }

    result["checks"].append(
        _safe_call("fetch_order", lambda: client.fetch_order(order_id, symbol))
    )
    result["checks"].append(
        _safe_call("fetch_open_orders", lambda: client.fetch_open_orders(symbol))
    )
    result["checks"].append(
        _safe_call("fetch_orders", lambda: client.fetch_orders(symbol, None, 50))
    )

    native_get = getattr(client, "fapiPrivateGetOrder", None)
    if callable(native_get):
        result["checks"].append(
            _safe_call("native_get_order", lambda: native_get({"symbol": market_id, "orderId": order_id}))
        )
        if client_order_id:
            result["checks"].append(
                _safe_call(
                    "native_get_order_by_client_id",
                    lambda: native_get({"symbol": market_id, "origClientOrderId": client_order_id}),
                )
            )

    native_all = getattr(client, "fapiPrivateGetAllOrders", None)
    if callable(native_all):
        result["checks"].append(
            _safe_call("native_all_orders", lambda: native_all({"symbol": market_id, "limit": 100}))
        )

    for check in result["checks"]:
        if not check.get("ok"):
            continue
        if "items" in check:
            items = check["items"] or []
            check["matched"] = [item for item in items if _order_matches_identifier(item, order_id, client_order_id)][:5]
            check.pop("items", None)

    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

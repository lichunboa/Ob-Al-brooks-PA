"""
cTrader Open API 同步客户端。

使用官方 protobuf 协议直接通过 SSL socket 与 cTrader Open API 通信，
避免在 execution-service 中引入 Twisted reactor 生命周期问题。
"""

from __future__ import annotations

import logging
import socket
import ssl
import struct
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from ctrader_open_api.endpoints import EndPoints
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoHeartbeatEvent, ProtoMessage
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAAccountAuthReq,
    ProtoOAAmendPositionSLTPReq,
    ProtoOAApplicationAuthReq,
    ProtoOAAssetListReq,
    ProtoOACancelOrderReq,
    ProtoOAClosePositionReq,
    ProtoOAExecutionEvent,
    ProtoOAGetAccountListByAccessTokenReq,
    ProtoOAGetPositionUnrealizedPnLReq,
    ProtoOAGetTrendbarsReq,
    ProtoOANewOrderReq,
    ProtoOAOrderErrorEvent,
    ProtoOAReconcileReq,
    ProtoOASymbolByIdReq,
    ProtoOASymbolsListReq,
    ProtoOATraderReq,
)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import (
    ProtoOAExecutionType,
    ProtoOAOrderStatus,
    ProtoOAOrderType,
    ProtoOAPositionStatus,
    ProtoOATradeSide,
    ProtoOATrendbarPeriod,
)
from ctrader_open_api.protobuf import Protobuf
from google.protobuf.message import Message

logger = logging.getLogger(__name__)


UNIT_SCALE = 100
QUOTE_TTL_SECONDS = 15
TREND_BAR_PRICE_SCALE = 100000.0
READ_RETRY_ATTEMPTS = 2
READ_RETRY_BACKOFF_SECONDS = 0.35
SESSION_IDLE_RECONNECT_SECONDS = 25


@dataclass(slots=True)
class CTraderSymbolMeta:
    """cTrader 品种元信息。"""

    symbol_id: int
    symbol_name: str
    description: str
    digits: int
    pip_position: int
    min_volume: int
    step_volume: int
    max_volume: int
    lot_size: int
    base_asset: str = ""
    quote_asset: str = ""

    @property
    def price_scale(self) -> float:
        return float(10**self.digits)

    @property
    def tick_size(self) -> float:
        return 1.0 / self.price_scale if self.price_scale else 0.0

    @property
    def quantity_step(self) -> float:
        return self.step_volume / UNIT_SCALE if self.step_volume else 0.0

    @property
    def min_quantity(self) -> float:
        return self.min_volume / UNIT_SCALE if self.min_volume else 0.0

    @property
    def max_quantity(self) -> float:
        return self.max_volume / UNIT_SCALE if self.max_volume else 0.0

    @property
    def lot_quantity(self) -> float:
        return self.lot_size / UNIT_SCALE if self.lot_size else 0.0


class CTraderOpenAPIError(RuntimeError):
    """cTrader Open API 调用失败。"""


class CTraderOpenAPIClient:
    """同步版 cTrader Open API 客户端。"""

    SYMBOL_ALIASES = {
        "US30": "US 30",
        "US500": "US 500",
        "SPX500": "US 500",
        "NAS100": "US TECH 100",
        "US100": "US TECH 100",
        "GER40": "GERMANY 40",
        "DAX40": "GERMANY 40",
        "UK100": "UK 100",
        "JP225": "JAPAN 225",
    }

    def __init__(self, config: dict[str, Any]):
        self.client_id = str(config.get("client_id") or "").strip()
        self.client_secret = str(config.get("client_secret") or "").strip()
        self.access_token = str(config.get("access_token") or "").strip()
        self.configured_account_id = str(config.get("account_id") or "").strip()
        self.demo = bool(config.get("demo", False))
        self.timeout = float(config.get("timeout_seconds") or 15)

        self.host = EndPoints.PROTOBUF_DEMO_HOST if self.demo else EndPoints.PROTOBUF_LIVE_HOST
        self.port = EndPoints.PROTOBUF_PORT

        self._lock = threading.RLock()
        self._socket: ssl.SSLSocket | None = None
        self._ctx = ssl.create_default_context()
        self._authenticated = False
        self._account_id: int | None = None
        self._trader_info: dict[str, Any] = {}
        self._assets_by_id: dict[int, dict[str, Any]] = {}
        self._light_symbols_by_id: dict[int, dict[str, Any]] = {}
        self._light_symbols_by_key: dict[str, dict[str, Any]] = {}
        self._symbols_by_id: dict[int, CTraderSymbolMeta] = {}
        self._symbols_by_key: dict[str, CTraderSymbolMeta] = {}
        self._quote_cache: dict[int, dict[str, Any]] = {}
        self._last_activity = 0.0

    @property
    def account_id(self) -> int:
        self.ensure_session()
        if self._account_id is None:
            raise CTraderOpenAPIError("cTrader 账户未授权")
        return self._account_id

    def close(self) -> None:
        """主动关闭底层连接。"""
        with self._lock:
            current_socket = self._socket
            self._socket = None
            self._authenticated = False
            if current_socket is not None:
                try:
                    current_socket.close()
                except OSError:
                    pass

    def ensure_session(self) -> None:
        """确保 socket 已连接且账号已认证。"""
        with self._lock:
            if self._authenticated and self._socket is not None:
                idle_seconds = time.time() - self._last_activity if self._last_activity else 0.0
                if idle_seconds >= SESSION_IDLE_RECONNECT_SECONDS:
                    logger.info("cTrader 连接空闲 %.1fs，主动重连", idle_seconds)
                    self._reconnect_locked()
                return
            self._reconnect_locked()

    def get_symbol_meta(self, symbol: str) -> CTraderSymbolMeta:
        """解析并返回品种元信息。"""
        return self._with_read_retry("get_symbol_meta", lambda: self._get_symbol_meta_once(symbol))

    def normalize_symbol_name(self, symbol: str) -> str:
        """返回账户实际可交易的品种名。"""
        return self.get_symbol_meta(symbol).symbol_name

    def quantity_to_volume(self, symbol: str, quantity: float) -> int:
        """将业务数量转换为 cTrader volume 整数。"""
        meta = self.get_symbol_meta(symbol)
        desired = max(0.0, float(quantity or 0))
        volume = int(round(desired * UNIT_SCALE))
        if volume <= 0:
            return 0
        step = meta.step_volume or 1
        snapped = max(meta.min_volume, (volume // step) * step)
        if snapped < meta.min_volume:
            snapped = meta.min_volume
        if meta.max_volume and snapped > meta.max_volume:
            snapped = meta.max_volume
        return int(snapped)

    @staticmethod
    def volume_to_quantity(volume: int | float) -> float:
        """将 cTrader volume 转回业务数量。"""
        return float(volume or 0) / UNIT_SCALE

    def quantity_to_lots(self, symbol: str, quantity: float) -> float:
        """将业务数量换算为 lots。"""
        meta = self.get_symbol_meta(symbol)
        if meta.lot_quantity <= 0:
            return 0.0
        return float(quantity or 0) / meta.lot_quantity

    def lots_to_quantity(self, symbol: str, lots: float) -> float:
        """将 lots 换算为业务数量。"""
        meta = self.get_symbol_meta(symbol)
        return float(lots or 0) * meta.lot_quantity

    def get_account_info(self) -> dict[str, Any]:
        """获取账户余额与保证金概览。"""
        trader, positions, _orders = self._with_read_retry("get_account_info", self._get_account_snapshot_once)
        balance = float(trader.get("balance", 0))
        pnl_total = sum(float(item.get("unrealized_pnl", 0) or 0) for item in positions)
        margin = sum(float(item.get("margin", 0) or 0) for item in positions)
        equity = balance + pnl_total
        free_margin = equity - margin
        margin_level = equity / margin if margin > 0 else 0.0
        return {
            "account_id": self.account_id,
            "balance": balance,
            "equity": equity,
            "margin": margin,
            "free_margin": free_margin,
            "margin_level": margin_level,
            "deposit_asset": trader.get("deposit_asset", "USD"),
            "positions": positions,
            "leverage": trader.get("max_leverage"),
        }

    def get_account_snapshot(self) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
        """获取交易员信息、持仓与挂单快照。"""
        return self._with_read_retry("get_account_snapshot", self._get_account_snapshot_once)

    def _get_account_snapshot_once(self) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
        """单次获取交易员信息、持仓与挂单快照。"""
        self.ensure_session()
        with self._lock:
            trader_res = self._send_request_locked(ProtoOATraderReq(ctidTraderAccountId=self.account_id))
            reconcile = self._send_request_locked(ProtoOAReconcileReq(ctidTraderAccountId=self.account_id), timeout=20)
            positions = list(reconcile.position)
            unrealized_map: dict[int, float] = {}
            if positions:
                pnl_res = self._send_request_locked(
                    ProtoOAGetPositionUnrealizedPnLReq(ctidTraderAccountId=self.account_id),
                    timeout=20,
                )
                money_digits = int(getattr(pnl_res, "moneyDigits", 0) or 0)
                for item in pnl_res.positionUnrealizedPnL:
                    unrealized_map[int(item.positionId)] = self._scaled_money(item.netUnrealizedPnL, money_digits)

            trader = self._parse_trader(trader_res.trader)
            position_rows = [self._parse_position(item, unrealized_map) for item in positions]
            order_rows = [self._parse_order(item) for item in reconcile.order]
            return trader, position_rows, order_rows

    def get_positions(self) -> list[dict[str, Any]]:
        """返回当前持仓。"""
        _trader, positions, _orders = self.get_account_snapshot()
        return positions

    def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """返回未成交订单。"""
        _trader, _positions, orders = self.get_account_snapshot()
        if not symbol:
            return orders
        normalized = self.normalize_symbol_name(symbol)
        return [item for item in orders if str(item.get("symbol")) == normalized]

    def place_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        order_type: str = "MARKET",
        price: float | None = None,
        stop_loss: float | None = None,
        take_profit: float | None = None,
        comment: str = "",
        label: str = "",
    ) -> dict[str, Any]:
        """提交订单。"""
        def _submit_once() -> dict[str, Any]:
            meta = self.get_symbol_meta(symbol)
            volume = self.quantity_to_volume(symbol, quantity)
            if volume <= 0:
                return self._error_result("无效下单数量")

            request = ProtoOANewOrderReq(
                ctidTraderAccountId=self.account_id,
                symbolId=meta.symbol_id,
                orderType=self._map_order_type(order_type),
                tradeSide=self._map_trade_side(side),
                volume=volume,
                label=label,
                comment=comment,
            )
            if price is not None:
                if order_type.upper() == "LIMIT":
                    request.limitPrice = float(price)
                elif order_type.upper() in {"STOP", "STOP_MARKET"}:
                    request.stopPrice = float(price)
            if stop_loss is not None:
                request.stopLoss = float(stop_loss)
            if take_profit is not None:
                request.takeProfit = float(take_profit)

            with self._lock:
                response = self._send_request_locked(request, timeout=20)
            return self._parse_execution_response(response, requested_quantity=quantity)

        return self._with_session_retry("place_order", _submit_once)

    def close_position(self, symbol: str, quantity: float | None = None) -> dict[str, Any]:
        """按品种平仓。"""
        def _close_once() -> dict[str, Any]:
            target = self._find_position(symbol)
            if target is None:
                return self._error_result("未找到持仓")
            close_quantity = quantity if quantity is not None else float(target.get("quantity", 0) or 0)
            volume = self.quantity_to_volume(str(target.get("symbol") or symbol), close_quantity)
            if volume <= 0:
                return self._error_result("无效平仓数量")
            request = ProtoOAClosePositionReq(
                ctidTraderAccountId=self.account_id,
                positionId=int(target.get("position_id") or 0),
                volume=volume,
            )
            with self._lock:
                response = self._send_request_locked(request, timeout=20)
            return self._parse_execution_response(response, requested_quantity=close_quantity)

        return self._with_session_retry("close_position", _close_once)

    def modify_position(
        self,
        symbol: str,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict[str, Any]:
        """修改持仓止损止盈。"""
        def _modify_once() -> dict[str, Any]:
            target = self._find_position(symbol)
            if target is None:
                return {"success": False, "error": "未找到持仓"}
            request = ProtoOAAmendPositionSLTPReq(
                ctidTraderAccountId=self.account_id,
                positionId=int(target.get("position_id") or 0),
            )
            if stop_loss is not None:
                request.stopLoss = float(stop_loss)
            if take_profit is not None:
                request.takeProfit = float(take_profit)
            with self._lock:
                response = self._send_request_locked(request, timeout=20)
            if isinstance(response, ProtoOAExecutionEvent):
                return {"success": not bool(response.errorCode), "error": response.errorCode or None}
            if isinstance(response, ProtoOAOrderErrorEvent):
                return {"success": False, "error": response.errorCode or response.description or "modify failed"}
            return {"success": True, "error": None}

        return self._with_session_retry("modify_position", _modify_once)

    def cancel_order(self, order_id: str | int) -> dict[str, Any]:
        """取消单个订单。"""
        def _cancel_once() -> dict[str, Any]:
            if not str(order_id or "").strip():
                return {"success": False, "error": "缺少 order_id"}
            request = ProtoOACancelOrderReq(
                ctidTraderAccountId=self.account_id,
                orderId=int(order_id),
            )
            with self._lock:
                response = self._send_request_locked(request, timeout=20)
            if isinstance(response, ProtoOAExecutionEvent):
                return {"success": not bool(response.errorCode), "error": response.errorCode or None}
            if isinstance(response, ProtoOAOrderErrorEvent):
                return {"success": False, "error": response.errorCode or response.description or "cancel failed"}
            return {"success": True, "error": None}

        return self._with_session_retry("cancel_order", _cancel_once)

    def cancel_all_orders(self, symbol: str | None = None) -> dict[str, Any]:
        """取消全部挂单。"""
        orders = self.get_open_orders(symbol)
        cancelled = 0
        last_error = None
        for item in orders:
            result = self.cancel_order(item.get("order_id"))
            if result.get("success"):
                cancelled += 1
            elif not last_error:
                last_error = result.get("error")
        return {
            "success": last_error is None,
            "cancelled_count": cancelled,
            "error": last_error,
        }

    def get_market_price(self, symbol: str) -> float | None:
        """获取中间价。"""
        meta = self.get_symbol_meta(symbol)
        cached = self._quote_cache.get(meta.symbol_id)
        if cached and time.time() - float(cached.get("ts") or 0) <= QUOTE_TTL_SECONDS:
            bid = float(cached.get("bid") or 0)
            ask = float(cached.get("ask") or 0)
            if bid > 0 and ask > 0:
                return (bid + ask) / 2
        bars = self.get_trendbars(symbol, interval="1m", limit=1)
        if bars:
            return float(bars[-1].get("close", 0) or 0)
        return None

    def get_symbol_info(self, symbol: str) -> dict[str, Any]:
        """返回执行层所需的品种规格。"""
        meta = self.get_symbol_meta(symbol)
        return {
            "symbol": meta.symbol_name,
            "symbol_id": meta.symbol_id,
            "base_asset": meta.base_asset,
            "quote_asset": meta.quote_asset,
            "min_quantity": meta.min_quantity,
            "max_quantity": meta.max_quantity,
            "quantity_step": meta.quantity_step,
            "tick_size": meta.tick_size,
            "lot_size": meta.lot_quantity,
        }

    def get_trendbars(self, symbol: str, interval: str = "1h", limit: int = 50) -> list[dict[str, Any]]:
        """读取 cTrader trendbars 并转换为统一 OHLC。"""
        return self._with_read_retry(
            "get_trendbars",
            lambda: self._get_trendbars_once(symbol, interval=interval, limit=limit),
        )

    def _get_trendbars_once(self, symbol: str, interval: str = "1h", limit: int = 50) -> list[dict[str, Any]]:
        """单次读取 cTrader trendbars 并转换为统一 OHLC。"""
        meta = self.get_symbol_meta(symbol)
        period = self._map_interval(interval)
        now_ms = int(time.time() * 1000)
        with self._lock:
            response = self._send_request_locked(
                ProtoOAGetTrendbarsReq(
                    ctidTraderAccountId=self.account_id,
                    fromTimestamp=0,
                    toTimestamp=now_ms,
                    period=period,
                    symbolId=meta.symbol_id,
                    count=max(2, min(limit, 200)),
                ),
                timeout=20,
            )
        bars: list[dict[str, Any]] = []
        scale = TREND_BAR_PRICE_SCALE
        for item in response.trendbar:
            low = float(item.low) / scale
            open_price = float(item.low + item.deltaOpen) / scale
            close_price = float(item.low + item.deltaClose) / scale
            high_price = float(item.low + item.deltaHigh) / scale
            timestamp = datetime.fromtimestamp(int(item.utcTimestampInMinutes) * 60, tz=UTC)
            bars.append(
                {
                    "time": timestamp.isoformat(),
                    "timestamp": int(timestamp.timestamp() * 1000),
                    "open": open_price,
                    "high": high_price,
                    "low": low,
                    "close": close_price,
                    "volume": int(item.volume),
                }
            )
        return bars[-limit:]

    def _find_position(self, symbol: str) -> dict[str, Any] | None:
        normalized = self.normalize_symbol_name(symbol)
        for item in self.get_positions():
            if str(item.get("symbol")) == normalized:
                return item
        return None

    def _reconnect_locked(self) -> None:
        if self._socket is not None:
            try:
                self._socket.close()
            except OSError:
                pass
        self._socket = None
        self._authenticated = False
        raw_socket = socket.create_connection((self.host, self.port), timeout=self.timeout)
        self._configure_keepalive(raw_socket)
        wrapped = self._ctx.wrap_socket(raw_socket, server_hostname=self.host)
        wrapped.settimeout(self.timeout)
        self._socket = wrapped
        self._authenticate_locked()
        self._authenticated = True

    def _authenticate_locked(self) -> None:
        if not self.client_id or not self.client_secret or not self.access_token:
            raise CTraderOpenAPIError("缺少 cTrader API 凭证")
        self._send_request_locked(
            ProtoOAApplicationAuthReq(clientId=self.client_id, clientSecret=self.client_secret),
            timeout=10,
        )
        accounts = self._send_request_locked(
            ProtoOAGetAccountListByAccessTokenReq(accessToken=self.access_token),
            timeout=10,
        )
        account_id = self._select_account_id(accounts)
        self._send_request_locked(
            ProtoOAAccountAuthReq(ctidTraderAccountId=account_id, accessToken=self.access_token),
            timeout=10,
        )
        self._account_id = account_id
        self._load_assets_locked()
        self._load_symbols_locked()

    def _select_account_id(self, accounts_response: Message) -> int:
        configured = int(self.configured_account_id) if self.configured_account_id.isdigit() else None
        demo_target = not self.demo
        candidates: list[tuple[int, bool]] = []
        for item in accounts_response.ctidTraderAccount:
            account_id = int(item.ctidTraderAccountId)
            is_live = bool(item.isLive)
            candidates.append((account_id, is_live))
        if configured is not None:
            for account_id, _is_live in candidates:
                if account_id == configured:
                    return account_id
        for account_id, is_live in candidates:
            if is_live == demo_target:
                return account_id
        if not candidates:
            raise CTraderOpenAPIError("access_token 未返回可用 cTrader 账户")
        return candidates[0][0]

    def _load_assets_locked(self) -> None:
        if self._account_id is None:
            raise CTraderOpenAPIError("cTrader 账户未初始化")
        response = self._send_request_locked(ProtoOAAssetListReq(ctidTraderAccountId=self._account_id), timeout=10)
        assets: dict[int, dict[str, Any]] = {}
        for item in response.asset:
            assets[int(item.assetId)] = {
                "asset_id": int(item.assetId),
                "name": str(item.name or ""),
                "display_name": str(item.displayName or item.name or ""),
                "digits": int(item.digits or 0),
            }
        self._assets_by_id = assets

    def _load_symbols_locked(self) -> None:
        if self._account_id is None:
            raise CTraderOpenAPIError("cTrader 账户未初始化")
        response = self._send_request_locked(
            ProtoOASymbolsListReq(ctidTraderAccountId=self._account_id, includeArchivedSymbols=False),
            timeout=25,
        )
        light_by_id: dict[int, dict[str, Any]] = {}
        light_by_key: dict[str, dict[str, Any]] = {}
        for item in response.symbol:
            symbol_id = int(item.symbolId)
            payload = {
                "symbol_id": symbol_id,
                "symbol_name": str(item.symbolName or f"#{symbol_id}"),
                "description": str(item.description or ""),
                "base_asset_id": int(getattr(item, "baseAssetId", 0) or 0),
                "quote_asset_id": int(getattr(item, "quoteAssetId", 0) or 0),
            }
            light_by_id[symbol_id] = payload
            light_by_key[self._normalize_symbol_key(payload["symbol_name"])] = payload
        self._light_symbols_by_id = light_by_id
        self._light_symbols_by_key = light_by_key

    def _refresh_symbol_meta(self, symbol: str) -> None:
        with self._lock:
            light = self._resolve_light_symbol_locked(symbol)
            response = self._send_request_locked(
                ProtoOASymbolByIdReq(
                    ctidTraderAccountId=self.account_id,
                    symbolId=[int(light["symbol_id"])],
                ),
                timeout=10,
            )
            detail = response.symbol[0]
            meta = CTraderSymbolMeta(
                symbol_id=int(detail.symbolId),
                symbol_name=str(light["symbol_name"]),
                description=str(light["description"]),
                digits=int(detail.digits or 0),
                pip_position=int(detail.pipPosition or 0),
                min_volume=int(detail.minVolume or 0),
                step_volume=int(detail.stepVolume or 0),
                max_volume=int(detail.maxVolume or 0),
                lot_size=int(detail.lotSize or 0),
                base_asset=self._asset_name(int(light["base_asset_id"])),
                quote_asset=self._asset_name(int(light["quote_asset_id"])),
            )
            self._symbols_by_id[meta.symbol_id] = meta
            self._symbols_by_key[self._normalize_symbol_key(meta.symbol_name)] = meta

    def _resolve_light_symbol_locked(self, symbol: str) -> dict[str, Any]:
        normalized = self._normalize_symbol_key(symbol)
        light = self._light_symbols_by_key.get(normalized)
        if light:
            return light
        self._load_symbols_locked()
        light = self._light_symbols_by_key.get(normalized)
        if light is None:
            raise CTraderOpenAPIError(f"cTrader 未找到品种: {symbol}")
        return light

    def _asset_name(self, asset_id: int) -> str:
        asset = self._assets_by_id.get(asset_id, {})
        return str(asset.get("display_name") or asset.get("name") or "")

    def _get_symbol_meta_once(self, symbol: str) -> CTraderSymbolMeta:
        """单次解析并返回品种元信息。"""
        self.ensure_session()
        normalized = self._normalize_symbol_key(symbol)
        meta = self._symbols_by_key.get(normalized)
        if meta:
            return meta
        self._refresh_symbol_meta(symbol)
        meta = self._symbols_by_key.get(normalized)
        if meta is None:
            raise CTraderOpenAPIError(f"cTrader 未找到品种: {symbol}")
        return meta

    def _with_read_retry(self, operation_name: str, func):
        """对只读操作执行一次重连重试。"""
        return self._with_session_retry(operation_name, func)

    def _with_session_retry(self, operation_name: str, func):
        """对连接级错误执行一次重连重试。"""
        last_exc: Exception | None = None
        for attempt in range(1, READ_RETRY_ATTEMPTS + 1):
            try:
                return func()
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt >= READ_RETRY_ATTEMPTS or not self._is_retryable_session_error(exc):
                    raise
                logger.warning(
                    "cTrader %s 失败，准备重连后重试 (%s/%s): %s",
                    operation_name,
                    attempt,
                    READ_RETRY_ATTEMPTS,
                    exc,
                )
                with self._lock:
                    self.close()
                    time.sleep(READ_RETRY_BACKOFF_SECONDS * attempt)
                    self._reconnect_locked()
        if last_exc is not None:
            raise last_exc
        raise CTraderOpenAPIError(f"cTrader {operation_name} 未执行")

    @staticmethod
    def _is_retryable_session_error(exc: Exception) -> bool:
        """判断是否属于连接级瞬时错误。"""
        if isinstance(exc, (TimeoutError, OSError, ssl.SSLError)):
            return True
        text = str(exc).upper()
        markers = (
            "EOF",
            "BROKEN PIPE",
            "TIMED OUT",
            "TIMEOUT",
            "CONNECTION RESET",
            "CONNECTION ABORTED",
            "CONNECTION CLOSED",
            "未连接",
            "连接已关闭",
            "SOCKET",
            "SSL",
        )
        return any(marker in text for marker in markers)

    @staticmethod
    def _configure_keepalive(raw_socket: socket.socket) -> None:
        """尽量启用 TCP keepalive，降低长连接被中间层回收的概率。"""
        try:
            raw_socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            options = (
                ("TCP_KEEPALIVE", 30),
                ("TCP_KEEPIDLE", 30),
                ("TCP_KEEPINTVL", 10),
                ("TCP_KEEPCNT", 3),
            )
            for option_name, option_value in options:
                if hasattr(socket, option_name):
                    raw_socket.setsockopt(socket.IPPROTO_TCP, getattr(socket, option_name), option_value)
        except OSError:
            logger.debug("当前平台不支持完整 TCP keepalive 配置")

    def _send_request_locked(self, payload: Message, timeout: float = 15) -> Message:
        if self._socket is None:
            raise CTraderOpenAPIError("cTrader socket 未连接")
        client_msg_id = uuid.uuid4().hex
        envelope = ProtoMessage(
            payloadType=payload.payloadType,
            payload=payload.SerializeToString(),
            clientMsgId=client_msg_id,
        )
        blob = envelope.SerializeToString()
        try:
            self._socket.sendall(struct.pack("!I", len(blob)) + blob)
            self._last_activity = time.time()
            return self._receive_matching_message_locked(client_msg_id=client_msg_id, timeout=timeout)
        except (OSError, ssl.SSLError, TimeoutError, CTraderOpenAPIError) as exc:
            self.close()
            raise CTraderOpenAPIError(str(exc)) from exc

    def _receive_matching_message_locked(self, client_msg_id: str, timeout: float) -> Message:
        start = time.time()
        while True:
            elapsed = time.time() - start
            if elapsed >= timeout:
                raise TimeoutError("等待 cTrader 响应超时")
            remaining = max(0.1, timeout - elapsed)
            envelope = self._read_envelope_locked(timeout=remaining)
            payload = Protobuf.extract(envelope)
            if envelope.clientMsgId == client_msg_id:
                return payload
            self._handle_async_message(payload)

    def _receive_until_locked(self, predicate, timeout: float) -> Message:
        start = time.time()
        while True:
            elapsed = time.time() - start
            if elapsed >= timeout:
                raise TimeoutError("等待 cTrader 异步事件超时")
            remaining = max(0.1, timeout - elapsed)
            envelope = self._read_envelope_locked(timeout=remaining)
            payload = Protobuf.extract(envelope)
            self._handle_async_message(payload)
            if predicate(payload):
                return payload

    def _read_envelope_locked(self, timeout: float) -> ProtoMessage:
        if self._socket is None:
            raise CTraderOpenAPIError("cTrader socket 未连接")
        self._socket.settimeout(timeout)
        while True:
            size = struct.unpack("!I", self._recv_exact_locked(4))[0]
            body = self._recv_exact_locked(size)
            envelope = ProtoMessage()
            envelope.ParseFromString(body)
            if envelope.payloadType == ProtoHeartbeatEvent().payloadType:
                self._send_heartbeat_locked()
                continue
            self._last_activity = time.time()
            return envelope

    def _recv_exact_locked(self, size: int) -> bytes:
        if self._socket is None:
            raise CTraderOpenAPIError("cTrader socket 未连接")
        chunks: list[bytes] = []
        remaining = size
        while remaining > 0:
            data = self._socket.recv(remaining)
            if not data:
                raise CTraderOpenAPIError("cTrader 连接已关闭")
            chunks.append(data)
            remaining -= len(data)
        return b"".join(chunks)

    def _send_heartbeat_locked(self) -> None:
        if self._socket is None:
            return
        payload = ProtoHeartbeatEvent()
        envelope = ProtoMessage(payloadType=payload.payloadType, payload=payload.SerializeToString())
        blob = envelope.SerializeToString()
        try:
            self._socket.sendall(struct.pack("!I", len(blob)) + blob)
            self._last_activity = time.time()
        except (OSError, ssl.SSLError):
            self.close()

    def _handle_async_message(self, payload: Message) -> None:
        self._extract_spot_price(payload, None)

    def _extract_spot_price(self, payload: Message, meta: CTraderSymbolMeta | None) -> float | None:
        if not hasattr(payload, "symbolId") or not hasattr(payload, "bid") or not hasattr(payload, "ask"):
            return None
        symbol_id = int(getattr(payload, "symbolId", 0) or 0)
        target_meta = meta or self._symbols_by_id.get(symbol_id)
        if target_meta is None:
            return None
        bid = float(getattr(payload, "bid", 0) or 0) / target_meta.price_scale
        ask = float(getattr(payload, "ask", 0) or 0) / target_meta.price_scale
        self._quote_cache[symbol_id] = {"bid": bid, "ask": ask, "ts": time.time()}
        if bid > 0 and ask > 0:
            return (bid + ask) / 2
        return None

    def _parse_trader(self, trader: Message) -> dict[str, Any]:
        money_digits = int(getattr(trader, "moneyDigits", 0) or 0)
        deposit_asset = self._asset_name(int(getattr(trader, "depositAssetId", 0) or 0))
        leverage_in_cents = int(getattr(trader, "leverageInCents", 0) or 0)
        return {
            "account_id": int(getattr(trader, "ctidTraderAccountId", 0) or 0),
            "balance": self._scaled_money(getattr(trader, "balance", 0), money_digits),
            "money_digits": money_digits,
            "deposit_asset": deposit_asset or "USD",
            "max_leverage": leverage_in_cents / 100 if leverage_in_cents else None,
        }

    def _parse_position(self, position: Message, unrealized_map: dict[int, float]) -> dict[str, Any]:
        symbol_id = int(position.tradeData.symbolId)
        meta = self._symbols_by_id.get(symbol_id)
        light = self._light_symbols_by_id.get(symbol_id, {})
        symbol_name = meta.symbol_name if meta else str(light.get("symbol_name") or symbol_id)
        money_digits = int(getattr(position, "moneyDigits", 0) or 0)
        position_id = int(getattr(position, "positionId", 0) or 0)
        side = "BUY" if int(position.tradeData.tradeSide) == int(ProtoOATradeSide.BUY) else "SELL"
        current_price = self._get_cached_mid_price(symbol_id)
        if current_price is None:
            current_price = float(getattr(position, "price", 0) or 0)
        return {
            "position_id": str(position_id),
            "symbol": symbol_name,
            "side": side,
            "quantity": self.volume_to_quantity(position.tradeData.volume),
            "entry_price": float(getattr(position, "price", 0) or 0),
            "current_price": current_price,
            "stop_loss": float(getattr(position, "stopLoss", 0) or 0) or None,
            "take_profit": float(getattr(position, "takeProfit", 0) or 0) or None,
            "margin": self._scaled_money(getattr(position, "usedMargin", 0), money_digits),
            "unrealized_pnl": float(unrealized_map.get(position_id, 0.0)),
        }

    def _parse_order(self, order: Message) -> dict[str, Any]:
        symbol_id = int(order.tradeData.symbolId)
        meta = self._symbols_by_id.get(symbol_id)
        light = self._light_symbols_by_id.get(symbol_id, {})
        symbol_name = meta.symbol_name if meta else str(light.get("symbol_name") or symbol_id)
        quantity = self.volume_to_quantity(order.tradeData.volume)
        status = ProtoOAOrderStatus.Name(int(order.orderStatus)) if int(order.orderStatus) else "UNKNOWN"
        side = "BUY" if int(order.tradeData.tradeSide) == int(ProtoOATradeSide.BUY) else "SELL"
        order_type = ProtoOAOrderType.Name(int(order.orderType)) if int(order.orderType) else "UNKNOWN"
        return {
            "order_id": str(int(order.orderId)),
            "symbol": symbol_name,
            "side": side,
            "type": order_type,
            "quantity": quantity,
            "price": float(getattr(order, "limitPrice", 0) or getattr(order, "stopPrice", 0) or 0) or None,
            "filled_quantity": self.volume_to_quantity(getattr(order, "executedVolume", 0) or 0),
            "status": status,
        }

    def _parse_execution_response(self, response: Message, requested_quantity: float) -> dict[str, Any]:
        if isinstance(response, ProtoOAOrderErrorEvent):
            return self._error_result(response.errorCode or response.description or "order rejected")
        if not isinstance(response, ProtoOAExecutionEvent):
            return self._error_result(f"unexpected response: {type(response).__name__}")
        if response.errorCode:
            return self._error_result(response.errorCode)
        order_id = None
        filled_price = None
        filled_quantity = requested_quantity
        if getattr(response, "order", None) and getattr(response.order, "orderId", 0):
            order_id = str(int(response.order.orderId))
            filled_price = float(getattr(response.order, "executionPrice", 0) or 0) or None
            executed_volume = int(getattr(response.order, "executedVolume", 0) or 0)
            if executed_volume > 0:
                filled_quantity = self.volume_to_quantity(executed_volume)
        if getattr(response, "deal", None) and getattr(response.deal, "executionPrice", 0):
            filled_price = float(response.deal.executionPrice)
            if int(getattr(response.deal, "filledVolume", 0) or 0) > 0:
                filled_quantity = self.volume_to_quantity(response.deal.filledVolume)
            if not order_id and getattr(response.deal, "orderId", 0):
                order_id = str(int(response.deal.orderId))
        if not order_id and getattr(response, "position", None) and getattr(response.position, "positionId", 0):
            order_id = str(int(response.position.positionId))
        execution_name = ProtoOAExecutionType.Name(int(response.executionType)) if int(response.executionType) else "UNKNOWN"
        return {
            "success": True,
            "status": execution_name,
            "order_id": order_id,
            "filled_quantity": filled_quantity,
            "filled_price": filled_price,
            "error": None,
        }

    @staticmethod
    def _error_result(error: str) -> dict[str, Any]:
        return {
            "success": False,
            "status": "FAILED",
            "order_id": None,
            "filled_quantity": None,
            "filled_price": None,
            "error": str(error),
        }

    @staticmethod
    def _scaled_money(value: int | float, digits: int) -> float:
        scale = 10**int(digits or 0)
        return float(value or 0) / scale if scale else float(value or 0)

    def _get_cached_mid_price(self, symbol_id: int) -> float | None:
        """从本地报价缓存读取中间价。"""
        cached = self._quote_cache.get(symbol_id)
        if not cached or time.time() - float(cached.get("ts") or 0) > QUOTE_TTL_SECONDS:
            return None
        bid = float(cached.get("bid") or 0)
        ask = float(cached.get("ask") or 0)
        if bid > 0 and ask > 0:
            return (bid + ask) / 2
        return None

    def _normalize_symbol_key(self, symbol: str) -> str:
        raw = str(symbol or "").strip().upper()
        if not raw:
            return raw
        compact = raw.replace("/", "").replace("-", "").replace("_", "").replace(" ", "")
        compact = compact.replace("USDT", "USD")
        compact = self.SYMBOL_ALIASES.get(compact, compact)
        return compact.replace("/", "").replace("-", "").replace("_", "").replace(" ", "")

    @staticmethod
    def _map_order_type(order_type: str) -> int:
        normalized = str(order_type or "MARKET").upper()
        if normalized == "LIMIT":
            return ProtoOAOrderType.LIMIT
        if normalized in {"STOP", "STOP_MARKET"}:
            return ProtoOAOrderType.STOP
        return ProtoOAOrderType.MARKET

    @staticmethod
    def _map_trade_side(side: str) -> int:
        return ProtoOATradeSide.BUY if str(side or "").upper() == "BUY" else ProtoOATradeSide.SELL

    @staticmethod
    def _map_interval(interval: str) -> int:
        mapping = {
            "1m": ProtoOATrendbarPeriod.M1,
            "5m": ProtoOATrendbarPeriod.M5,
            "15m": ProtoOATrendbarPeriod.M15,
            "30m": ProtoOATrendbarPeriod.M30,
            "1h": ProtoOATrendbarPeriod.H1,
            "4h": ProtoOATrendbarPeriod.H4,
            "1d": ProtoOATrendbarPeriod.D1,
        }
        return mapping.get(str(interval or "1h").lower(), ProtoOATrendbarPeriod.H1)

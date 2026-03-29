"""
交易执行器 - 支持 Binance / OKX / cTrader
"""
import asyncio
import logging
from typing import Any, Optional
import ccxt

from .config import (
    EXCHANGE, EXCHANGE_MODE,
    OKX_API_KEY, OKX_SECRET, OKX_PASSPHRASE,
    BINANCE_API_KEY, BINANCE_SECRET, BINANCE_MODE,
    CTRADER_ACCESS_TOKEN, CTRADER_ACCOUNT_ID, CTRADER_BASE_URL,
    CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_DEMO, ACCOUNT_ASSET,
)
from .models import OrderRequest, OrderResponse, OrderSide, OrderType, Position, PositionSide
from .risk_manager import RiskManager
from .trading_state import get_trading_state_manager
from .bot_registry import BotRegistryMixin
from .kline_analyzer import KlineAnalyzerMixin
from .exchange_block_mixin import ExchangeBlockMixin
from .protection_registry_mixin import ProtectionRegistryMixin
from .execution_query_mixin import ExecutionQueryMixin
from .execution_order_mixin import ExecutionOrderMixin
from .execution_market_mixin import ExecutionMarketMixin
from .execution_protection_mixin import ExecutionProtectionMixin

logger = logging.getLogger(__name__)

_CTRADER_ADAPTER_CLASS: Any | None = None


def _load_ctrader_adapter() -> Any:
    """仅在 cTrader 模式下延迟加载适配器，避免币安监控被额外依赖阻塞。"""
    global _CTRADER_ADAPTER_CLASS
    if _CTRADER_ADAPTER_CLASS is not None:
        return _CTRADER_ADAPTER_CLASS
    try:
        from exchange.adapters.ctrader_adapter import CTraderAdapter  # type: ignore
    except ModuleNotFoundError:  # pragma: no cover - 兼容直接进入服务目录执行
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parents[3]
        if str(root) not in sys.path:
            sys.path.append(str(root))
        from exchange.adapters.ctrader_adapter import CTraderAdapter  # type: ignore
    _CTRADER_ADAPTER_CLASS = CTraderAdapter
    return _CTRADER_ADAPTER_CLASS

class BinanceExecutor(
    BotRegistryMixin,
    KlineAnalyzerMixin,
    ProtectionRegistryMixin,
    ExchangeBlockMixin,
    ExecutionQueryMixin,
    ExecutionOrderMixin,
    ExecutionMarketMixin,
    ExecutionProtectionMixin,
):
    """统一交易执行器。"""

    def __init__(self, risk_manager: RiskManager):
        self.risk_manager = risk_manager
        self.exchange_name = EXCHANGE
        self.mode = EXCHANGE_MODE
        self.account_asset = ACCOUNT_ASSET

        if EXCHANGE == "okx":
            self.exchange = ccxt.okx({
                'apiKey': OKX_API_KEY,
                'secret': OKX_SECRET,
                'password': OKX_PASSPHRASE,
                'enableRateLimit': True,
                'options': {
                    'defaultType': 'swap',
                },
            })
            if EXCHANGE_MODE == "demo":
                self.exchange.set_sandbox_mode(True)
                logger.info("使用 OKX Demo Trading (sandbox mode)")
            logger.info(f"OKXExecutor 初始化完成 (mode={self.mode})")
        elif EXCHANGE == "ctrader":
            ctrader_adapter = _load_ctrader_adapter()
            self.exchange = ctrader_adapter(
                {
                    "client_id": CTRADER_CLIENT_ID,
                    "client_secret": CTRADER_CLIENT_SECRET,
                    "access_token": CTRADER_ACCESS_TOKEN,
                    "account_id": CTRADER_ACCOUNT_ID,
                    "base_url": CTRADER_BASE_URL,
                    "demo": CTRADER_DEMO,
                }
            )
            logger.info("cTrader 执行器初始化完成 (mode=%s, demo=%s)", self.mode, CTRADER_DEMO)
        else:
            self.exchange = ccxt.binanceusdm({
                'apiKey': BINANCE_API_KEY,
                'secret': BINANCE_SECRET,
                'enableRateLimit': True,
                'options': {
                    'defaultType': 'future',
                    'adjustForTimeDifference': True,
                    'warnOnFetchOpenOrdersWithoutSymbol': False,
                },
            })
            if BINANCE_MODE == "demo":
                self.exchange.enable_demo_trading(True)
                logger.info("使用 Binance Demo Trading 端点: demo-fapi.binance.com")
            logger.info(f"BinanceExecutor 初始化完成 (mode={self.mode})")

        # 加载 order_id → bot_id 映射
        self._order_bot_map = self._load_order_bot_map()

        # 加载 symbol → bot_id 持仓映射（冗余备份）
        self._position_bot_map = self._load_position_bot_map()

        # 缓存的交易费率
        self._cached_fees = {}
        # 品种约束缓存，避免每次仓位计算都重复打交易所元数据接口。
        self._symbol_constraints_cache: dict[str, dict[str, Any]] = {}
        self._symbol_constraints_ttl_seconds = 300
        # 保护单注册表：用于弥补 Binance Demo 条件单查询不完整的问题。
        self._protection_order_map = self._load_protection_order_map()
        # 交易所级别阻断状态：用于把 451 地域限制等执行层问题显式暴露给 Web/runtime。
        self._exchange_block_state = self._load_exchange_block_state()

    @staticmethod
    def _normalize_entry_intent(intent: str | None) -> str:
        """统一首仓/加仓意图字符串。"""
        return str(intent or "").strip().upper()

    @classmethod
    def _is_scale_like_intent(cls, intent: str | None) -> bool:
        """判断是否属于允许同品种继续开仓的加仓语义。"""
        normalized = cls._normalize_entry_intent(intent)
        return normalized in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD"}

    @staticmethod
    def _same_entry_side(request_side: OrderSide, position_side: PositionSide | str) -> bool:
        """判断请求方向与现有持仓方向是否一致。"""
        request_upper = str(request_side.value if isinstance(request_side, OrderSide) else request_side).upper()
        position_upper = str(position_side.value if isinstance(position_side, PositionSide) else position_side).upper()
        if request_upper == "BUY":
            return position_upper in {"LONG", "BUY"}
        if request_upper == "SELL":
            return position_upper in {"SHORT", "SELL"}
        return False

    @staticmethod
    def _same_price_level(expected: float | None, actual: float | None) -> bool:
        """比较两笔候选订单的触发价/挂单价是否可视为同一档。"""
        if expected is None and actual is None:
            return True
        if expected is None or actual is None:
            return False
        tolerance = max(abs(float(expected)) * 1e-6, 1e-6)
        return abs(float(expected) - float(actual)) <= tolerance

    @staticmethod
    def _normalize_strategy_marker(strategy: str | None) -> str:
        """统一策略键，执行侧幂等只拦同品种同策略。"""
        return str(strategy or "").strip().upper()

    @staticmethod
    def _normalize_timeframe_marker(timeframe: str | None) -> str:
        """统一时间周期键，允许不同周期并行首仓。"""
        return str(timeframe or "").strip().lower()

    async def _detect_duplicate_entry_state(
        self,
        request: OrderRequest,
        positions: list[Position],
    ) -> OrderResponse | None:
        """执行侧最终幂等：防止同品种首仓因桥接抖动重复创建。"""
        if request.reduce_only or self._is_scale_like_intent(request.intent):
            return None

        normalized_symbol = self._norm_symbol_base(request.symbol)
        if not normalized_symbol:
            return None
        requested_strategy = self._normalize_strategy_marker(request.strategy)
        requested_timeframe = self._normalize_timeframe_marker(getattr(request, "timeframe", None))

        same_direction_position = next(
            (
                pos
                for pos in positions
                if self._norm_symbol_base(pos.symbol) == normalized_symbol
                and self._same_entry_side(request.side, pos.side)
                and (
                    not requested_timeframe
                    or (
                        self._normalize_timeframe_marker(getattr(pos, "timeframe", None))
                        and self._normalize_timeframe_marker(getattr(pos, "timeframe", None)) == requested_timeframe
                    )
                )
                and (
                    not requested_strategy
                    or (
                        self._normalize_strategy_marker(getattr(pos, "strategy", None))
                        and self._normalize_strategy_marker(getattr(pos, "strategy", None)) == requested_strategy
                    )
                )
            ),
            None,
        )
        if same_direction_position is not None:
            return OrderResponse(
                success=True,
                symbol=self._normalize_symbol_for_ccxt(request.symbol),
                side=request.side.value,
                quantity=request.quantity,
                status="DUPLICATE_SKIPPED",
                message="执行侧幂等防护：当前已有同品种同方向持仓，跳过重复首仓",
                bot_id=request.bot_id,
            )

        open_orders = await self.get_open_orders(request.symbol)
        requested_order_type = str(request.order_type.value if isinstance(request.order_type, OrderType) else request.order_type).upper()
        requested_side = str(request.side.value if isinstance(request.side, OrderSide) else request.side).upper()
        requested_price = request.price

        for order in open_orders:
            if self._norm_symbol_base(order.symbol) != normalized_symbol:
                continue
            if order.reduce_only:
                continue
            if request.bot_id and order.bot_id and str(order.bot_id).strip() != str(request.bot_id).strip():
                continue
            existing_strategy = self._normalize_strategy_marker(getattr(order, "strategy", None))
            existing_timeframe = self._normalize_timeframe_marker(getattr(order, "timeframe", None))
            if requested_strategy:
                if not existing_strategy:
                    continue
                if existing_strategy != requested_strategy:
                    continue
            if requested_timeframe:
                if not existing_timeframe:
                    continue
                if existing_timeframe != requested_timeframe:
                    continue
            if str(order.side or "").upper() != requested_side:
                continue
            if str(order.order_type or "").upper() != requested_order_type:
                continue
            actual_price = order.price if order.price not in (None, 0, "") else order.stop_price
            if not self._same_price_level(requested_price, actual_price):
                continue
            return OrderResponse(
                success=True,
                order_id=order.order_id,
                symbol=self._normalize_symbol_for_ccxt(request.symbol),
                side=request.side.value,
                quantity=request.quantity,
                price=order.price,
                status="DUPLICATE_SKIPPED",
                message="执行侧幂等防护：当前已有同品种同方向活动挂单，跳过重复首仓",
                bot_id=request.bot_id,
            )

        return None


    def _fetch_native_binance_open_orders(self, symbol: Optional[str] = None) -> list[dict[str, Any]]:
        """使用币安原生接口补抓当前委托，尽量把 Demo 条件单一并拉回来。"""
        if self.exchange_name != "binance":
            return []

        native_fetch = getattr(self.exchange, "fapiPrivateGetOpenOrders", None)
        if not callable(native_fetch):
            return []

        params: dict[str, Any] = {}
        if symbol:
            market = self._load_market_descriptor(symbol)
            market_id = str(market.get("id") or "").upper()
            if not market_id:
                market_id = self._norm_symbol_base(symbol).upper()
            if market_id:
                params["symbol"] = market_id.replace(":", "")

        try:
            raw_orders = self._call_with_time_sync("native_get_open_orders", native_fetch, params)
        except Exception as exc:
            logger.debug("币安原生 open orders 查询失败 %s: %s", symbol or "ALL", exc)
            return []

        if not isinstance(raw_orders, list) or not raw_orders:
            return []

        try:
            parsed = self.exchange.parse_orders(raw_orders)
        except Exception as exc:
            logger.warning("解析币安原生 open orders 失败 %s: %s", symbol or "ALL", exc)
            return []

        return [item for item in parsed if isinstance(item, dict)]

    def _fetch_native_binance_open_algo_orders(self, symbol: Optional[str] = None) -> list[dict[str, Any]]:
        """补抓 Binance Demo 条件单，统一给 open orders 使用。"""
        if self.exchange_name != "binance":
            return []

        native_fetch = getattr(self.exchange, "fapiPrivateGetOpenAlgoOrders", None)
        if not callable(native_fetch):
            return []

        params: dict[str, Any] = {}
        if symbol:
            market = self._load_market_descriptor(symbol)
            market_id = str(market.get("id") or "").upper()
            if not market_id:
                market_id = self._norm_symbol_base(symbol).upper()
            if market_id:
                params["symbol"] = market_id.replace(":", "")

        try:
            raw_orders = self._call_with_time_sync("native_get_open_algo_orders", native_fetch, params)
        except Exception as exc:
            logger.debug("币安原生 open algo orders 查询失败 %s: %s", symbol or "ALL", exc)
            return []

        if not isinstance(raw_orders, list) or not raw_orders:
            return []

        converted: list[dict[str, Any]] = []
        for raw_order in raw_orders:
            if not isinstance(raw_order, dict):
                continue
            converted.append(
                {
                    "id": str(raw_order.get("algoId") or ""),
                    "clientOrderId": str(raw_order.get("clientAlgoId") or ""),
                    "timestamp": int(raw_order.get("createTime") or 0) or None,
                    "datetime": self.exchange.iso8601(int(raw_order.get("createTime") or 0)) if raw_order.get("createTime") else None,
                    "symbol": self._normalize_symbol_for_ccxt(str(raw_order.get("symbol") or "")),
                    "type": str(raw_order.get("orderType") or "").lower(),
                    "timeInForce": str(raw_order.get("timeInForce") or ""),
                    "reduceOnly": bool(raw_order.get("reduceOnly")),
                    "side": str(raw_order.get("side") or "").lower(),
                    "price": float(raw_order.get("price") or 0.0) or None,
                    "triggerPrice": float(raw_order.get("triggerPrice") or 0.0) or None,
                    "amount": float(raw_order.get("quantity") or 0.0) or None,
                    "filled": float(raw_order.get("actualQty") or 0.0) or 0.0,
                    "remaining": float(raw_order.get("quantity") or 0.0) or 0.0,
                    "status": str(raw_order.get("algoStatus") or "").lower(),
                    "stopPrice": float(raw_order.get("triggerPrice") or 0.0) or None,
                    "info": raw_order,
                }
            )
        return converted

    def _iter_allowed_ccxt_symbols(self) -> list[str]:
        """按当前 execution 账户的 allowed_symbols 生成需要扫描的委托品种。"""
        symbols: set[str] = set()
        try:
            state_mgr = get_trading_state_manager()
            for alloc in state_mgr.get_all_allocations().values():
                for raw_symbol in alloc.get("allowed_symbols", []) or []:
                    normalized = self._normalize_symbol_for_ccxt(str(raw_symbol or ""))
                    if normalized:
                        symbols.add(normalized)
        except Exception as exc:
            logger.debug("读取 allowed_symbols 失败，回退到默认扫描集: %s", exc)

        if not symbols:
            symbols.update({
                'SOL/USDT:USDT',
                'BTC/USDT:USDT',
                'ETH/USDT:USDT',
                'BNB/USDT:USDT',
            })
        return sorted(symbols)

    async def _sync_bot_margin_state(self, bot_id: str) -> None:
        """按实时持仓刷新 bot 的占用保证金与持仓数。"""
        if not bot_id:
            return
        try:
            curr_pos = await self.get_positions()
            bot_pos = [p for p in curr_pos if bot_id in self.get_position_bot_ids(p.symbol)]

            used = 0.0
            for position in bot_pos:
                value = self.quantity_to_account_notional(
                    position.symbol,
                    position.quantity,
                    position.mark_price,
                )
                if position.leverage > 0:
                    used += value / position.leverage
                else:
                    used += value

            mgr = get_trading_state_manager()
            mgr.update_bot_positions(bot_id, len(bot_pos), used)
            logger.info("Bot %s 资金占用已更新: 持仓%s笔, 占用$%.2f", bot_id, len(bot_pos), used)
        except Exception as exc:
            logger.warning("更新 Bot %s 资金占用失败: %s", bot_id, exc)

    async def recover_bot_map(self) -> dict:
        """恢复 bot 映射。"""
        return await BotRegistryMixin.recover_bot_map(self)

    async def recover_bot_map_from_binance(self) -> dict:
        """兼容旧调用名，实际已改为通用恢复逻辑。"""
        return await self.recover_bot_map()

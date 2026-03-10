"""
交易执行器 - 使用 ccxt 连接交易所（支持 OKX / Binance）
"""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional
import ccxt

from .config import (
    EXCHANGE, EXCHANGE_MODE,
    OKX_API_KEY, OKX_SECRET, OKX_PASSPHRASE,
    BINANCE_API_KEY, BINANCE_SECRET, BINANCE_MODE,
    SHARED_WORKSPACE,
)
from .models import OrderRequest, OrderResponse, OrderSide, OrderType, Position, Balance, PositionSide, OpenOrder, TradeHistory, AccountSummary
from .risk_manager import RiskManager
from .trading_state import get_trading_state_manager
from .bot_registry import BotRegistryMixin
from .kline_analyzer import KlineAnalyzerMixin

logger = logging.getLogger(__name__)

class BinanceExecutor(BotRegistryMixin, KlineAnalyzerMixin):
    """合约交易执行器（支持 OKX / Binance）"""

    def __init__(self, risk_manager: RiskManager):
        self.risk_manager = risk_manager
        self.exchange_name = EXCHANGE  # "okx" or "binance"
        self.mode = EXCHANGE_MODE

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

    @staticmethod
    def _is_timestamp_error(exc: Exception) -> bool:
        text = str(exc)
        return "-1021" in text or "Timestamp for this request" in text

    def _sync_exchange_time(self) -> bool:
        try:
            if hasattr(self.exchange, "load_time_difference"):
                diff = self.exchange.load_time_difference()
                logger.info(f"交易所时间同步完成: timeDifference={diff}ms")
                return True
            server_time = self.exchange.fetch_time()
            local_time = int(time.time() * 1000)
            diff = int(server_time) - local_time
            self.exchange.options["timeDifference"] = diff
            logger.info(f"交易所时间同步完成: timeDifference={diff}ms")
            return True
        except Exception as sync_exc:
            logger.warning(f"交易所时间同步失败: {sync_exc}")
            return False

    def _call_with_time_sync(self, op_name: str, func, *args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            if self._is_timestamp_error(exc) and self._sync_exchange_time():
                logger.warning(f"{op_name} 命中时间戳错误，已自动重试一次")
                return func(*args, **kwargs)
            raise

    def fetch_trading_fees(self) -> dict:
        """从币安获取实际交易费率（启动时调用一次）"""
        try:
            markets = self.exchange.load_markets()
            for symbol in ['BTC/USDT:USDT', 'ETH/USDT:USDT',
                           'SOL/USDT:USDT', 'BNB/USDT:USDT']:
                if symbol in markets:
                    m = markets[symbol]
                    self._cached_fees[m['id']] = {
                        'maker': m.get('maker', 0.0002),
                        'taker': m.get('taker', 0.0004),
                    }
            logger.info(
                f"获取币安费率成功: "
                f"{len(self._cached_fees)} 个品种"
            )
            return self._cached_fees
        except Exception as e:
            logger.warning(f"获取币安费率失败: {e}")
            return {}

    def _verify_stop_order(self, order_id: str, symbol: str) -> bool:
        """验证止损单是否真的存在于交易所（Demo 模式兜底检查）"""
        try:
            order = self.exchange.fetch_order(order_id, symbol)
            status = str(order.get('status', '')).lower()
            return status in ('open', 'new')
        except Exception as e:
            logger.warning(f"止损单验证失败 (order_id={order_id}): {e}")
            return False

    def _check_connection(self) -> bool:
        """检查连接"""
        try:
            self._call_with_time_sync("fetch_time", self.exchange.fetch_time)
            return True
        except Exception as e:
            logger.error(f"连接检查失败: {e}")
            return False

    async def get_balance(self) -> list[Balance]:
        """获取账户余额（扩展版 - 包含更多交易所信息）"""
        try:
            balance = self._call_with_time_sync("fetch_balance", self.exchange.fetch_balance)

            # 简化版：只返回 USDT
            usdt = balance.get('USDT', {})
            if usdt:
                # 从 info 获取原始交易所数据
                info = balance.get('info', {})

                # 基础字段
                total_balance = float(usdt.get('total', 0))
                available = float(usdt.get('free', 0))
                unrealized_pnl = 0

                # 扩展字段（根据交易所类型）
                cross_wallet_balance = None
                cross_unpnl = None
                available_balance = None
                max_withdraw_amount = None
                equity = None
                frozen_balance = None
                margin_ratio = None
                notional_usd = None
                initial_margin = None
                maintenance_margin = None

                if self.exchange_name == "binance":
                    # 币安 USDM Futures 字段
                    # info 可能是 list 或 dict
                    if isinstance(info, list) and info:
                        usdt_info = next((item for item in info if item.get('asset') == 'USDT'), {})
                    else:
                        usdt_info = info

                    unrealized_pnl = float(usdt_info.get('totalUnrealizedProfit', 0))
                    cross_wallet_balance = float(usdt_info.get('crossWalletBalance', total_balance))
                    cross_unpnl = float(usdt_info.get('crossUnPnl', unrealized_pnl))
                    available_balance = float(usdt_info.get('availableBalance', available))
                    max_withdraw_amount = float(usdt_info.get('maxWithdrawAmount', available))

                    # 从账户信息获取保证金相关数据
                    total_initial_margin = float(usdt_info.get('totalInitialMargin', 0))
                    total_maint_margin = float(usdt_info.get('totalMaintMargin', 0))
                    total_wallet_balance = float(usdt_info.get('totalWalletBalance', total_balance))

                    initial_margin = total_initial_margin
                    maintenance_margin = total_maint_margin

                    # 计算保证金率（币安）
                    if total_maint_margin > 0:
                        margin_ratio = (total_wallet_balance + unrealized_pnl) / total_maint_margin

                elif self.exchange_name == "okx":
                    # OKX Swap 字段
                    # OKX 的 info 结构：info.data[0].details[0]
                    if isinstance(info, dict):
                        data = info.get('data', [])
                        if data and isinstance(data, list):
                            account_data = data[0]
                            details = account_data.get('details', [])

                            # 找到 USDT 的详细信息
                            usdt_detail = next((d for d in details if d.get('ccy') == 'USDT'), {})

                            if usdt_detail:
                                equity = float(usdt_detail.get('eq', total_balance))
                                available = float(usdt_detail.get('availBal', available))
                                frozen_balance = float(usdt_detail.get('frozenBal', 0))
                                unrealized_pnl = float(usdt_detail.get('upl', 0))

                            # 账户级别数据
                            total_equity = float(account_data.get('totalEq', 0))
                            notional_usd = float(account_data.get('notionalUsd', 0))
                            initial_margin = float(account_data.get('imr', 0))
                            maintenance_margin = float(account_data.get('mmr', 0))

                            # OKX 保证金率
                            margin_ratio_str = account_data.get('mgnRatio', '')
                            if margin_ratio_str:
                                try:
                                    margin_ratio = float(margin_ratio_str)
                                except:
                                    margin_ratio = None

                # 计算保证金水平和风险等级
                margin_level = None
                risk_level = "safe"

                if maintenance_margin and maintenance_margin > 0:
                    effective_equity = (equity or total_balance) + unrealized_pnl
                    margin_level = effective_equity / maintenance_margin

                    # 风险等级判断
                    if margin_level < 1.2:
                        risk_level = "danger"  # 接近爆仓
                    elif margin_level < 2.0:
                        risk_level = "warning"  # 警告
                    else:
                        risk_level = "safe"  # 安全

                return [Balance(
                    asset='USDT',
                    balance=total_balance,
                    available=available,
                    unrealized_pnl=unrealized_pnl,
                    # 币安字段
                    cross_wallet_balance=cross_wallet_balance,
                    cross_unpnl=cross_unpnl,
                    available_balance=available_balance,
                    max_withdraw_amount=max_withdraw_amount,
                    # OKX 字段
                    equity=equity,
                    frozen_balance=frozen_balance,
                    margin_ratio=margin_ratio,
                    notional_usd=notional_usd,
                    # 通用字段
                    initial_margin=initial_margin,
                    maintenance_margin=maintenance_margin,
                    total_wallet_balance=cross_wallet_balance or total_balance,
                    total_margin_balance=(cross_wallet_balance or total_balance) + unrealized_pnl,
                    total_position_margin=initial_margin,
                    total_order_margin=0.0,  # 需要从订单数据计算
                    leverage=None,  # 需要从持仓数据计算
                    margin_level=margin_level,
                    risk_level=risk_level,
                )]

            return []
        except Exception as e:
            logger.error(f"获取余额失败: {e}")
            return []

    async def get_positions(self) -> list[Position]:
        """获取持仓"""
        try:
            positions = self._call_with_time_sync("fetch_positions", self.exchange.fetch_positions)
            result = []

            for pos in positions:
                contracts = pos.get('contracts')
                # 安全转换 contracts
                try:
                    contracts_float = float(contracts) if contracts is not None else 0
                except (ValueError, TypeError):
                    contracts_float = 0

                if contracts_float != 0:
                    side = PositionSide.LONG if pos.get('side') == 'long' else PositionSide.SHORT

                    # 安全转换各字段，防止 None 导致的错误
                    def safe_float(val, default=0):
                        if val is None:
                            return default
                        try:
                            return float(val)
                        except (ValueError, TypeError):
                            return default

                    def safe_int(val, default=1):
                        if val is None:
                            return default
                        try:
                            return int(val)
                        except (ValueError, TypeError):
                            return default

                    # 杠杆：ccxt 可能返回 None，从 notional/initialMargin 推算
                    raw_leverage = pos.get('leverage')
                    if raw_leverage is not None:
                        calc_leverage = safe_int(raw_leverage, 1)
                    else:
                        notional = safe_float(pos.get('notional'))
                        init_margin = safe_float(pos.get('initialMargin'))
                        if init_margin > 0 and notional > 0:
                            calc_leverage = max(1, round(notional / init_margin))
                        else:
                            calc_leverage = 1

                    result.append(Position(
                        symbol=pos.get('symbol', '').replace('/', ''),
                        side=side,
                        quantity=abs(contracts_float),
                        entry_price=safe_float(pos.get('entryPrice')),
                        mark_price=safe_float(pos.get('markPrice')),
                        unrealized_pnl=safe_float(pos.get('unrealizedPnl')),
                        leverage=calc_leverage,
                        margin_type=pos.get('marginType', 'cross'),
                        liquidation_price=safe_float(pos.get('liquidationPrice')) if pos.get('liquidationPrice') else None,
                    ))

            return result
        except Exception as e:
            logger.error(f"获取持仓失败: {e}")
            return []

    async def set_leverage(self, symbol: str, leverage: int) -> bool:
        """设置杠杆"""
        # 风控检查
        ok, msg = self.risk_manager.check_leverage(leverage)
        if not ok:
            logger.warning(f"杠杆设置被拒绝: {msg}")
            return False

        # 标准化 symbol 为 ccxt 格式: BTCUSDT → BTC/USDT:USDT, BTCUSDT:USDT → BTC/USDT:USDT
        if '/' not in symbol:
            raw = symbol.split(':')[0] if ':' in symbol else symbol
            settle = symbol.split(':')[1] if ':' in symbol else 'USDT'
            for quote in ['USDT', 'BUSD', 'USDC']:
                if raw.endswith(quote):
                    symbol = f"{raw[:-len(quote)]}/{quote}:{settle}"
                    break

        try:
            result = self._call_with_time_sync("set_leverage", self.exchange.set_leverage, leverage, symbol)
            actual_lev = result.get('leverage', leverage) if isinstance(result, dict) else leverage
            logger.info(f"设置 {symbol} 杠杆为 {actual_lev}x (请求={leverage}x)")
            return True
        except Exception as e:
            logger.warning(f"设置杠杆失败 {symbol} {leverage}x: {e} — 继续使用当前杠杆")
            return False

    async def place_order(self, request: OrderRequest, max_positions: int = 10, daily_loss_limit: float = 0, bot_id: str = "") -> OrderResponse:
        """下单"""
        # 统一标准化 symbol 为 ccxt 格式: SOLUSDT / SOLUSDT:USDT → SOL/USDT:USDT
        symbol = self._normalize_symbol_for_ccxt(request.symbol)

        # 风控检查
        positions = await self.get_positions()
        position_size = request.quantity * (request.price or 0)  # 估算仓位大小

        # V3.2→V3.9: 跨品种相关性检查 — per-bot 独立（每个 bot 只看自己的持仓）
        # Claude PA (独立交易员) 不受相关性风控限制
        if not request.reduce_only and request.signal_source != "claude-pa":
            bal_res = await self.get_balance()
            total_bal = bal_res[0].balance if bal_res else 0

            # 获取当前价格
            current_price = request.price
            if not current_price:
                try:
                    ticker = self.exchange.fetch_ticker(symbol)
                    current_price = float(ticker['last'])
                except:
                    current_price = 0.0

            # 过滤出当前 bot 的持仓（不同 bot 的仓位互不干扰）
            effective_bot = bot_id or request.bot_id or ""
            if effective_bot:
                bot_positions = []
                bot_syms = self.get_bot_symbols(effective_bot)
                for p in positions:
                    pos_bot = self.get_position_bot_id(p.symbol)
                    if pos_bot == effective_bot:
                        bot_positions.append(p)
                    elif pos_bot is None:
                        # position_bot_map 无记录，fallback 查 order_bot_map
                        if self._norm_symbol_base(p.symbol) in bot_syms:
                            bot_positions.append(p)
            else:
                bot_positions = positions

            # V7.0: 相关性风控已移除 — 让 agent 自行管理敞口

        # Claude PA (独立交易员) 跳过所有风控检查
        ok, msg = self.risk_manager.check_can_open(
            position_size, len(positions), max_positions=max_positions,
            daily_loss_limit=daily_loss_limit, bot_id=bot_id or request.bot_id or "",
        )
        if not ok and not request.reduce_only and request.signal_source != "claude-pa":
            return OrderResponse(
                success=False,
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                status="REJECTED",
                message=f"风控拒绝: {msg}",
            )

        # 设置杠杆
        if request.leverage:
            await self.set_leverage(symbol, request.leverage)

        try:
            # 下主订单
            order_params = {
                'symbol': symbol,
                'type': request.order_type.value.lower(),
                'side': request.side.value.lower(),
                'amount': request.quantity,
            }

            if request.order_type == OrderType.LIMIT and request.price:
                order_params['price'] = request.price
            elif request.order_type == OrderType.STOP_MARKET:
                trigger_price = request.price or request.stop_loss
                if not trigger_price:
                    return OrderResponse(
                        success=False,
                        symbol=symbol,
                        side=request.side.value,
                        quantity=request.quantity,
                        status="REJECTED",
                        message="STOP_MARKET 缺少触发价(price)",
                    )
                order_params.setdefault('params', {})['stopPrice'] = trigger_price
            elif request.order_type == OrderType.TAKE_PROFIT_MARKET:
                trigger_price = request.price or request.take_profit
                if not trigger_price:
                    return OrderResponse(
                        success=False,
                        symbol=symbol,
                        side=request.side.value,
                        quantity=request.quantity,
                        status="REJECTED",
                        message="TAKE_PROFIT_MARKET 缺少触发价(price)",
                    )
                order_params.setdefault('params', {})['stopPrice'] = trigger_price

            if request.reduce_only:
                order_params.setdefault('params', {})['reduceOnly'] = True

            # 使用 clientOrderId 标记机器人
            if request.bot_id:
                client_id = f"AB_{request.bot_id}_{int(time.time())}"
                order_params.setdefault('params', {})['newClientOrderId'] = client_id

            # V7.0: OKX 嵌入式 SL/TP — 随主订单一起创建，交易所原生执行
            if not request.reduce_only:
                if request.stop_loss:
                    order_params.setdefault('params', {})['stopLoss'] = {
                        'triggerPrice': request.stop_loss,
                        'type': 'market',
                    }
                if request.take_profit:
                    order_params.setdefault('params', {})['takeProfit'] = {
                        'triggerPrice': request.take_profit,
                        'type': 'market',
                    }

            order = self._call_with_time_sync("create_order", self.exchange.create_order, **order_params)

            order_id = str(order.get('id'))

            # 注册 order_id → bot_id 映射
            if request.bot_id:
                # V3.8: 优先从 strategy 字段获取策略名，兼容旧的 signal_source
                strat = request.strategy or request.signal_source or "auto"
                self._register_order(order_id, request.bot_id, symbol, strategy=strat)

                # 注册 symbol → bot_id 持仓映射（非 reduce_only 才是开仓）
                if not request.reduce_only:
                    self.register_position(symbol, request.bot_id, strategy=strat,
                                           quantity=request.quantity, side=request.side.value)

                    # V3.2: P1 修复 - 实时更新 Bot 持仓资金占用
                    try:
                        # 重新获取持仓以确保数据最新
                        curr_pos = await self.get_positions()
                        bot_pos = [p for p in curr_pos if request.bot_id in self.get_position_bot_ids(p.symbol)]

                        used = 0.0
                        for p in bot_pos:
                            # 估算占用保证金 = 名义价值 / 杠杆
                            val = p.quantity * p.mark_price
                            if p.leverage > 0:
                                used += val / p.leverage
                            else:
                                used += val  # fallback

                        mgr = get_trading_state_manager()
                        mgr.update_bot_positions(request.bot_id, len(bot_pos), used)
                        logger.info(f"Bot {request.bot_id} 资金占用已更新: 持仓{len(bot_pos)}笔, 占用${used:.1f}")
                    except Exception as e:
                        logger.warning(f"更新 Bot 资金占用失败: {e}")

            response = OrderResponse(
                success=True,
                order_id=order_id,
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                price=float(order.get('price', 0)) if order.get('price') else None,
                status=order.get('status') or 'NEW',
                bot_id=request.bot_id,
            )

            # V7.0: SL/TP 已嵌入主订单 params（非 reduce_only 时）
            sl_embedded = bool(request.stop_loss and not request.reduce_only)
            tp_embedded = bool(request.take_profit and not request.reduce_only)

            if sl_embedded:
                response.stop_loss_order_id = "embedded_native"
                logger.info(f"原生止损已嵌入主订单: {symbol} sl={request.stop_loss}")
            if tp_embedded:
                response.take_profit_order_id = "embedded_native"
                logger.info(f"原生止盈已嵌入主订单: {symbol} tp={request.take_profit}")

            logger.info(f"订单已提交: {symbol} {request.side.value} {request.quantity} @ {order.get('price', 'MARKET')} [bot={request.bot_id or 'unknown'}]")

            # 强制保护性止损：agent 未传 stop_loss 时后端兜底
            # 此时 SL 未嵌入主订单，需要单独挂
            if not request.stop_loss and not request.reduce_only:
                risk_pct = 0.02  # 默认 2%，与 bot allocation risk_percent 一致
                entry_price = float(order.get('average') or order.get('price') or 0)
                if entry_price <= 0:
                    try:
                        ticker = self.exchange.fetch_ticker(symbol)
                        entry_price = float(ticker.get('last', 0))
                        logger.warning(f"entry_price 兜底: 使用 ticker.last={entry_price}")
                    except Exception as te:
                        logger.error(f"fetch_ticker 兜底失败: {te}")
                if entry_price > 0:
                    if request.side == OrderSide.BUY:
                        request.stop_loss = round(entry_price * (1 - risk_pct), 2)
                    else:
                        request.stop_loss = round(entry_price * (1 + risk_pct), 2)
                    logger.info(f"自动保护性止损: {request.stop_loss} (入场={entry_price}, risk={risk_pct*100}%)")
                    # 自动 SL 未嵌入主订单，用软件止损 fallback
                    from pathlib import Path
                    import json as _json
                    try:
                        SHARED_WORKSPACE.mkdir(parents=True, exist_ok=True)
                        sl_file = SHARED_WORKSPACE / "sl_placed.json"
                        try:
                            sl_data = _json.loads(sl_file.read_text()) if sl_file.exists() else {}
                        except Exception:
                            sl_data = {}
                        norm_sym = symbol.replace('/', '')
                        sl_data[norm_sym] = request.stop_loss
                        sl_file.write_text(_json.dumps(sl_data, indent=2))
                        response.stop_loss_order_id = "software_sl"
                        logger.info(f"自动保护性软件止损已记录: {norm_sym} sl={request.stop_loss}")
                    except Exception as sl_exc:
                        logger.warning(f"记录软件止损失败（不影响主订单）: {sl_exc}")

            # 下止盈单（仅未嵌入时单独下）
            if request.take_profit and not tp_embedded:
                try:
                    tp_side = OrderSide.SELL if request.side == OrderSide.BUY else OrderSide.BUY
                    tp_order = self._call_with_time_sync(
                        "create_take_profit_order",
                        self.exchange.create_order,
                        symbol=symbol,
                        type='take_profit_market',
                        side=tp_side.value.lower(),
                        amount=request.quantity,
                        params={
                            'stopPrice': request.take_profit,
                            'reduceOnly': True,
                        }
                    )
                    tp_id = str(tp_order.get('id'))
                    response.take_profit_order_id = tp_id
                    if request.bot_id:
                        # V3.2: 传递 strategy
                        self._register_order(tp_id, request.bot_id, symbol, strategy=strat)
                    logger.info(f"止盈单已设置: {request.take_profit}")
                except Exception as e:
                    logger.warning(f"止盈单设置失败: {e}")

            return response

        except Exception as e:
            logger.error(f"下单失败: {e}")
            return OrderResponse(
                success=False,
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                status="FAILED",
                message=str(e),
            )

    async def close_position(self, symbol: str, quantity: Optional[float] = None, bot_id: str = None) -> OrderResponse:
        """平仓 — V3.9.3: per-bot 数量平仓 + 只注销自己"""
        try:
            positions = await self.get_positions()
            # V4.1: 用 _norm_symbol_base 做模糊匹配，兼容 SOLUSDT / SOLUSDT:USDT / SOL/USDT:USDT
            norm_input = self._norm_symbol_base(symbol)
            pos = next((p for p in positions if self._norm_symbol_base(p.symbol) == norm_input), None)

            if not pos:
                return OrderResponse(
                    success=False,
                    symbol=symbol,
                    side="",
                    quantity=0,
                    status="NOT_FOUND",
                    message=f"未找到 {symbol} 持仓",
                )

            # 确定平仓方向和数量
            close_side = OrderSide.SELL if pos.side == PositionSide.LONG else OrderSide.BUY

            # V3.9.3: 如果指定 bot_id 且未指定数量，使用该 bot 注册的数量
            if bot_id and not quantity:
                bot_qty = self._get_bot_registered_quantity(symbol, bot_id)
                if bot_qty > 0:
                    close_qty = min(bot_qty, pos.quantity)
                    logger.info(f"per-bot 平仓: {bot_id} 注册 {bot_qty}, 物理 {pos.quantity}, 平 {close_qty}")
                else:
                    close_qty = pos.quantity  # 兜底：无注册数量则平全部
                    logger.warning(f"per-bot 平仓: {bot_id} 无注册数量, 平全部 {pos.quantity}")
            else:
                close_qty = quantity or pos.quantity

            request = OrderRequest(
                symbol=symbol,
                side=close_side,
                quantity=close_qty,
                order_type=OrderType.MARKET,
                reduce_only=True,
            )

            response = await self.place_order(request)

            # 记录盈亏 + 进化系统
            if response.success:
                effective_bot = bot_id or self.get_position_bot_id(symbol)
                if effective_bot:
                    self.risk_manager.record_bot_pnl(effective_bot, pos.unrealized_pnl)
                else:
                    self.risk_manager.record_pnl(pos.unrealized_pnl)
                # V7.0: 进化系统暂停使用
                # if effective_bot:
                #     try:
                #         from .evolution_manager import get_evolution_manager
                #         evo = get_evolution_manager()
                #         ...
                #     except Exception as e:
                #         logger.warning(f"进化系统记录失败: {e}")
                # V3.9.3: 注销持仓归属 — bot 平仓只注销自己
                if effective_bot:
                    # 有明确 bot → 只注销该 bot，其他 bot 不受影响
                    self.unregister_position(symbol, effective_bot)
                    logger.info(f"注销 {effective_bot} 在 {symbol} 的持仓归属")
                else:
                    # 无 bot_id → 全量平仓，注销所有
                    self.unregister_position(symbol)

                # V7.0: 平仓后清理止损（软件 + 交易所挂单）
                try:
                    from pathlib import Path
                    import json as _json
                    sl_file = SHARED_WORKSPACE / "sl_placed.json"
                    if sl_file.exists():
                        sl_data = _json.loads(sl_file.read_text())
                        norm_sym = symbol.replace('/', '')
                        if norm_sym in sl_data:
                            del sl_data[norm_sym]
                            sl_file.write_text(_json.dumps(sl_data, indent=2))
                            logger.info(f"平仓后清理软件止损: {norm_sym}")
                except Exception as e_clean:
                    logger.warning(f"平仓后清理止损记录失败: {e_clean}")
                # 取消该品种所有交易所挂单（原生 SL + TP）
                try:
                    self.exchange.cancel_all_orders(symbol)
                    logger.info(f"平仓后取消 {symbol} 所有挂单")
                except Exception:
                    pass

            return response

        except Exception as e:
            logger.error(f"平仓失败: {e}")
            return OrderResponse(
                success=False,
                symbol=symbol,
                side="",
                quantity=0,
                status="FAILED",
                message=str(e),
            )

    async def modify_take_profit(self, symbol: str, new_take_profit: float, bot_id: str = None) -> dict:
        """修改止盈：取消现有 reduce-only TP 单并重建。"""
        try:
            positions = await self.get_positions()
            norm_input = self._norm_symbol_base(symbol)
            pos = next((p for p in positions if self._norm_symbol_base(p.symbol) == norm_input), None)
            if not pos:
                return {
                    "success": False,
                    "status": "NOT_FOUND",
                    "symbol": symbol,
                    "message": f"未找到 {symbol} 持仓",
                }

            pos_symbol = pos.symbol
            open_orders = await self.get_open_orders(pos_symbol)
            cancelled: list[str] = []
            ccxt_symbol = self._normalize_symbol_for_ccxt(pos_symbol)
            for order in open_orders:
                if order.reduce_only and str(order.order_type).upper() in {"TAKE_PROFIT_MARKET", "TAKE_PROFIT"}:
                    try:
                        self._call_with_time_sync("cancel_take_profit_order", self.exchange.cancel_order, order.order_id, ccxt_symbol)
                        cancelled.append(order.order_id)
                    except Exception as cancel_exc:
                        logger.warning(f"取消旧止盈单失败 {order.order_id}: {cancel_exc}")

            tp_side = OrderSide.SELL if pos.side == PositionSide.LONG else OrderSide.BUY
            tp_order = self._call_with_time_sync(
                "create_take_profit_order",
                self.exchange.create_order,
                symbol=ccxt_symbol,
                type='take_profit_market',
                side=tp_side.value.lower(),
                amount=pos.quantity,
                params={
                    'stopPrice': new_take_profit,
                    'reduceOnly': True,
                },
            )
            tp_order_id = str(tp_order.get("id") or "")
            if bot_id:
                self._register_order(tp_order_id, bot_id, ccxt_symbol, strategy="tp_adjust")

            logger.info(f"止盈已更新: {pos_symbol} -> {new_take_profit} (cancelled={cancelled})")
            return {
                "success": True,
                "status": "MODIFIED",
                "symbol": symbol,
                "old_take_profit_orders": cancelled,
                "new_take_profit": new_take_profit,
                "new_order_id": tp_order_id,
            }
        except Exception as e:
            logger.error(f"修改止盈失败: {e}")
            return {
                "success": False,
                "status": "FAILED",
                "symbol": symbol,
                "message": str(e),
            }

    async def cancel_all_orders(self, symbol: Optional[str] = None) -> bool:
        """取消所有订单"""
        try:
            if symbol:
                self._call_with_time_sync("cancel_all_orders", self.exchange.cancel_all_orders, self._normalize_symbol_for_ccxt(symbol))
                try:
                    SHARED_WORKSPACE.mkdir(parents=True, exist_ok=True)
                    sl_file = SHARED_WORKSPACE / "sl_placed.json"
                    if sl_file.exists():
                        sl_data = json.loads(sl_file.read_text())
                        norm_sym = self._normalize_symbol_for_ccxt(symbol).replace('/', '')
                        if norm_sym in sl_data:
                            del sl_data[norm_sym]
                            sl_file.write_text(json.dumps(sl_data, indent=2))
                            logger.info(f"撤单后清理软件止损记录: {norm_sym}")
                except Exception as clean_exc:
                    logger.warning(f"撤单后清理软件止损失败: {clean_exc}")
            else:
                # 取消所有交易对的订单
                positions = await self.get_positions()
                for pos in positions:
                    self._call_with_time_sync("cancel_all_orders", self.exchange.cancel_all_orders, self._normalize_symbol_for_ccxt(pos.symbol))
            logger.info(f"已取消所有订单 (symbol={symbol or 'ALL'})")
            return True
        except Exception as e:
            logger.error(f"取消订单失败: {e}")
            return False

    async def get_open_orders(self, symbol: Optional[str] = None) -> list[OpenOrder]:
        """获取挂单"""
        try:
            orders = []
            if symbol:
                ccxt_sym = self._normalize_symbol_for_ccxt(symbol)
                orders = self._call_with_time_sync("fetch_open_orders", self.exchange.fetch_open_orders, ccxt_sym)
            else:
                # 获取有持仓的交易对的挂单
                positions = await self.get_positions()
                symbols_to_check = set()
                for pos in positions:
                    symbols_to_check.add(self._normalize_symbol_for_ccxt(pos.symbol))
                # 添加常见交易对
                symbols_to_check.update([
                    'SOL/USDT:USDT', 'BTC/USDT:USDT',
                    'ETH/USDT:USDT', 'BNB/USDT:USDT'
                ])
                for sym in symbols_to_check:
                    try:
                        sym_orders = self._call_with_time_sync("fetch_open_orders", self.exchange.fetch_open_orders, sym)
                        orders.extend(sym_orders)
                    except Exception:
                        pass

            result = []
            for order in orders:
                order_id = str(order.get('id', ''))
                # 查找 bot_id: 先从映射文件，再从 clientOrderId
                bot_id = self._lookup_bot_id(order_id)
                client_id = order.get('clientOrderId', '')
                if not bot_id and client_id and client_id.startswith('AB_'):
                    parts = client_id.split('_')
                    if len(parts) >= 2:
                        bot_id = parts[1]

                result.append(OpenOrder(
                    order_id=str(order.get('id', '')),
                    symbol=order.get('symbol', '').replace('/', ''),
                    side=order.get('side', '').upper(),
                    order_type=order.get('type', '').upper(),
                    quantity=float(order.get('amount', 0)),
                    price=float(order.get('price')) if order.get('price') else None,
                    stop_price=float(order.get('stopPrice')) if order.get('stopPrice') else None,
                    status=order.get('status') or '',
                    reduce_only=order.get('reduceOnly', False),
                    created_at=order.get('datetime'),
                    bot_id=bot_id,
                    client_order_id=client_id,
                ))

            return result
        except Exception as e:
            logger.error(f"获取挂单失败: {e}")
            return []

    async def get_trade_history(
        self,
        symbol: Optional[str] = None,
        limit: int = 50
    ) -> list[TradeHistory]:
        """获取交易历史"""
        try:
            if symbol:
                ccxt_sym = self._normalize_symbol_for_ccxt(symbol)
                trades = self._call_with_time_sync("fetch_my_trades", self.exchange.fetch_my_trades, ccxt_sym, limit=limit)
            else:
                # 始终查询所有常见品种 + 有持仓的品种
                symbols_to_check = {
                    'BTC/USDT:USDT', 'ETH/USDT:USDT',
                    'SOL/USDT:USDT', 'BNB/USDT:USDT'
                }
                positions = await self.get_positions()
                for pos in positions:
                    symbols_to_check.add(self._normalize_symbol_for_ccxt(pos.symbol))

                trades = []
                for sym in symbols_to_check:
                    try:
                        sym_trades = self._call_with_time_sync(
                            "fetch_my_trades",
                            self.exchange.fetch_my_trades,
                            sym, limit=limit
                        )
                        trades.extend(sym_trades)
                    except Exception:
                        pass

            result = []
            for trade in trades:
                # 从 info 获取更多信息
                info = trade.get('info', {})
                fee = trade.get('fee') or {}

                order_id = str(trade.get('order', ''))

                # 查找 bot_id: 先从映射文件，再从 clientOrderId
                bot_id = self._lookup_bot_id(order_id)
                if not bot_id:
                    client_id = info.get('clientOrderId', '')
                    if client_id and client_id.startswith('AB_'):
                        parts = client_id.split('_')
                        if len(parts) >= 2:
                            bot_id = parts[1]

                result.append(TradeHistory(
                    trade_id=str(trade.get('id', '')),
                    order_id=order_id,
                    symbol=trade.get('symbol', '').replace('/', ''),
                    side=trade.get('side', '').upper(),
                    quantity=float(trade.get('amount', 0)),
                    price=float(trade.get('price', 0)),
                    realized_pnl=float(info.get('realizedPnl', 0)),
                    commission=float(fee.get('cost', 0)),
                    commission_asset=fee.get('currency', 'USDT'),
                    timestamp=trade.get('datetime'),
                    bot_id=bot_id,
                ))

            return result
        except Exception as e:
            logger.error(f"获取交易历史失败: {e}")
            return []

    async def get_account_summary(self) -> Optional[AccountSummary]:
        """获取账户汇总信息"""
        try:
            # 获取余额
            balance = self.exchange.fetch_balance()
            info = balance.get('info', {})

            usdt = balance.get('USDT', {})
            total_balance = float(usdt.get('total', 0))
            available = float(usdt.get('free', 0))
            unrealized_pnl = float(info.get('totalUnrealizedProfit', 0))
            margin_balance = float(info.get('totalMarginBalance', total_balance))

            # 获取持仓
            positions = await self.get_positions()
            position_value = sum(
                p.quantity * p.mark_price for p in positions
            )

            # 获取挂单
            open_orders = await self.get_open_orders()

            # 获取今日交易
            trades = await self.get_trade_history(limit=100)
            today = datetime.now(timezone.utc).date()
            today_trades = [
                t for t in trades
                if t.timestamp and t.timestamp.date() == today
            ]
            today_pnl = sum(t.realized_pnl for t in today_trades)
            today_commission = sum(t.commission for t in today_trades)

            return AccountSummary(
                total_balance=total_balance,
                available_balance=available,
                total_unrealized_pnl=unrealized_pnl,
                total_margin_balance=margin_balance,
                position_count=len(positions),
                total_position_value=position_value,
                open_order_count=len(open_orders),
                today_realized_pnl=today_pnl,
                today_trade_count=len(today_trades),
                today_commission=today_commission,
                margin_ratio=float(info.get('marginRatio')) if info.get('marginRatio') else None,
                can_trade=bool(info.get('canTrade', True)),
            )
        except Exception as e:
            logger.error(f"获取账户汇总失败: {e}")
            return None

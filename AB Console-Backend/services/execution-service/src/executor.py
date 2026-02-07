"""
交易执行器 - 使用 ccxt 连接币安
"""
import json
import logging
import time
from pathlib import Path
from typing import Optional
import ccxt

from .config import BINANCE_API_KEY, BINANCE_SECRET, BINANCE_MODE, BINANCE_BASE_URL
from .models import OrderRequest, OrderResponse, OrderSide, OrderType, Position, Balance, PositionSide, OpenOrder, TradeHistory, AccountSummary
from .risk_manager import RiskManager

logger = logging.getLogger(__name__)

# order_id → bot_id 映射文件
ORDER_BOT_MAP_FILE = Path.home() / ".openclaw" / "workspace" / "order_bot_map.json"


class BinanceExecutor:
    """币安合约交易执行器"""

    def __init__(self, risk_manager: RiskManager):
        self.risk_manager = risk_manager
        self.mode = BINANCE_MODE

        # 初始化 ccxt
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

        # Demo Trading: 使用 enable_demo_trading() 方法
        # 端点: https://demo-fapi.binance.com
        if BINANCE_MODE == "demo":
            self.exchange.enable_demo_trading(True)
            logger.info("使用 Binance Demo Trading 端点: demo-fapi.binance.com")

        logger.info(f"BinanceExecutor 初始化完成 (mode={self.mode})")

        # 加载 order_id → bot_id 映射
        self._order_bot_map = self._load_order_bot_map()

    def _load_order_bot_map(self) -> dict:
        """加载 order_id → bot_id 映射"""
        try:
            if ORDER_BOT_MAP_FILE.exists():
                with open(ORDER_BOT_MAP_FILE, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"加载 order_bot_map 失败: {e}")
        return {}

    def _save_order_bot_map(self):
        """保存 order_id → bot_id 映射"""
        try:
            ORDER_BOT_MAP_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(ORDER_BOT_MAP_FILE, 'w') as f:
                json.dump(self._order_bot_map, f, indent=2)
        except Exception as e:
            logger.warning(f"保存 order_bot_map 失败: {e}")

    def _register_order(self, order_id: str, bot_id: str):
        """注册订单与机器人的映射"""
        if bot_id:
            self._order_bot_map[str(order_id)] = bot_id
            self._save_order_bot_map()

    def _lookup_bot_id(self, order_id: str) -> Optional[str]:
        """通过 order_id 查找 bot_id"""
        return self._order_bot_map.get(str(order_id))

    def _check_connection(self) -> bool:
        """检查连接"""
        try:
            self.exchange.fetch_time()
            return True
        except Exception as e:
            logger.error(f"连接检查失败: {e}")
            return False

    async def get_balance(self) -> list[Balance]:
        """获取账户余额"""
        try:
            balance = self.exchange.fetch_balance()

            # 简化版：只返回 USDT
            usdt = balance.get('USDT', {})
            if usdt:
                # 从 info 获取未实现盈亏
                info = balance.get('info', {})
                unrealized_pnl = float(info.get('totalUnrealizedProfit', 0))

                return [Balance(
                    asset='USDT',
                    balance=float(usdt.get('total', 0)),
                    available=float(usdt.get('free', 0)),
                    unrealized_pnl=unrealized_pnl,
                )]

            return []
        except Exception as e:
            logger.error(f"获取余额失败: {e}")
            return []

    async def get_positions(self) -> list[Position]:
        """获取持仓"""
        try:
            positions = self.exchange.fetch_positions()
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

                    result.append(Position(
                        symbol=pos.get('symbol', '').replace('/', ''),
                        side=side,
                        quantity=abs(contracts_float),
                        entry_price=safe_float(pos.get('entryPrice')),
                        mark_price=safe_float(pos.get('markPrice')),
                        unrealized_pnl=safe_float(pos.get('unrealizedPnl')),
                        leverage=safe_int(pos.get('leverage'), 1),
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

        try:
            self.exchange.set_leverage(leverage, symbol)
            logger.info(f"设置 {symbol} 杠杆为 {leverage}x")
            return True
        except Exception as e:
            logger.error(f"设置杠杆失败: {e}")
            return False

    async def place_order(self, request: OrderRequest) -> OrderResponse:
        """下单"""
        symbol = request.symbol

        # 风控检查
        positions = await self.get_positions()
        position_size = request.quantity * (request.price or 0)  # 估算仓位大小

        ok, msg = self.risk_manager.check_can_open(position_size, len(positions))
        if not ok and not request.reduce_only:
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

            if request.reduce_only:
                order_params['reduceOnly'] = True

            # 使用 clientOrderId 标记机器人
            if request.bot_id:
                client_id = f"AB_{request.bot_id}_{int(time.time())}"
                order_params['params'] = {'newClientOrderId': client_id}

            order = self.exchange.create_order(**order_params)

            order_id = str(order.get('id'))

            # 注册 order_id → bot_id 映射
            if request.bot_id:
                self._register_order(order_id, request.bot_id)

            response = OrderResponse(
                success=True,
                order_id=order_id,
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                price=float(order.get('price', 0)) if order.get('price') else None,
                status=order.get('status', 'NEW'),
                bot_id=request.bot_id,
            )

            logger.info(f"订单已提交: {symbol} {request.side.value} {request.quantity} @ {order.get('price', 'MARKET')} [bot={request.bot_id or 'unknown'}]")

            # 下止损单
            if request.stop_loss:
                try:
                    sl_side = OrderSide.SELL if request.side == OrderSide.BUY else OrderSide.BUY
                    sl_order = self.exchange.create_order(
                        symbol=symbol,
                        type='stop_market',
                        side=sl_side.value.lower(),
                        amount=request.quantity,
                        params={
                            'stopPrice': request.stop_loss,
                            'reduceOnly': True,
                        }
                    )
                    sl_id = str(sl_order.get('id'))
                    response.stop_loss_order_id = sl_id
                    if request.bot_id:
                        self._register_order(sl_id, request.bot_id)
                    logger.info(f"止损单已设置: {request.stop_loss}")
                except Exception as e:
                    logger.warning(f"止损单设置失败: {e}")

            # 下止盈单
            if request.take_profit:
                try:
                    tp_side = OrderSide.SELL if request.side == OrderSide.BUY else OrderSide.BUY
                    tp_order = self.exchange.create_order(
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
                        self._register_order(tp_id, request.bot_id)
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

    async def close_position(self, symbol: str, quantity: Optional[float] = None) -> OrderResponse:
        """平仓"""
        try:
            positions = await self.get_positions()
            pos = next((p for p in positions if p.symbol == symbol), None)

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
            close_qty = quantity or pos.quantity

            request = OrderRequest(
                symbol=symbol,
                side=close_side,
                quantity=close_qty,
                order_type=OrderType.MARKET,
                reduce_only=True,
            )

            response = await self.place_order(request)

            # 记录盈亏
            if response.success:
                self.risk_manager.record_pnl(pos.unrealized_pnl)

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

    async def cancel_all_orders(self, symbol: Optional[str] = None) -> bool:
        """取消所有订单"""
        try:
            if symbol:
                self.exchange.cancel_all_orders(symbol)
            else:
                # 取消所有交易对的订单
                positions = await self.get_positions()
                for pos in positions:
                    self.exchange.cancel_all_orders(pos.symbol)
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
                orders = self.exchange.fetch_open_orders(symbol)
            else:
                # 获取有持仓的交易对的挂单
                positions = await self.get_positions()
                symbols_to_check = set()
                for pos in positions:
                    symbols_to_check.add(pos.symbol)
                # 添加常见交易对
                symbols_to_check.update([
                    'SOL/USDT:USDT', 'BTC/USDT:USDT',
                    'ETH/USDT:USDT', 'BNB/USDT:USDT'
                ])
                for sym in symbols_to_check:
                    try:
                        sym_orders = self.exchange.fetch_open_orders(sym)
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
                    status=order.get('status', ''),
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
                trades = self.exchange.fetch_my_trades(symbol, limit=limit)
            else:
                # 始终查询所有常见品种 + 有持仓的品种
                symbols_to_check = {
                    'BTC/USDT:USDT', 'ETH/USDT:USDT',
                    'SOL/USDT:USDT', 'BNB/USDT:USDT'
                }
                positions = await self.get_positions()
                for pos in positions:
                    symbols_to_check.add(pos.symbol)

                trades = []
                for sym in symbols_to_check:
                    try:
                        sym_trades = self.exchange.fetch_my_trades(
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
            from datetime import datetime, timezone
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

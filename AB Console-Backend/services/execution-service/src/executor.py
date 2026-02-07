"""
交易执行器 - 使用 ccxt 连接币安
"""
import logging
from typing import Optional
import ccxt

from .config import BINANCE_API_KEY, BINANCE_SECRET, BINANCE_MODE, BINANCE_BASE_URL
from .models import OrderRequest, OrderResponse, OrderSide, OrderType, Position, Balance, PositionSide
from .risk_manager import RiskManager

logger = logging.getLogger(__name__)


class BinanceExecutor:
    """币安合约交易执行器"""

    def __init__(self, risk_manager: RiskManager):
        self.risk_manager = risk_manager
        self.mode = BINANCE_MODE

        # 初始化 ccxt
        self.exchange = ccxt.binanceusdm({
            'apiKey': BINANCE_API_KEY,
            'secret': BINANCE_SECRET,
            'sandbox': False,  # Demo Trading 使用主网 API 端点
            'options': {
                'defaultType': 'future',
            },
        })

        logger.info(f"BinanceExecutor 初始化完成 (mode={self.mode})")

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
            result = []

            for asset, info in balance.get('info', {}).get('assets', []):
                if isinstance(info, dict):
                    result.append(Balance(
                        asset=info.get('asset', asset),
                        balance=float(info.get('walletBalance', 0)),
                        available=float(info.get('availableBalance', 0)),
                        unrealized_pnl=float(info.get('unrealizedProfit', 0)),
                    ))

            # 简化版：只返回 USDT
            usdt = balance.get('USDT', {})
            if usdt:
                result = [Balance(
                    asset='USDT',
                    balance=float(usdt.get('total', 0)),
                    available=float(usdt.get('free', 0)),
                    unrealized_pnl=0,
                )]

            return result
        except Exception as e:
            logger.error(f"获取余额失败: {e}")
            return []

    async def get_positions(self) -> list[Position]:
        """获取持仓"""
        try:
            positions = self.exchange.fetch_positions()
            result = []

            for pos in positions:
                if float(pos.get('contracts', 0)) != 0:
                    side = PositionSide.LONG if pos.get('side') == 'long' else PositionSide.SHORT
                    result.append(Position(
                        symbol=pos.get('symbol', '').replace('/', ''),
                        side=side,
                        quantity=abs(float(pos.get('contracts', 0))),
                        entry_price=float(pos.get('entryPrice', 0)),
                        mark_price=float(pos.get('markPrice', 0)),
                        unrealized_pnl=float(pos.get('unrealizedPnl', 0)),
                        leverage=int(pos.get('leverage', 1)),
                        margin_type=pos.get('marginType', 'cross'),
                        liquidation_price=float(pos.get('liquidationPrice', 0)) if pos.get('liquidationPrice') else None,
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

            order = self.exchange.create_order(**order_params)

            response = OrderResponse(
                success=True,
                order_id=str(order.get('id')),
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                price=float(order.get('price', 0)) if order.get('price') else None,
                status=order.get('status', 'NEW'),
            )

            logger.info(f"订单已提交: {symbol} {request.side.value} {request.quantity} @ {order.get('price', 'MARKET')}")

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
                    response.stop_loss_order_id = str(sl_order.get('id'))
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
                    response.take_profit_order_id = str(tp_order.get('id'))
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

"""
交易执行器 - 使用 ccxt 连接币安
"""
import json
import logging
import time
from pathlib import Path
from typing import Optional
import ccxt

from .config import BINANCE_API_KEY, BINANCE_SECRET, BINANCE_MODE
from .models import OrderRequest, OrderResponse, OrderSide, OrderType, Position, Balance, PositionSide, OpenOrder, TradeHistory, AccountSummary
from .risk_manager import RiskManager
from .trading_state import get_trading_state_manager

logger = logging.getLogger(__name__)

# order_id → bot_id 映射文件
ORDER_BOT_MAP_FILE = Path.home() / ".openclaw" / "workspace" / "order_bot_map.json"
# symbol → bot_id 持仓映射文件（冗余备份，直接记录哪个 bot 持有哪个品种）
POSITION_BOT_MAP_FILE = Path.home() / ".openclaw" / "workspace" / "position_bot_map.json"


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

        # 加载 symbol → bot_id 持仓映射（冗余备份）
        self._position_bot_map = self._load_position_bot_map()

        # 缓存的交易费率
        self._cached_fees = {}

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

    def _load_order_bot_map(self) -> dict:
        """加载 order_id → {bot_id, symbol} 映射，兼容旧格式"""
        try:
            if ORDER_BOT_MAP_FILE.exists():
                with open(ORDER_BOT_MAP_FILE, 'r') as f:
                    data = json.load(f)
                # 迁移旧格式: {oid: "bot_id"} → {oid: {bot_id, symbol}}
                migrated = False
                for oid, val in list(data.items()):
                    if isinstance(val, str):
                        data[oid] = {"bot_id": val, "symbol": ""}
                        migrated = True
                if migrated:
                    with open(ORDER_BOT_MAP_FILE, 'w') as f:
                        json.dump(data, f, indent=2)
                    logger.info(f"order_bot_map 已迁移到新格式")
                return data
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

    def _load_position_bot_map(self) -> dict:
        """加载 symbol → bot_id 持仓映射"""
        try:
            if POSITION_BOT_MAP_FILE.exists():
                with open(POSITION_BOT_MAP_FILE, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"加载 position_bot_map 失败: {e}")
        return {}

    def _save_position_bot_map(self):
        """保存 symbol → bot_id 持仓映射"""
        try:
            POSITION_BOT_MAP_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(POSITION_BOT_MAP_FILE, 'w') as f:
                json.dump(self._position_bot_map, f, indent=2)
        except Exception as e:
            logger.warning(f"保存 position_bot_map 失败: {e}")

    def _norm_position_key(self, symbol: str) -> str:
        """标准化 position_bot_map key 为 XXXUSDT:USDT 格式（V3.9.2）"""
        norm = symbol.replace('/', '')
        if ':' not in norm:
            norm += ':USDT'
        return norm

    def register_position(self, symbol: str, bot_id: str, strategy: str = "auto",
                          quantity: float = 0, side: str = ""):
        """注册持仓归属（开仓时调用）— V3.9.3 增加 quantity/side 追踪"""
        if not (bot_id and symbol):
            return
        key = self._norm_position_key(symbol)
        entry = {"bot_id": bot_id, "strategy": strategy, "quantity": quantity, "side": side}

        existing = self._position_bot_map.get(key)
        if isinstance(existing, list):
            # 更新或追加
            for i, e in enumerate(existing):
                if isinstance(e, dict) and e.get("bot_id") == bot_id:
                    existing[i] = entry
                    break
            else:
                existing.append(entry)
        elif isinstance(existing, dict):
            if existing.get("bot_id") == bot_id:
                self._position_bot_map[key] = [entry]
            else:
                self._position_bot_map[key] = [existing, entry]
        elif isinstance(existing, str):
            if existing == bot_id:
                self._position_bot_map[key] = [entry]
            else:
                self._position_bot_map[key] = [
                    {"bot_id": existing, "strategy": "auto"}, entry
                ]
        else:
            self._position_bot_map[key] = [entry]
        self._save_position_bot_map()

    def unregister_position(self, symbol: str, bot_id: str = None):
        """注销持仓归属 — V3.9.2 支持按 bot_id 注销"""
        key = self._norm_position_key(symbol)
        existing = self._position_bot_map.get(key)
        if existing is None:
            return

        if bot_id is None:
            # 全部清除（向后兼容）
            del self._position_bot_map[key]
        elif isinstance(existing, list):
            self._position_bot_map[key] = [
                e for e in existing
                if not (isinstance(e, dict) and e.get("bot_id") == bot_id)
            ]
            if not self._position_bot_map[key]:
                del self._position_bot_map[key]
        elif isinstance(existing, dict) and existing.get("bot_id") == bot_id:
            del self._position_bot_map[key]
        elif existing == bot_id:
            del self._position_bot_map[key]
        self._save_position_bot_map()

    def get_position_bot_id(self, symbol: str) -> Optional[str]:
        """查找持仓归属的主 bot_id（第一个）"""
        key = self._norm_position_key(symbol)
        val = self._position_bot_map.get(key)
        if isinstance(val, list):
            if val and isinstance(val[0], dict):
                return val[0].get("bot_id")
            return val[0] if val else None
        if isinstance(val, dict):
            return val.get("bot_id")
        return val  # 兼容旧格式（字符串）

    def get_position_bot_ids(self, symbol: str) -> list:
        """获取某品种所有持仓 bot_id（V3.9.2 多 bot 支持）"""
        key = self._norm_position_key(symbol)
        val = self._position_bot_map.get(key)
        if isinstance(val, list):
            return [
                e.get("bot_id") if isinstance(e, dict) else e
                for e in val if e
            ]
        if isinstance(val, dict):
            bid = val.get("bot_id")
            return [bid] if bid else []
        if isinstance(val, str):
            return [val]
        return []

    def _get_bot_registered_quantity(self, symbol: str, bot_id: str) -> float:
        """获取某 bot 在某品种上注册的数量（V3.9.3）"""
        key = self._norm_position_key(symbol)
        val = self._position_bot_map.get(key)
        if isinstance(val, list):
            for e in val:
                if isinstance(e, dict) and e.get("bot_id") == bot_id:
                    return e.get("quantity", 0)
        elif isinstance(val, dict) and val.get("bot_id") == bot_id:
            return val.get("quantity", 0)
        return 0

    def get_position_strategy(self, symbol: str, bot_id: str = None) -> str:
        """获取持仓对应的策略名"""
        key = self._norm_position_key(symbol)
        val = self._position_bot_map.get(key)
        if isinstance(val, list):
            for e in val:
                if isinstance(e, dict):
                    if bot_id is None or e.get("bot_id") == bot_id:
                        return e.get("strategy", "auto")
            return "auto"
        if isinstance(val, dict):
            return val.get("strategy", "auto")
        return "auto"

    def get_order_strategy(self, order_id: str) -> str:
        """通过 order_id 获取策略名"""
        val = self._order_bot_map.get(str(order_id))
        if isinstance(val, dict):
            return val.get("strategy", "auto")
        return "auto"

    def _register_order(self, order_id: str, bot_id: str, symbol: str = "", strategy: str = "auto"):
        """注册订单与机器人的映射（含 symbol 和 strategy）"""
        if bot_id:
            # 标准化 symbol: SOL/USDT:USDT → SOLUSDT:USDT
            norm_sym = symbol.replace('/', '') if symbol else ""
            self._order_bot_map[str(order_id)] = {
                "bot_id": bot_id,
                "symbol": norm_sym,
                "strategy": strategy,
            }
            self._save_order_bot_map()

    def _verify_stop_order(self, order_id: str, symbol: str) -> bool:
        """验证止损单是否真的存在于交易所（Demo 模式兜底检查）"""
        try:
            order = self.exchange.fetch_order(order_id, symbol)
            status = str(order.get('status', '')).lower()
            return status in ('open', 'new')
        except Exception as e:
            logger.warning(f"止损单验证失败 (order_id={order_id}): {e}")
            return False

    def _lookup_bot_id(self, order_id: str) -> Optional[str]:
        """通过 order_id 查找 bot_id"""
        val = self._order_bot_map.get(str(order_id))
        if isinstance(val, dict):
            return val.get("bot_id")
        # 兼容旧格式 {order_id: "bot_id"}
        return val if isinstance(val, str) else None

    @staticmethod
    def _norm_symbol_base(symbol: str) -> str:
        """统一提取 symbol 基础部分用于比较。
        SOLUSDT:USDT → SOLUSDT, SOL/USDT:USDT → SOLUSDT, SOLUSDT → SOLUSDT
        """
        s = symbol.replace('/', '')
        return s.split(':')[0] if ':' in s else s

    def get_bot_symbols(self, bot_id: str) -> set:
        """获取某 bot 关联的所有 symbol（从 order_bot_map），返回标准化后的 base symbol"""
        symbols = set()
        for oid, val in self._order_bot_map.items():
            if isinstance(val, dict):
                if val.get("bot_id") == bot_id and val.get("symbol"):
                    symbols.add(self._norm_symbol_base(val["symbol"]))
            elif val == bot_id:
                # 旧格式无 symbol，跳过
                pass
        return symbols

    def _parse_bot_id_from_client_order_id(self, cid: str) -> Optional[str]:
        """从 clientOrderId 解析 bot_id。格式: AB_{bot_id}_{timestamp}"""
        if not cid or not cid.startswith('AB_'):
            return None
        parts = cid.split('_')
        if len(parts) < 3:
            return None
        bot_id = parts[1]
        # 处理 al-brooks 这种带连字符的 bot_id（AB_al_brooks_xxx）
        if parts[1] == 'al' and len(parts) >= 4:
            bot_id = f"{parts[1]}-{parts[2]}"
        return bot_id

    async def recover_bot_map_from_binance(self) -> dict:
        """从币安 open orders + trades history 恢复 order_bot_map 和 position_bot_map

        clientOrderId 格式: AB_{bot_id}_{timestamp}
        返回: {"recovered_orders": int, "recovered_positions": int}
        """
        recovered_orders = 0
        recovered_positions = 0
        try:
            # 1. 从 open orders 恢复
            open_orders = self.exchange.fetch_open_orders()
            for order in open_orders:
                oid = str(order.get('id', ''))
                cid = order.get('clientOrderId', '')
                if oid in self._order_bot_map:
                    continue
                bot_id = self._parse_bot_id_from_client_order_id(cid)
                if bot_id:
                    raw_sym = order.get('symbol', '').replace('/', '')
                    self._order_bot_map[oid] = {"bot_id": bot_id, "symbol": raw_sym}
                    recovered_orders += 1

            # 2. 从当前持仓 + 订单历史恢复 position_bot_map
            positions = await self.get_positions()
            for pos in positions:
                norm_sym = pos.symbol.replace('/', '')  # SOLUSDT:USDT 格式
                if norm_sym in self._position_bot_map:
                    continue  # 已有映射，跳过
                # 从 order_bot_map 中找该品种最近的订单（order_id 最大 = 最近）
                pos_base = self._norm_symbol_base(norm_sym)
                best_oid = -1
                best_val = None
                for oid, val in self._order_bot_map.items():
                    if isinstance(val, dict) and val.get("symbol"):
                        order_base = self._norm_symbol_base(val["symbol"])
                        if order_base == pos_base:
                            try:
                                oid_int = int(oid)
                            except ValueError:
                                oid_int = 0
                            if oid_int > best_oid:
                                best_oid = oid_int
                                best_val = val
                if best_val:
                    self._position_bot_map[norm_sym] = {"bot_id": best_val["bot_id"], "strategy": best_val.get("strategy", "auto")}
                    recovered_positions += 1
                    logger.info(f"从 order_bot_map 恢复持仓归属: {norm_sym} → {best_val['bot_id']} (order={best_oid})")
                if norm_sym in self._position_bot_map:
                    continue
                # 兜底：查该品种最近的订单（fetch_orders 包含 clientOrderId）
                try:
                    ccxt_sym = norm_sym
                    if ':' in norm_sym and '/' not in norm_sym:
                        base_quote = norm_sym.split(':')[0]
                        settle = norm_sym.split(':')[1]
                        for quote in ['USDT', 'BUSD', 'USDC']:
                            if base_quote.endswith(quote):
                                base = base_quote[:-len(quote)]
                                ccxt_sym = f"{base}/{quote}:{settle}"
                                break
                    orders = self.exchange.fetch_orders(ccxt_sym, limit=10)
                    for o in reversed(orders):  # 从最近的开始
                        cid = o.get('clientOrderId', '') or o.get('info', {}).get('clientOrderId', '')
                        bot_id = self._parse_bot_id_from_client_order_id(cid)
                        if bot_id:
                            self._position_bot_map[norm_sym] = {"bot_id": bot_id, "strategy": "auto"}
                            recovered_positions += 1
                            logger.info(f"从订单历史恢复持仓归属: {norm_sym} → {bot_id}")
                            break
                except Exception as e:
                    logger.warning(f"查询 {norm_sym} 订单历史失败: {e}")

            if recovered_orders > 0:
                self._save_order_bot_map()
                logger.info(f"从币安恢复 {recovered_orders} 条 order→bot 映射")
            if recovered_positions > 0:
                self._save_position_bot_map()

            return {
                "recovered_orders": recovered_orders,
                "recovered_positions": recovered_positions,
                "total_open": len(open_orders),
            }
        except Exception as e:
            logger.warning(f"恢复 bot 映射失败: {e}")
            return {"recovered_orders": 0, "recovered_positions": 0, "error": str(e)}

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
            result = self.exchange.set_leverage(leverage, symbol)
            actual_lev = result.get('leverage', leverage) if isinstance(result, dict) else leverage
            logger.info(f"设置 {symbol} 杠杆为 {actual_lev}x (请求={leverage}x)")
            return True
        except Exception as e:
            logger.warning(f"设置杠杆失败 {symbol} {leverage}x: {e} — 继续使用当前杠杆")
            return False

    async def place_order(self, request: OrderRequest, max_positions: int = 10, daily_loss_limit: float = 0, bot_id: str = "") -> OrderResponse:
        """下单"""
        symbol = request.symbol
        # 标准化 symbol 为 ccxt 格式: SOLUSDT:USDT → SOL/USDT:USDT
        if ':' in symbol and '/' not in symbol:
            base_quote = symbol.split(':')[0]  # SOLUSDT
            settle = symbol.split(':')[1]      # USDT
            # 从末尾分离 quote（USDT/BUSD）
            for quote in ['USDT', 'BUSD', 'USDC']:
                if base_quote.endswith(quote):
                    base = base_quote[:-len(quote)]
                    symbol = f"{base}/{quote}:{settle}"
                    break

        # 风控检查
        positions = await self.get_positions()
        position_size = request.quantity * (request.price or 0)  # 估算仓位大小

        # V3.2→V3.9: 跨品种相关性检查 — per-bot 独立（每个 bot 只看自己的持仓）
        if not request.reduce_only:
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

            ok_exp, msg_exp = self.risk_manager.check_correlation(
                symbol, request.side.value, request.quantity, current_price, bot_positions, total_bal
            )
            if not ok_exp:
                return OrderResponse(
                    success=False,
                    symbol=symbol,
                    side=request.side.value,
                    quantity=request.quantity,
                    status="REJECTED",
                    message=f"相关性风控拒绝: {msg_exp}",
                )

        ok, msg = self.risk_manager.check_can_open(
            position_size, len(positions), max_positions=max_positions,
            daily_loss_limit=daily_loss_limit, bot_id=bot_id or request.bot_id or "",
        )
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
                order_params.setdefault('params', {})['reduceOnly'] = True

            # 使用 clientOrderId 标记机器人
            if request.bot_id:
                client_id = f"AB_{request.bot_id}_{int(time.time())}"
                order_params.setdefault('params', {})['newClientOrderId'] = client_id

            order = self.exchange.create_order(**order_params)

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
                status=order.get('status', 'NEW'),
                bot_id=request.bot_id,
            )

            logger.info(f"订单已提交: {symbol} {request.side.value} {request.quantity} @ {order.get('price', 'MARKET')} [bot={request.bot_id or 'unknown'}]")

            # 强制保护性止损：agent 未传 stop_loss 时后端兜底
            if not request.stop_loss and not request.reduce_only:
                risk_pct = 0.02  # 默认 2%，与 bot allocation risk_percent 一致
                entry_price = float(order.get('average') or order.get('price') or 0)
                # 兜底：市价单 ccxt 可能返回 average=None，用 ticker.last
                if entry_price <= 0:
                    try:
                        ticker = self.exchange.fetch_ticker(symbol)
                        entry_price = float(ticker.get('last', 0))
                        logger.warning(f"entry_price 兜底: 使用 ticker.last={entry_price} (ccxt 返回 avg={order.get('average')}, price={order.get('price')})")
                    except Exception as te:
                        logger.error(f"fetch_ticker 兜底失败: {te}")
                if entry_price > 0:
                    if request.side == OrderSide.BUY:
                        request.stop_loss = round(entry_price * (1 - risk_pct), 2)
                    else:
                        request.stop_loss = round(entry_price * (1 + risk_pct), 2)
                    logger.info(f"自动保护性止损: {request.stop_loss} (入场={entry_price}, risk={risk_pct*100}%)")

            # V3.5: 软件止损 — 不下条件委托，记录到 sl_placed.json
            # Demo 模式下 STOP_MARKET 不可查询/不可取消，改由巡检轮询
            # TODO(真实账户): 切换真实账户后恢复交易所原生 STOP_MARKET 条件委托
            #   原生止损更可靠（服务器端执行），软件止损依赖本地进程存活
            if request.stop_loss:
                from pathlib import Path
                import json as _json
                sl_file = Path("~/.openclaw/workspace/sl_placed.json").expanduser()
                try:
                    sl_data = _json.loads(sl_file.read_text()) if sl_file.exists() else {}
                except Exception:
                    sl_data = {}
                norm_sym = symbol.replace('/', '').replace(':USDT', ':USDT')
                # ccxt symbol "ETH/USDT:USDT" → norm "ETHUSDT:USDT"
                norm_sym = symbol.replace('/', '')
                sl_data[norm_sym] = request.stop_loss
                sl_file.write_text(_json.dumps(sl_data, indent=2))
                response.stop_loss_order_id = "software_sl"
                logger.info(
                    f"软件止损已记录: {norm_sym} sl={request.stop_loss}"
                    f" (巡检轮询执行)")

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
                # 进化系统记录交易结果
                if effective_bot:
                    try:
                        from .evolution_manager import get_evolution_manager
                        evo = get_evolution_manager()
                        raw_sym = symbol.split(':')[0] if ':' in symbol else symbol
                        strategy = self.get_position_strategy(symbol, effective_bot)
                        evo.record_trade_result(
                            bot_id=effective_bot,
                            strategy=strategy,
                            symbol=raw_sym,
                            pnl=pos.unrealized_pnl,
                            is_win=pos.unrealized_pnl > 0,
                        )
                        logger.info(f"进化系统已记录: {effective_bot} [{strategy}] {raw_sym} pnl={pos.unrealized_pnl:.2f}")
                    except Exception as e:
                        logger.warning(f"进化系统记录失败: {e}")
                # V3.9.3: 注销持仓归属 — bot 平仓只注销自己
                if effective_bot:
                    # 有明确 bot → 只注销该 bot，其他 bot 不受影响
                    self.unregister_position(symbol, effective_bot)
                    logger.info(f"注销 {effective_bot} 在 {symbol} 的持仓归属")
                else:
                    # 无 bot_id → 全量平仓，注销所有
                    self.unregister_position(symbol)
                    # V3.5: 平仓后清理软件止损记录
                    try:
                        from pathlib import Path
                        import json as _json
                        sl_file = Path("~/.openclaw/workspace/sl_placed.json").expanduser()
                        if sl_file.exists():
                            sl_data = _json.loads(sl_file.read_text())
                            norm_sym = symbol.replace('/', '')
                            if norm_sym in sl_data:
                                del sl_data[norm_sym]
                                sl_file.write_text(_json.dumps(sl_data, indent=2))
                                logger.info(f"平仓后清理软件止损: {norm_sym}")
                    except Exception as e_clean:
                        logger.warning(f"平仓后清理止损记录失败: {e_clean}")
                    # 同时尝试清理交易所挂单（止盈单等）
                    try:
                        self.exchange.cancel_all_orders(symbol)
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

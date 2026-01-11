"""
基于 TimescaleDB 的信号检测引擎
直接从 PostgreSQL 读取 candles_1m 和 binance_futures_metrics_5m 数据

解耦改进：
- 移除 from bot.app import I18N 依赖
- i18n 改为返回 key + params，由消费端翻译
"""
import re
import logging
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field

from .base import BaseEngine
from ..config import get_database_url, COOLDOWN_SECONDS
from ..events import SignalEvent, SignalPublisher

logger = logging.getLogger(__name__)


@dataclass
class PGSignal:
    """基于 PG 数据的信号"""
    symbol: str
    signal_type: str
    direction: str  # BUY/SELL/ALERT
    strength: int   # 0-100
    message_key: str  # i18n key（由消费端翻译）
    message_params: Dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)
    timeframe: str = "5m"
    price: float = 0.0
    extra: Dict = field(default_factory=dict)


# 符号白名单正则：仅允许大写字母、数字、下划线，长度2-20
_SYMBOL_PATTERN = re.compile(r'^[A-Z0-9_]{2,20}$')


def _validate_symbols(symbols: List[str]) -> List[str]:
    """校验并过滤符号列表，防止SQL注入"""
    validated = []
    for s in symbols:
        if isinstance(s, str) and _SYMBOL_PATTERN.match(s):
            validated.append(s)
        else:
            logger.warning(f"Invalid symbol rejected: {s!r}")
    return validated


def _get_default_symbols() -> List[str]:
    """从统一配置获取监控币种"""
    try:
        from libs.common.symbols import get_configured_symbols
        symbols = get_configured_symbols()
        if symbols:
            return _validate_symbols(symbols)
    except Exception as e:
        logger.warning(f"获取配置币种失败，使用默认: {e}")
    return ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]


class PGSignalRules:
    """基于 PG 数据的信号规则集（解耦版：返回 i18n key）"""
    
    def check_price_surge(self, curr: Dict, prev: Dict, threshold_pct: float = 3.0) -> Optional[PGSignal]:
        """价格急涨信号"""
        if not prev or not curr:
            return None
        try:
            curr_close = float(curr.get("close", 0))
            prev_close = float(prev.get("close", 0))
            if prev_close == 0:
                return None
            change_pct = (curr_close - prev_close) / prev_close * 100
            if change_pct >= threshold_pct:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="price_surge",
                    direction="BUY",
                    strength=min(90, int(50 + change_pct * 10)),
                    message_key="signal.pg.msg.price_surge",
                    message_params={"pct": f"{change_pct:.2f}"},
                    price=curr_close,
                    extra={"change_pct": change_pct}
                )
        except Exception as e:
            logger.warning(f"check_price_surge error: {e}")
        return None
    
    def check_price_dump(self, curr: Dict, prev: Dict, threshold_pct: float = 3.0) -> Optional[PGSignal]:
        """价格急跌信号"""
        if not prev or not curr:
            return None
        try:
            curr_close = float(curr.get("close", 0))
            prev_close = float(prev.get("close", 0))
            if prev_close == 0:
                return None
            change_pct = (curr_close - prev_close) / prev_close * 100
            if change_pct <= -threshold_pct:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="price_dump",
                    direction="SELL",
                    strength=min(90, int(50 + abs(change_pct) * 10)),
                    message_key="signal.pg.msg.price_dump",
                    message_params={"pct": f"{abs(change_pct):.2f}"},
                    price=curr_close,
                    extra={"change_pct": change_pct}
                )
        except Exception as e:
            logger.warning(f"check_price_dump error: {e}")
        return None
    
    def check_volume_spike(self, curr: Dict, prev: Dict, multiplier: float = 5.0) -> Optional[PGSignal]:
        """成交量异常放大信号"""
        if not prev or not curr:
            return None
        try:
            curr_vol = float(curr.get("quote_volume", 0))
            prev_vol = float(prev.get("quote_volume", 0))
            if prev_vol == 0:
                return None
            vol_ratio = curr_vol / prev_vol
            if vol_ratio >= multiplier:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="volume_spike",
                    direction="ALERT",
                    strength=min(85, int(50 + vol_ratio * 5)),
                    message_key="signal.pg.msg.volume_spike",
                    message_params={"ratio": f"{vol_ratio:.1f}", "vol": f"{curr_vol/1e6:.2f}"},
                    price=float(curr.get("close", 0)),
                    extra={"vol_ratio": vol_ratio, "quote_volume": curr_vol}
                )
        except Exception as e:
            logger.warning(f"check_volume_spike error: {e}")
        return None
    
    def check_taker_buy_dominance(self, curr: Dict, threshold: float = 0.7) -> Optional[PGSignal]:
        """主动买入占比异常高"""
        if not curr:
            return None
        try:
            taker_buy = float(curr.get("taker_buy_quote_volume", 0))
            total_vol = float(curr.get("quote_volume", 0))
            if total_vol == 0:
                return None
            buy_ratio = taker_buy / total_vol
            if buy_ratio >= threshold:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="taker_buy_dominance",
                    direction="BUY",
                    strength=int(60 + buy_ratio * 30),
                    message_key="signal.pg.msg.taker_buy",
                    message_params={"pct": f"{buy_ratio*100:.1f}", "threshold": f"{threshold*100:.0f}"},
                    price=float(curr.get("close", 0)),
                    extra={"buy_ratio": buy_ratio}
                )
        except Exception as e:
            logger.warning(f"check_taker_buy_dominance error: {e}")
        return None
    
    def check_taker_sell_dominance(self, curr: Dict, threshold: float = 0.7) -> Optional[PGSignal]:
        """主动卖出占比异常高"""
        if not curr:
            return None
        try:
            taker_buy = float(curr.get("taker_buy_quote_volume", 0))
            total_vol = float(curr.get("quote_volume", 0))
            if total_vol == 0:
                return None
            sell_ratio = 1 - taker_buy / total_vol
            if sell_ratio >= threshold:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="taker_sell_dominance",
                    direction="SELL",
                    strength=int(60 + sell_ratio * 30),
                    message_key="signal.pg.msg.taker_sell",
                    message_params={"pct": f"{sell_ratio*100:.1f}", "threshold": f"{threshold*100:.0f}"},
                    price=float(curr.get("close", 0)),
                    extra={"sell_ratio": sell_ratio}
                )
        except Exception as e:
            logger.warning(f"check_taker_sell_dominance error: {e}")
        return None
    
    def check_oi_surge(self, curr: Dict, prev: Dict, threshold_pct: float = 5.0) -> Optional[PGSignal]:
        """持仓量急增信号"""
        if not prev or not curr:
            return None
        try:
            curr_oi = float(curr.get("sum_open_interest_value", 0))
            prev_oi = float(prev.get("sum_open_interest_value", 0))
            if prev_oi == 0:
                return None
            change_pct = (curr_oi - prev_oi) / prev_oi * 100
            if change_pct >= threshold_pct:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="oi_surge",
                    direction="ALERT",
                    strength=min(80, int(55 + change_pct * 3)),
                    message_key="signal.pg.msg.oi_surge",
                    message_params={"pct": f"{change_pct:.2f}", "oi": f"{curr_oi/1e9:.2f}"},
                    extra={"oi_change_pct": change_pct, "oi_value": curr_oi}
                )
        except Exception as e:
            logger.warning(f"check_oi_surge error: {e}")
        return None
    
    def check_oi_dump(self, curr: Dict, prev: Dict, threshold_pct: float = 5.0) -> Optional[PGSignal]:
        """持仓量急减信号"""
        if not prev or not curr:
            return None
        try:
            curr_oi = float(curr.get("sum_open_interest_value", 0))
            prev_oi = float(prev.get("sum_open_interest_value", 0))
            if prev_oi == 0:
                return None
            change_pct = (curr_oi - prev_oi) / prev_oi * 100
            if change_pct <= -threshold_pct:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="oi_dump",
                    direction="ALERT",
                    strength=min(80, int(55 + abs(change_pct) * 3)),
                    message_key="signal.pg.msg.oi_dump",
                    message_params={"pct": f"{abs(change_pct):.2f}", "oi": f"{curr_oi/1e9:.2f}"},
                    extra={"oi_change_pct": change_pct, "oi_value": curr_oi}
                )
        except Exception as e:
            logger.warning(f"check_oi_dump error: {e}")
        return None
    
    def check_top_trader_extreme_long(self, curr: Dict, threshold: float = 3.0) -> Optional[PGSignal]:
        """大户极度看多"""
        if not curr:
            return None
        try:
            ratio = float(curr.get("count_toptrader_long_short_ratio", 1))
            if ratio >= threshold:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="top_trader_extreme_long",
                    direction="ALERT",
                    strength=min(85, int(60 + ratio * 8)),
                    message_key="signal.pg.msg.top_long",
                    message_params={"ratio": f"{ratio:.2f}", "threshold": f"{threshold}"},
                    extra={"top_trader_ratio": ratio}
                )
        except Exception as e:
            logger.warning(f"check_top_trader_extreme_long error: {e}")
        return None
    
    def check_top_trader_extreme_short(self, curr: Dict, threshold: float = 0.5) -> Optional[PGSignal]:
        """大户极度看空"""
        if not curr:
            return None
        try:
            ratio = float(curr.get("count_toptrader_long_short_ratio", 1))
            if ratio <= threshold:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="top_trader_extreme_short",
                    direction="ALERT",
                    strength=min(85, int(60 + (1/ratio) * 5)),
                    message_key="signal.pg.msg.top_short",
                    message_params={"ratio": f"{ratio:.2f}", "threshold": f"{threshold}"},
                    extra={"top_trader_ratio": ratio}
                )
        except Exception as e:
            logger.warning(f"check_top_trader_extreme_short error: {e}")
        return None
    
    def check_taker_ratio_flip_long(self, curr: Dict, prev: Dict) -> Optional[PGSignal]:
        """主动成交多空比翻多"""
        if not prev or not curr:
            return None
        try:
            curr_ratio = float(curr.get("sum_taker_long_short_vol_ratio", 1))
            prev_ratio = float(prev.get("sum_taker_long_short_vol_ratio", 1))
            if prev_ratio < 1.0 and curr_ratio >= 1.2:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="taker_ratio_flip_long",
                    direction="BUY",
                    strength=70,
                    message_key="signal.pg.msg.taker_flip_long",
                    message_params={"prev": f"{prev_ratio:.2f}", "curr": f"{curr_ratio:.2f}"},
                    extra={"prev_ratio": prev_ratio, "curr_ratio": curr_ratio}
                )
        except Exception as e:
            logger.warning(f"check_taker_ratio_flip_long error: {e}")
        return None
    
    def check_taker_ratio_flip_short(self, curr: Dict, prev: Dict) -> Optional[PGSignal]:
        """主动成交多空比翻空"""
        if not prev or not curr:
            return None
        try:
            curr_ratio = float(curr.get("sum_taker_long_short_vol_ratio", 1))
            prev_ratio = float(prev.get("sum_taker_long_short_vol_ratio", 1))
            if prev_ratio > 1.0 and curr_ratio <= 0.8:
                return PGSignal(
                    symbol=curr.get("symbol", ""),
                    signal_type="taker_ratio_flip_short",
                    direction="SELL",
                    strength=70,
                    message_key="signal.pg.msg.taker_flip_short",
                    message_params={"prev": f"{prev_ratio:.2f}", "curr": f"{curr_ratio:.2f}"},
                    extra={"prev_ratio": prev_ratio, "curr_ratio": curr_ratio}
                )
        except Exception as e:
            logger.warning(f"check_taker_ratio_flip_short error: {e}")
        return None


class PGSignalEngine(BaseEngine):
    """基于 TimescaleDB 的信号检测引擎（解耦版）"""
    
    def __init__(self, db_url: str = None, symbols: List[str] = None):
        super().__init__()
        self.db_url = db_url or get_database_url()
        raw_symbols = symbols or _get_default_symbols()
        self.symbols = _validate_symbols(raw_symbols) if symbols else raw_symbols
        
        # 状态
        self.baseline_candles: Dict[str, Dict] = {}
        self.baseline_metrics: Dict[str, Dict] = {}
        self.cooldowns: Dict[str, float] = {}
        self.cooldown_seconds = COOLDOWN_SECONDS
        self._conn = None
        
        # 统计
        self.stats = {"checks": 0, "signals": 0, "errors": 0}
    
    def _get_conn(self):
        """获取数据库连接"""
        if self._conn is None or self._conn.closed:
            try:
                import psycopg2
                self._conn = psycopg2.connect(self.db_url)
            except ImportError:
                logger.error("psycopg2 not installed")
                return None
            except Exception as e:
                logger.error(f"Database connection failed: {e}")
                return None
        return self._conn
    
    def _is_cooled_down(self, signal_key: str) -> bool:
        last = self.cooldowns.get(signal_key, 0)
        return time.time() - last > self.cooldown_seconds
    
    def _set_cooldown(self, signal_key: str):
        self.cooldowns[signal_key] = time.time()
    
    def _fetch_latest_candles(self) -> Dict[str, Dict]:
        """获取最新K线数据"""
        conn = self._get_conn()
        if not conn:
            return {}
        
        result = {}
        try:
            query = """
                WITH ranked AS (
                    SELECT symbol, bucket_ts, open, high, low, close, volume, 
                           quote_volume, trade_count, taker_buy_volume, taker_buy_quote_volume,
                           ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY bucket_ts DESC) as rn
                    FROM market_data.candles_1m
                    WHERE symbol = ANY(%s)
                )
                SELECT symbol, bucket_ts, open, high, low, close, volume, 
                       quote_volume, trade_count, taker_buy_volume, taker_buy_quote_volume
                FROM ranked WHERE rn = 1
            """
            with conn.cursor() as cur:
                cur.execute(query, (self.symbols,))
                for row in cur.fetchall():
                    result[row[0]] = {
                        "symbol": row[0], "bucket_ts": row[1],
                        "open": row[2], "high": row[3], "low": row[4], "close": row[5],
                        "volume": row[6], "quote_volume": row[7], "trade_count": row[8],
                        "taker_buy_volume": row[9], "taker_buy_quote_volume": row[10],
                    }
        except Exception as e:
            logger.error(f"Fetch candles error: {e}")
            self.stats["errors"] += 1
        return result
    
    def _fetch_latest_metrics(self) -> Dict[str, Dict]:
        """获取最新期货指标数据"""
        conn = self._get_conn()
        if not conn:
            return {}
        
        result = {}
        try:
            query = """
                WITH ranked AS (
                    SELECT symbol, create_time, sum_open_interest, sum_open_interest_value,
                           count_toptrader_long_short_ratio, sum_toptrader_long_short_ratio,
                           count_long_short_ratio, sum_taker_long_short_vol_ratio,
                           ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY create_time DESC) as rn
                    FROM market_data.binance_futures_metrics_5m
                    WHERE symbol = ANY(%s)
                )
                SELECT symbol, create_time, sum_open_interest, sum_open_interest_value,
                       count_toptrader_long_short_ratio, sum_toptrader_long_short_ratio,
                       count_long_short_ratio, sum_taker_long_short_vol_ratio
                FROM ranked WHERE rn = 1
            """
            with conn.cursor() as cur:
                cur.execute(query, (self.symbols,))
                for row in cur.fetchall():
                    result[row[0]] = {
                        "symbol": row[0], "create_time": row[1],
                        "sum_open_interest": row[2], "sum_open_interest_value": row[3],
                        "count_toptrader_long_short_ratio": row[4],
                        "sum_toptrader_long_short_ratio": row[5],
                        "count_long_short_ratio": row[6],
                        "sum_taker_long_short_vol_ratio": row[7],
                    }
        except Exception as e:
            logger.error(f"Fetch metrics error: {e}")
            self.stats["errors"] += 1
        return result
    
    def check_signals(self) -> List[PGSignal]:
        """检查所有信号"""
        signals = []
        self.stats["checks"] += 1
        
        candles = self._fetch_latest_candles()
        metrics = self._fetch_latest_metrics()
        rules = PGSignalRules()
        
        for symbol in self.symbols:
            curr_candle = candles.get(symbol)
            prev_candle = self.baseline_candles.get(symbol)
            curr_metric = metrics.get(symbol)
            prev_metric = self.baseline_metrics.get(symbol)
            
            if not curr_candle:
                continue
            
            checkers = [
                (rules.check_price_surge, [curr_candle, prev_candle, 2.0]),
                (rules.check_price_dump, [curr_candle, prev_candle, 2.0]),
                (rules.check_volume_spike, [curr_candle, prev_candle, 5.0]),
                (rules.check_taker_buy_dominance, [curr_candle, 0.7]),
                (rules.check_taker_sell_dominance, [curr_candle, 0.7]),
            ]
            
            if curr_metric:
                checkers.extend([
                    (rules.check_oi_surge, [curr_metric, prev_metric, 3.0]),
                    (rules.check_oi_dump, [curr_metric, prev_metric, 3.0]),
                    (rules.check_top_trader_extreme_long, [curr_metric, 3.0]),
                    (rules.check_top_trader_extreme_short, [curr_metric, 0.5]),
                    (rules.check_taker_ratio_flip_long, [curr_metric, prev_metric]),
                    (rules.check_taker_ratio_flip_short, [curr_metric, prev_metric]),
                ])
            
            for checker, args in checkers:
                try:
                    signal = checker(*args)
                    if signal:
                        signal_key = f"{signal.symbol}_{signal.signal_type}"
                        if self._is_cooled_down(signal_key):
                            signals.append(signal)
                            self._set_cooldown(signal_key)
                            self.stats["signals"] += 1
                            logger.info(f"PG Signal: {signal.symbol} - {signal.signal_type}")
                            
                            # 发布事件
                            self._publish_event(signal)
                except Exception as e:
                    logger.warning(f"Check error: {e}")
                    self.stats["errors"] += 1
            
            self.baseline_candles[symbol] = curr_candle
            if curr_metric:
                self.baseline_metrics[symbol] = curr_metric
        
        return signals
    
    def _publish_event(self, signal: PGSignal):
        """发布信号事件"""
        event = SignalEvent(
            symbol=signal.symbol,
            signal_type=signal.signal_type,
            direction=signal.direction,
            strength=signal.strength,
            message_key=signal.message_key,
            message_params=signal.message_params,
            timestamp=signal.timestamp,
            timeframe=signal.timeframe,
            price=signal.price,
            source="pg",
            extra=signal.extra,
        )
        SignalPublisher.publish(event)
    
    def run_loop(self, interval: int = 60):
        """持续运行"""
        self._running = True
        logger.info(f"PG Signal Engine started, interval: {interval}s, symbols: {self.symbols}")
        
        while self._running:
            try:
                signals = self.check_signals()
                if signals:
                    for signal in signals:
                        self._emit_signal(signal)
                    logger.info(f"Found {len(signals)} PG signals")
            except Exception as e:
                logger.error(f"Run loop error: {e}")
            time.sleep(interval)
    
    def get_stats(self) -> Dict:
        return {**self.stats, "symbols": len(self.symbols), "cooldowns": len(self.cooldowns)}


# 单例
_pg_engine: Optional[PGSignalEngine] = None
_pg_engine_lock = threading.Lock()


def get_pg_engine(symbols: List[str] = None) -> PGSignalEngine:
    """获取 PG 信号引擎单例"""
    global _pg_engine
    if _pg_engine is None:
        with _pg_engine_lock:
            if _pg_engine is None:
                _pg_engine = PGSignalEngine(symbols=symbols)
    return _pg_engine


def start_pg_signal_loop(interval: int = 60, symbols: List[str] = None):
    """在后台线程启动 PG 信号检测循环"""
    def run():
        engine = get_pg_engine(symbols)
        engine.run_loop(interval=interval)
    
    thread = threading.Thread(target=run, daemon=True, name="PGSignalEngine")
    thread.start()
    return thread

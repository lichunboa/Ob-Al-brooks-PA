"""
威科夫五阶段检测器 (Wyckoff Detector)
V5.0 — wyckoff agent 独立信号源

检测模式:
  1. 吸筹 (Accumulation): OI下降 + 价格横盘 + Volume萎缩
  2. 派发 (Distribution): OI上升 + 价格横盘 + Volume放大
  3. Spring (弹簧): 价格突破区间下沿后快速收回
  4. UTAD (终极测试): 价格突破区间上沿后快速回落

数据依赖: TimescaleDB (与 pg_engine 共享连接)
"""

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from engines.base import BaseEngine
from events import SignalPublisher
from events.types import SignalEvent

logger = logging.getLogger(__name__)


@dataclass
class WyckoffSignal:
    """威科夫信号"""
    symbol: str
    signal_type: str  # accumulation/distribution/spring/utad
    direction: str    # BUY/SELL/ALERT
    strength: int     # 0-100
    message: str
    price: float = 0.0
    timeframe: str = "1h"
    phase: str = ""   # A/B/C/D/E
    extra: dict = field(default_factory=dict)


def _safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


class WyckoffDetector:
    """威科夫形态检测器"""

    def __init__(self):
        self.range_cache: dict[str, dict] = {}  # symbol → {high, low, bars, volume_profile}

    def detect_accumulation(self, candles: list[dict], metrics: list[dict]) -> Optional[WyckoffSignal]:
        """
        吸筹检测 (Phase B/C)
        条件:
        - 价格在窄幅区间内震荡 (< 5% range)
        - OI 下降或持平 (做空者平仓)
        - 成交量萎缩 (市场冷淡, 供应枯竭)
        - 持续 10+ K 线
        """
        if len(candles) < 15:
            return None

        recent = candles[-15:]
        highs = [_safe_float(c.get("high")) for c in recent]
        lows = [_safe_float(c.get("low")) for c in recent]
        volumes = [_safe_float(c.get("quote_volume")) for c in recent]

        if not all(highs) or not all(lows):
            return None

        range_high = max(highs)
        range_low = min(lows)
        range_pct = (range_high - range_low) / range_low * 100 if range_low > 0 else 999

        # 条件1: 窄幅区间 (< 8%)
        if range_pct > 8:
            return None

        # 条件2: 成交量萎缩（后半段成交量 < 前半段的 70%）
        first_half_vol = sum(volumes[:7]) / 7 if volumes[:7] else 1
        second_half_vol = sum(volumes[7:]) / max(len(volumes[7:]), 1) if volumes[7:] else 1
        vol_declining = second_half_vol < first_half_vol * 0.7

        # 条件3: OI 下降（如果有期货数据）
        oi_declining = False
        if metrics and len(metrics) >= 2:
            first_oi = _safe_float(metrics[0].get("open_interest"))
            last_oi = _safe_float(metrics[-1].get("open_interest"))
            if first_oi > 0:
                oi_change = (last_oi - first_oi) / first_oi
                oi_declining = oi_change < -0.02  # OI 下降 > 2%

        if not vol_declining and not oi_declining:
            return None

        # 计算强度
        strength = 60
        if vol_declining:
            strength += 10
        if oi_declining:
            strength += 10
        if range_pct < 4:
            strength += 5  # 极窄区间更强

        curr_price = _safe_float(recent[-1].get("close"))

        return WyckoffSignal(
            symbol=recent[-1].get("symbol", ""),
            signal_type="吸筹信号",
            direction="ALERT",  # 吸筹是观察信号，等 Spring 确认后才 BUY
            strength=strength,
            message=f"威科夫吸筹: 区间{range_pct:.1f}% | 量缩{'✅' if vol_declining else '❌'} | OI降{'✅' if oi_declining else '❌'}",
            price=curr_price,
            phase="B",
            extra={
                "range_pct": range_pct,
                "range_high": range_high,
                "range_low": range_low,
                "vol_declining": vol_declining,
                "oi_declining": oi_declining,
            },
        )

    def detect_distribution(self, candles: list[dict], metrics: list[dict]) -> Optional[WyckoffSignal]:
        """
        派发检测 (Phase B/C)
        条件:
        - 价格在窄幅区间内震荡
        - OI 上升 (做空者进场)
        - 成交量放大但价格不涨 (主力出货)
        """
        if len(candles) < 15:
            return None

        recent = candles[-15:]
        highs = [_safe_float(c.get("high")) for c in recent]
        lows = [_safe_float(c.get("low")) for c in recent]
        volumes = [_safe_float(c.get("quote_volume")) for c in recent]

        if not all(highs) or not all(lows):
            return None

        range_high = max(highs)
        range_low = min(lows)
        range_pct = (range_high - range_low) / range_low * 100 if range_low > 0 else 999

        if range_pct > 8:
            return None

        # 条件2: 成交量放大但价格不涨
        first_half_vol = sum(volumes[:7]) / 7 if volumes[:7] else 1
        second_half_vol = sum(volumes[7:]) / max(len(volumes[7:]), 1) if volumes[7:] else 1
        vol_increasing = second_half_vol > first_half_vol * 1.3

        # 条件3: OI 上升
        oi_increasing = False
        if metrics and len(metrics) >= 2:
            first_oi = _safe_float(metrics[0].get("open_interest"))
            last_oi = _safe_float(metrics[-1].get("open_interest"))
            if first_oi > 0:
                oi_change = (last_oi - first_oi) / first_oi
                oi_increasing = oi_change > 0.02

        if not vol_increasing and not oi_increasing:
            return None

        strength = 60
        if vol_increasing:
            strength += 10
        if oi_increasing:
            strength += 10
        if range_pct < 4:
            strength += 5

        curr_price = _safe_float(recent[-1].get("close"))

        return WyckoffSignal(
            symbol=recent[-1].get("symbol", ""),
            signal_type="派发信号",
            direction="ALERT",
            strength=strength,
            message=f"威科夫派发: 区间{range_pct:.1f}% | 量增{'✅' if vol_increasing else '❌'} | OI升{'✅' if oi_increasing else '❌'}",
            price=curr_price,
            phase="B",
            extra={
                "range_pct": range_pct,
                "range_high": range_high,
                "range_low": range_low,
                "vol_increasing": vol_increasing,
                "oi_increasing": oi_increasing,
            },
        )

    def detect_spring(self, candles: list[dict], range_info: dict = None) -> Optional[WyckoffSignal]:
        """
        Spring (弹簧) 检测 — Phase C 关键事件
        条件:
        - 价格突破区间下沿
        - 快速收回区间内（1-3根K线内）
        - 假突破后反向动能强
        """
        if len(candles) < 20:
            return None

        # 计算区间（如果没有提供）
        if not range_info:
            lookback = candles[-20:-3]  # 排除最近3根用于检测突破
            highs = [_safe_float(c.get("high")) for c in lookback]
            lows = [_safe_float(c.get("low")) for c in lookback]
            if not highs or not lows:
                return None
            range_info = {
                "high": max(highs),
                "low": min(lows),
            }

        range_low = range_info["low"]
        range_high = range_info["high"]

        # 检查最近3根K线是否有 Spring 模式
        recent_3 = candles[-3:]

        # 条件1: 某根K线低点突破区间下沿
        broke_below = False
        spring_bar = None
        for bar in recent_3:
            bar_low = _safe_float(bar.get("low"))
            if bar_low < range_low * 0.998:  # 稍有突破即可
                broke_below = True
                spring_bar = bar
                break

        if not broke_below:
            return None

        # 条件2: 最后一根K线收盘回到区间内
        curr = candles[-1]
        curr_close = _safe_float(curr.get("close"))
        if curr_close < range_low:
            return None  # 没有收回 → 不是 Spring，可能是真突破

        # 条件3: 收回后的K线是阳线（反向动能）
        curr_open = _safe_float(curr.get("open"))
        is_bull = curr_close > curr_open

        if not is_bull:
            return None

        strength = 78
        # 突破幅度越小 + 收回越快 → 越强
        spring_depth = (range_low - _safe_float(spring_bar.get("low"))) / range_low * 100
        if spring_depth < 1.0:
            strength += 5  # 浅 spring 更强

        return WyckoffSignal(
            symbol=curr.get("symbol", ""),
            signal_type="Spring弹簧",
            direction="BUY",
            strength=strength,
            message=f"威科夫Spring: 假突破下沿{spring_depth:.2f}%后收回，Phase C买入信号",
            price=curr_close,
            phase="C",
            extra={
                "range_high": range_high,
                "range_low": range_low,
                "spring_depth": spring_depth,
                "spring_bar_low": _safe_float(spring_bar.get("low")),
            },
        )

    def detect_utad(self, candles: list[dict], range_info: dict = None) -> Optional[WyckoffSignal]:
        """
        UTAD (Upthrust After Distribution) 检测 — Phase C 关键事件
        条件:
        - 价格突破区间上沿
        - 快速回落到区间内（1-3根K线内）
        - 假突破后反向动能强
        """
        if len(candles) < 20:
            return None

        if not range_info:
            lookback = candles[-20:-3]
            highs = [_safe_float(c.get("high")) for c in lookback]
            lows = [_safe_float(c.get("low")) for c in lookback]
            if not highs or not lows:
                return None
            range_info = {
                "high": max(highs),
                "low": min(lows),
            }

        range_high = range_info["high"]
        range_low = range_info["low"]

        recent_3 = candles[-3:]

        # 条件1: 某根K线高点突破区间上沿
        broke_above = False
        utad_bar = None
        for bar in recent_3:
            bar_high = _safe_float(bar.get("high"))
            if bar_high > range_high * 1.002:
                broke_above = True
                utad_bar = bar
                break

        if not broke_above:
            return None

        # 条件2: 最后一根K线收盘回到区间内
        curr = candles[-1]
        curr_close = _safe_float(curr.get("close"))
        if curr_close > range_high:
            return None

        # 条件3: 收回后的K线是阴线
        curr_open = _safe_float(curr.get("open"))
        is_bear = curr_close < curr_open

        if not is_bear:
            return None

        strength = 78
        utad_depth = (_safe_float(utad_bar.get("high")) - range_high) / range_high * 100
        if utad_depth < 1.0:
            strength += 5

        return WyckoffSignal(
            symbol=curr.get("symbol", ""),
            signal_type="UTAD终极测试",
            direction="SELL",
            strength=strength,
            message=f"威科夫UTAD: 假突破上沿{utad_depth:.2f}%后回落，Phase C做空信号",
            price=curr_close,
            phase="C",
            extra={
                "range_high": range_high,
                "range_low": range_low,
                "utad_depth": utad_depth,
                "utad_bar_high": _safe_float(utad_bar.get("high")),
            },
        )


class WyckoffEngine(BaseEngine):
    """威科夫检测引擎 — wyckoff agent 独立信号源"""

    def __init__(self, symbols: list[str] = None):
        super().__init__()
        from config import get_database_url
        self.symbols = symbols or ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
        self.db_url = get_database_url()
        self.detector = WyckoffDetector()
        self.cooldowns: dict[str, float] = {}
        self.cooldown_seconds = 1800  # 30 min cooldown
        self._conn = None
        self.stats = {"checks": 0, "signals": 0, "errors": 0}

    def _get_conn(self):
        if self._conn is None or self._conn.closed:
            try:
                import psycopg
                self._conn = psycopg.connect(self.db_url, autocommit=True)
            except Exception as e:
                logger.error(f"[Wyckoff] DB connection failed: {e}")
                return None
        return self._conn

    def _fetch_candles(self, symbol: str, limit: int = 30) -> list[dict]:
        """获取 1h K 线数据（威科夫分析需要更长周期）"""
        conn = self._get_conn()
        if not conn:
            return []

        try:
            query = """
                SELECT bucket_ts, open, high, low, close, volume
                FROM market_data.candles_1m
                WHERE symbol = %s
                ORDER BY bucket_ts DESC
                LIMIT %s
            """
            with conn.cursor() as cur:
                cur.execute(query, (symbol, limit * 60))  # 1h = 60 * 1m
                rows = cur.fetchall()

            if not rows:
                return []

            # 聚合为 1h K 线
            raw = list(reversed(rows))
            candles = []
            for i in range(0, len(raw) - 59, 60):
                chunk = raw[i:i + 60]
                if len(chunk) < 60:
                    continue
                candles.append({
                    "symbol": symbol,
                    "timestamp": chunk[0][0],
                    "open": float(chunk[0][1]),
                    "high": max(float(r[2]) for r in chunk),
                    "low": min(float(r[3]) for r in chunk),
                    "close": float(chunk[-1][4]),
                    "quote_volume": sum(float(r[5]) for r in chunk if r[5]),
                })

            return candles[-limit:]
        except Exception as e:
            logger.error(f"[Wyckoff] Fetch candles error for {symbol}: {e}")
            return []

    def _fetch_metrics(self, symbol: str, limit: int = 15) -> list[dict]:
        """获取期货指标数据（OI等）"""
        conn = self._get_conn()
        if not conn:
            return []

        try:
            query = """
                SELECT ts, open_interest, long_short_ratio,
                       top_trader_long_short_ratio, taker_buy_sell_ratio
                FROM market_data.futures_metrics
                WHERE symbol = %s
                ORDER BY ts DESC
                LIMIT %s
            """
            with conn.cursor() as cur:
                cur.execute(query, (symbol, limit))
                rows = cur.fetchall()

            return [
                {
                    "ts": row[0],
                    "open_interest": row[1],
                    "long_short_ratio": row[2],
                    "top_trader_ratio": row[3],
                    "taker_ratio": row[4],
                }
                for row in reversed(rows)
            ]
        except Exception as e:
            logger.error(f"[Wyckoff] Fetch metrics error for {symbol}: {e}")
            return []

    def _is_cooled_down(self, key: str) -> bool:
        last = self.cooldowns.get(key, 0)
        return time.time() - last >= self.cooldown_seconds

    def _publish(self, sig: WyckoffSignal):
        """发布威科夫信号"""
        ev = SignalEvent(
            symbol=sig.symbol,
            signal_type=sig.signal_type,
            direction=sig.direction,
            strength=sig.strength,
            message_key=f"wyckoff.{sig.signal_type}",
            message_params=sig.extra,
            timeframe=sig.timeframe,
            price=sig.price,
            source="wyckoff",  # V5.0: wyckoff 独立信号源
            category="wyckoff",
            extra={
                "phase": sig.phase,
                **sig.extra,
            },
        )
        SignalPublisher.publish(ev)
        self.stats["signals"] += 1

    def check_signals(self) -> list[WyckoffSignal]:
        """检查所有品种的威科夫信号"""
        self.stats["checks"] += 1
        signals = []

        for symbol in self.symbols:
            try:
                candles = self._fetch_candles(symbol, limit=25)
                metrics = self._fetch_metrics(symbol, limit=15)

                if len(candles) < 15:
                    continue

                # 1. 吸筹检测
                sig = self.detector.detect_accumulation(candles, metrics)
                if sig and self._is_cooled_down(f"{symbol}_accumulation"):
                    sig.symbol = symbol
                    sig.timeframe = "1h"
                    signals.append(sig)
                    self._publish(sig)
                    self.cooldowns[f"{symbol}_accumulation"] = time.time()

                # 2. 派发检测
                sig = self.detector.detect_distribution(candles, metrics)
                if sig and self._is_cooled_down(f"{symbol}_distribution"):
                    sig.symbol = symbol
                    sig.timeframe = "1h"
                    signals.append(sig)
                    self._publish(sig)
                    self.cooldowns[f"{symbol}_distribution"] = time.time()

                # 3. Spring 检测
                sig = self.detector.detect_spring(candles)
                if sig and self._is_cooled_down(f"{symbol}_spring"):
                    sig.symbol = symbol
                    sig.timeframe = "1h"
                    signals.append(sig)
                    self._publish(sig)
                    self.cooldowns[f"{symbol}_spring"] = time.time()

                # 4. UTAD 检测
                sig = self.detector.detect_utad(candles)
                if sig and self._is_cooled_down(f"{symbol}_utad"):
                    sig.symbol = symbol
                    sig.timeframe = "1h"
                    signals.append(sig)
                    self._publish(sig)
                    self.cooldowns[f"{symbol}_utad"] = time.time()

            except Exception as e:
                logger.error(f"[Wyckoff] Error checking {symbol}: {e}")
                self.stats["errors"] += 1

        return signals

    def run_loop(self, interval: int = 300):
        """运行检测循环（默认5分钟间隔，威科夫分析不需要高频）"""
        logger.info(f"[Wyckoff] Starting detection loop, interval={interval}s, symbols={self.symbols}")
        self._running = True

        while self._running:
            try:
                signals = self.check_signals()
                if signals:
                    logger.info(f"[Wyckoff] Found {len(signals)} signals")
            except Exception as e:
                logger.error(f"[Wyckoff] Loop error: {e}")
                self.stats["errors"] += 1

            time.sleep(interval)

    def get_stats(self) -> dict:
        return self.stats


# 单例
_wyckoff_engine = None

def get_wyckoff_engine() -> WyckoffEngine:
    global _wyckoff_engine
    if _wyckoff_engine is None:
        _wyckoff_engine = WyckoffEngine()
    return _wyckoff_engine

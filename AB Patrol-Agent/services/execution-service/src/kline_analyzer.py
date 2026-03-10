"""执行服务中的 K 线读取与摘要工具。"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class KlineAnalyzerMixin:
    """K 线抓取、指标计算与摘要格式化。"""

    def _normalize_symbol_for_ccxt(self, symbol: str) -> str:
        """标准化 symbol 为 ccxt 格式。"""
        if "/" in symbol:
            return symbol
        raw = symbol.split(":")[0] if ":" in symbol else symbol
        settle = symbol.split(":")[1] if ":" in symbol else "USDT"
        for quote in ["USDT", "BUSD", "USDC"]:
            if raw.endswith(quote):
                return f"{raw[:-len(quote)]}/{quote}:{settle}"
        return symbol

    @staticmethod
    def _calc_ema(values: list, period: int) -> list:
        """计算 EMA，返回与输入等长的列表。"""
        count = len(values)
        if count == 0:
            return []
        if count < period:
            return [None] * count

        result = [None] * (period - 1)
        sma = sum(values[:period]) / period
        result.append(sma)
        multiplier = 2.0 / (period + 1)
        for index in range(period, count):
            ema_value = values[index] * multiplier + result[-1] * (1 - multiplier)
            result.append(ema_value)
        return result

    @staticmethod
    def _calc_atr(ohlcv: list, period: int) -> list:
        """计算 ATR（Wilder 平滑）。"""
        count = len(ohlcv)
        if count == 0:
            return []

        true_ranges = []
        for index in range(count):
            high, low = ohlcv[index][2], ohlcv[index][3]
            close = ohlcv[index][4]
            if index == 0:
                true_ranges.append(high - low)
            else:
                previous_close = ohlcv[index - 1][4]
                true_range = max(high - low, abs(high - previous_close), abs(low - previous_close))
                true_ranges.append(true_range)

        if count < period:
            average = sum(true_ranges) / count if count else 0
            return [average] * count

        result = [None] * (period - 1)
        atr = sum(true_ranges[:period]) / period
        result.append(atr)
        for index in range(period, count):
            atr = (atr * (period - 1) + true_ranges[index]) / period
            result.append(atr)
        return result

    @staticmethod
    def _describe_bar(body: float, upper_wick: float, lower_wick: float, bar_range: float) -> str:
        """用中文描述 K 线形态。"""
        if bar_range == 0:
            return "十字星"

        abs_body = abs(body)
        body_ratio = abs_body / bar_range

        if body_ratio < 0.1:
            description = "十字星"
        elif body_ratio < 0.3:
            description = "小" + ("阳" if body >= 0 else "阴") + "线"
        elif body_ratio < 0.7:
            description = "中" + ("阳" if body >= 0 else "阴") + "线"
        else:
            description = "大" + ("阳" if body >= 0 else "阴") + "线"

        wick_parts = []
        if upper_wick > abs_body * 0.5 and upper_wick > bar_range * 0.2:
            wick_parts.append("长上影")
        if lower_wick > abs_body * 0.5 and lower_wick > bar_range * 0.2:
            wick_parts.append("长下影")

        if wick_parts:
            return description + "，" + "，".join(wick_parts)
        return description

    @staticmethod
    def _generate_kline_summary(ohlcv: list, ema20: list, atr14: list) -> dict:
        """生成 K 线摘要。"""
        if not ohlcv:
            return {}

        above = below = 0
        check_count = min(8, len(ohlcv))
        for index in range(-1, -check_count - 1, -1):
            if ema20[index] is None:
                continue
            if ohlcv[index][4] > ema20[index]:
                above += 1
            else:
                below += 1

        if above >= 6:
            trend = f"Always In Long — 最近 {above} 根 K 线在 EMA 上方"
        elif below >= 6:
            trend = f"Always In Short — 最近 {below} 根 K 线在 EMA 下方"
        elif above > below:
            trend = f"偏多但不确定 — EMA 上方 {above}, 下方 {below}"
        elif below > above:
            trend = f"偏空但不确定 — EMA 下方 {below}, 上方 {above}"
        else:
            trend = "方向不明 — 在 EMA 附近震荡"

        last_pullback = "无明显回调"
        scan = min(10, len(ohlcv) - 1)
        for index in range(-2, -scan - 2, -1):
            if abs(index) > len(ohlcv) or ema20[index] is None:
                continue
            low_value = ohlcv[index][3]
            high_value = ohlcv[index][2]
            close_value = ohlcv[index][4]
            ema_value = ema20[index]
            bars_ago = abs(index + 1)
            if low_value <= ema_value and close_value > ema_value:
                last_pullback = f"{bars_ago} 根前回调至 EMA，反弹"
                break
            if high_value >= ema_value and close_value < ema_value:
                last_pullback = f"{bars_ago} 根前反弹至 EMA，回落"
                break

        recent = ohlcv[-20:] if len(ohlcv) >= 20 else ohlcv
        range_high = max(bar[2] for bar in recent)
        range_low = min(bar[3] for bar in recent)
        range_size = range_high - range_low

        current_atr = atr14[-1] if atr14[-1] is not None else 1
        ratio = range_size / current_atr if current_atr > 0 else 1
        if ratio < 1.5:
            day_type = "窄幅区间"
        elif ratio < 2.5:
            day_type = "窄幅趋势" if (above >= 6 or below >= 6) else "正常区间"
        elif ratio < 4:
            day_type = "趋势日" if (above >= 6 or below >= 6) else "宽幅区间"
        else:
            day_type = "大趋势日"

        return {
            "trend": trend,
            "last_pullback": last_pullback,
            "range": f"{range_low:.1f}-{range_high:.1f} ({range_size:.1f} 点区间)",
            "day_type": day_type,
        }

    def fetch_klines(self, symbol: str, interval: str = "1h", limit: int = 50) -> dict:
        """获取 K 线 + EMA20 + ATR14。"""
        ccxt_symbol = self._normalize_symbol_for_ccxt(symbol)
        fetch_limit = limit + 30
        try:
            ohlcv = self.exchange.fetch_ohlcv(ccxt_symbol, interval, limit=fetch_limit)
        except Exception as exc:
            logger.error(f"fetch_ohlcv 失败: {ccxt_symbol} {interval}: {exc}")
            return {"error": str(exc), "symbol": symbol}

        if not ohlcv:
            return {"error": "无数据", "symbol": symbol}

        closes = [bar[4] for bar in ohlcv]
        ema20_full = self._calc_ema(closes, 20)
        atr14_full = self._calc_atr(ohlcv, 14)

        ohlcv = ohlcv[-limit:]
        ema20 = ema20_full[-limit:]
        atr14 = atr14_full[-limit:]

        bars = []
        for index, bar in enumerate(ohlcv):
            timestamp, open_price, high_price, low_price, close_price, volume = bar[:6]
            body = close_price - open_price
            upper_wick = high_price - max(open_price, close_price)
            lower_wick = min(open_price, close_price) - low_price
            bar_range = high_price - low_price

            time_str = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M")
            entry = {
                "time": time_str,
                "O": round(open_price, 2),
                "H": round(high_price, 2),
                "L": round(low_price, 2),
                "C": round(close_price, 2),
                "vol": round(volume, 2),
                "body": f"{'+' if body >= 0 else ''}{body:.1f} ({'bull' if body >= 0 else 'bear'})",
                "upper_wick": round(upper_wick, 2),
                "lower_wick": round(lower_wick, 2),
                "bar_type": self._describe_bar(body, upper_wick, lower_wick, bar_range),
            }

            if ema20[index] is not None:
                versus = close_price - ema20[index]
                entry["ema20"] = round(ema20[index], 2)
                entry["vs_ema20"] = f"{'+' if versus >= 0 else ''}{versus:.1f}"
            if atr14[index] is not None:
                entry["atr14"] = round(atr14[index], 2)
            bars.append(entry)

        current_close = ohlcv[-1][4]
        current_ema = ema20[-1] if ema20[-1] is not None else current_close
        current_atr = atr14[-1] if atr14[-1] is not None else 0
        versus_pct = (current_close - current_ema) / current_ema * 100 if current_ema else 0

        summary = self._generate_kline_summary(ohlcv, ema20, atr14)
        raw_symbol = symbol.replace("/", "").split(":")[0]
        return {
            "symbol": raw_symbol,
            "interval": interval,
            "ema20": round(current_ema, 2),
            "atr14": round(current_atr, 2),
            "price_vs_ema": f"{'+' if versus_pct >= 0 else ''}{current_close - current_ema:.1f} ({versus_pct:+.2f}%)",
            "bars": bars,
            "summary": summary,
        }

    def fetch_multi_tf_klines(self, symbol: str, limit: int = 150) -> dict:
        """获取多周期 K 线快照。"""
        result = {}
        for timeframe in ["5m", "15m", "1h"]:
            data = self.fetch_klines(symbol, timeframe, limit=limit)
            result[timeframe] = data
            if "bars" in data:
                actual_count = len(data["bars"])
                if actual_count < limit * 0.9:
                    logger.warning(f"K线数量不足: {symbol} {timeframe} 预期{limit}根，实际{actual_count}根")
        return result

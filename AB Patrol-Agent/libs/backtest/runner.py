"""
BacktestRunner — 回测主控

核心思路: 不复制策略代码，而是 monkey-patch 真实 PA 引擎:
  1. 替换 engine._fetch_candles → MarketReplay.get_candles
  2. 替换冷却系统 → 内存 dict + 虚拟时钟
  3. 通过 SignalPublisher.subscribe() 捕获信号
  4. 用 ScoringEngine + BackgroundAnalyzer 评分
  5. 用 SimExchange 模拟交易执行

这样修改 pa_engine.py 的策略/参数后，重跑回测就能直接看到效果。
"""

import logging
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd

from .data_loader import DataLoader
from .market_replay import MarketReplay
from .background import BackgroundAnalyzer, BackgroundContext
from .scoring import ScoringEngine
from .sim_exchange import SimExchange
from .report import BacktestResult

logger = logging.getLogger(__name__)


@dataclass
class BacktestConfig:
    """回测配置"""
    symbols: list[str] = field(default_factory=lambda: ["BTCUSDT"])
    timeframes: list[str] = field(default_factory=lambda: ["5m"])
    days: int = 30
    start_date: str = None
    end_date: str = None
    threshold: int = 80          # 评分阈值
    max_holding_bars: int = 48   # 最大持仓 K 线数
    fee_rate: float = 0.0004     # 手续费率
    cache_dir: str = None        # 数据缓存目录
    parquet_path: str = None     # 直接指定 Parquet 文件
    verbose: bool = False


# 周期→过滤器周期映射（信号周期→质量分析/趋势确认/逆势过滤）
TF_FILTER_MAP = {
    "1m":  {"quality": "5m",  "trend": "15m", "counter": "1h"},
    "5m":  {"quality": "5m",  "trend": "15m", "counter": "1h"},
    "15m": {"quality": "15m", "trend": "1h",  "counter": "4h"},
    "30m": {"quality": "30m", "trend": "1h",  "counter": "4h"},
    "1h":  {"quality": "1h",  "trend": "4h",  "counter": "1d"},
}

# Al Brooks: 反转策略允许逆 Always In 方向交易
REVERSAL_STRATEGIES = {
    "双重顶", "双重底", "楔形顶", "楔形底",
    "急速通道", "末端旗形", "看衰突破",
}


class MemoryCooldownStorage:
    """内存冷却存储（替代 SQLite CooldownStorage）"""

    def __init__(self):
        self._data: dict[str, float] = {}

    def get(self, key: str) -> float:
        return self._data.get(key, 0.0)

    def set(self, key: str, timestamp: float = None):
        self._data[key] = timestamp or time.time()

    def load_all(self) -> dict[str, float]:
        return dict(self._data)

    def cleanup(self, max_age: int = 86400):
        cutoff = time.time() - max_age
        self._data = {k: v for k, v in self._data.items() if v >= cutoff}


class VirtualClock:
    """虚拟时钟 — 替代 time.time() 用于冷却判断"""

    def __init__(self):
        self._time: float = 0.0

    def set_time(self, dt: datetime):
        self._time = dt.timestamp()

    def time(self) -> float:
        return self._time


class BacktestRunner:
    """回测主控"""

    def __init__(self, config: BacktestConfig = None):
        self.config = config or BacktestConfig()
        self.scoring = ScoringEngine()
        self.bg_analyzer = BackgroundAnalyzer()

        # 统计
        self._signals_generated = 0
        self._signals_passed = 0
        self._signals_blocked_bg = 0
        self._signals_blocked_score = 0
        self._signals_blocked_rr = 0
        self._signals_blocked_vol = 0      # 威科夫: 量价不足
        self._signals_blocked_momentum = 0  # 量化: RSI/OBV/15m 不通过
        self._score_histogram = {}  # 分数分布诊断

    def run(self) -> BacktestResult:
        """
        运行回测

        流程:
          1. 加载历史数据 → MarketReplay
          2. 创建真实 PA 引擎实例
          3. Monkey-patch 数据源和冷却系统
          4. 步进历史数据，每步调用 engine.check_signals()
          5. 捕获信号 → 评分 → SimExchange 开仓
          6. 检查 SL/TP → 输出报告
        """
        cfg = self.config

        # 日期处理: 如果指定了 parquet_path，从数据末尾往回推
        if cfg.days and not cfg.start_date:
            if cfg.parquet_path:
                # 从 Parquet 文件读取数据时间范围
                _df_peek = pd.read_parquet(cfg.parquet_path, columns=["timestamp"])
                _df_peek["timestamp"] = pd.to_datetime(
                    _df_peek["timestamp"], utc=True
                ).dt.tz_localize(None)
                data_end = _df_peek["timestamp"].max()
                cfg.end_date = data_end.strftime("%Y-%m-%d")
                cfg.start_date = (data_end - timedelta(days=cfg.days)).strftime("%Y-%m-%d")
            else:
                cfg.end_date = cfg.end_date or datetime.now().strftime("%Y-%m-%d")
                cfg.start_date = (datetime.now() - timedelta(days=cfg.days)).strftime("%Y-%m-%d")

        # 缓存目录
        if not cfg.cache_dir:
            cfg.cache_dir = str(Path(__file__).parent.parent.parent / "data" / "backtest_cache")

        print("=" * 60)
        print("  可复用回测模块 (Real PA Engine)")
        print("=" * 60)
        print(f"  币种: {', '.join(cfg.symbols)}")
        print(f"  周期: {', '.join(cfg.timeframes)}")
        print(f"  日期: {cfg.start_date or '全部'} ~ {cfg.end_date or '全部'}")
        print(f"  阈值: {cfg.threshold}")
        print()

        # Step 1: 加载数据
        print("Step 1: 加载历史数据...")
        df_1m_dict = {}
        for symbol in cfg.symbols:
            if cfg.parquet_path:
                df = DataLoader.load_from_parquet(cfg.parquet_path, symbol,
                                                  cfg.start_date, cfg.end_date)
            else:
                df = DataLoader.load(symbol, cfg.start_date, cfg.end_date, cfg.cache_dir)
            if df.empty:
                print(f"  {symbol}: 无数据，跳过")
                continue
            df_1m_dict[symbol] = df

        if not df_1m_dict:
            print("  所有币种均无数据!")
            return BacktestResult(symbol=",".join(cfg.symbols))

        # Step 2: 构建 MarketReplay
        print("\nStep 2: 构建数据回放器...")
        all_timeframes = list(set(
            cfg.timeframes + ["1m", "5m", "15m", "1h", "4h", "1d"]
        ))
        replay = MarketReplay(cfg.symbols, df_1m_dict, all_timeframes)
        print(f"  总步数: {replay.total_steps:,}")

        # Step 3: 创建真实 PA 引擎 + Monkey-patch
        print("\nStep 3: 创建 PA 引擎 + monkey-patch...")
        engine, signal_collector, vclock = self._create_patched_engine(cfg, replay)
        print(f"  引擎策略数: {len(cfg.timeframes)} 周期 × {len(cfg.symbols)} 币种")

        # Step 4: 创建模拟交易所
        exchange = SimExchange(fee_rate=cfg.fee_rate, max_holding_bars=cfg.max_holding_bars)

        # Step 4b: 检查大周期数据可用性
        # 用最后一个 5m 时间戳临时推进虚拟时钟
        _last_ts = replay._step_timestamps[-1] if replay._step_timestamps else None
        if _last_ts:
            replay.advance_to(_last_ts)
            for sym in cfg.symbols:
                _h4 = replay.get_h4_candles(sym, limit=50)
                _d1 = replay.get_daily_candles(sym, limit=50)
                print(f"  {sym}: 4h={len(_h4)}根, 1d={len(_d1)}根")
                if _h4:
                    _bg = self.bg_analyzer.analyze(_d1, _h4)
                    print(f"  背景: {_bg.background} | 4h: {_bg.h4_trend}(斜率{_bg.h4_slope:.4f}) "
                          f"| daily: {_bg.daily_trend}(斜率{_bg.daily_slope:.4f})")
                else:
                    # 检查原始数据
                    _raw = replay._data.get(sym, {})
                    for tf, df in _raw.items():
                        if not isinstance(df, pd.DataFrame):
                            continue
                        print(f"    {tf}: {len(df)}行")
            replay._virtual_time = None  # 重置

        # Step 5: 步进回测
        print(f"\nStep 4: 开始步进回测...")
        total_steps = replay.total_steps
        step_count = 0

        for timestamp in replay.timestamps("5m"):
            step_count += 1
            if step_count % 2000 == 0:
                pct = step_count / total_steps * 100
                print(f"  进度: {pct:.1f}% ({step_count:,}/{total_steps:,}) | "
                      f"信号: {self._signals_generated} | "
                      f"交易: {len(exchange.closed_trades)}", end="\r")

            # 推进虚拟时钟
            ts = timestamp
            if hasattr(ts, "to_pydatetime"):
                ts = ts.to_pydatetime()
            replay.advance_to(ts)
            vclock.set_time(ts)

            # 检查持仓 SL/TP
            for symbol in cfg.symbols:
                candle = replay.get_current_candle(symbol, "5m")
                if candle:
                    exchange.on_candle(candle)

            # 调用真实 PA 引擎检测
            signal_collector.clear()
            try:
                engine.check_signals()
            except Exception as e:
                logger.debug(f"引擎检测异常 (step {step_count}): {e}")
                continue

            # 处理捕获的信号
            if not signal_collector:
                continue

            for event in list(signal_collector):
                self._signals_generated += 1

                # 修正时间戳: PASignal 用 datetime.now()，需替换为虚拟时间
                event.timestamp = ts

                # 获取大周期背景
                bg = self._get_background(replay, event.symbol, ts)

                # 信号周期 → 过滤器周期映射
                sig_tf = getattr(event, "timeframe", cfg.timeframes[0])
                ftf = TF_FILTER_MAP.get(sig_tf, TF_FILTER_MAP["5m"])

                # === 三域融合质量过滤 ===
                candles_q = replay.get_candles(
                    event.symbol, ftf["quality"], limit=30
                )

                # 1. 威科夫: 量价确认
                vol_ok = self._check_volume(candles_q)

                # 2. 量化: RSI 动量方向确认
                rsi = self._calc_rsi(candles_q)
                rsi_ok = self._check_rsi_direction(rsi, event.direction)

                # 3. 威科夫: OBV 趋势确认
                obv_ok = self._check_obv_direction(candles_q, event.direction)

                # 4. 量化: 高周期趋势确认
                tf_ok = self._check_higher_tf_trend(
                    replay, event.symbol, event.direction, ftf["trend"]
                )

                quality_score = sum([vol_ok, rsi_ok, obv_ok, tf_ok])

                # === Al Brooks: 多周期 Always In 方向过滤 ===
                # 原则: 交易方向跟随更大级别的 Always In 方向
                # CycleIdentifier 做 5m 级别判断, 这里用 4h/daily 做最终确认
                always_in = "neutral"
                if bg.daily_trend == "多头" and bg.h4_trend == "多头":
                    always_in = "long"
                elif bg.daily_trend == "空头" and bg.h4_trend == "空头":
                    always_in = "short"
                elif bg.h4_trend == "多头":
                    always_in = "lean_long"   # 4h 偏多, 但 daily 不确认
                elif bg.h4_trend == "空头":
                    always_in = "lean_short"  # 4h 偏空

                is_reversal = event.signal_type in REVERSAL_STRATEGIES
                # 顺势策略: 必须与高级别 Always In 一致
                _trend_strats = {"高1", "低1", "高2", "低2", "收线追进",
                                 "20均线缺口", "突破回调", "首次均线缺口"}
                is_trend_strat = event.signal_type in _trend_strats

                if always_in == "long" and event.direction == "SELL":
                    if not is_reversal:
                        self._signals_blocked_bg += 1
                        continue
                elif always_in == "short" and event.direction == "BUY":
                    if not is_reversal:
                        self._signals_blocked_bg += 1
                        continue
                # 4h 偏向性: 趋势策略需要与 4h 方向一致
                elif always_in == "lean_long" and event.direction == "SELL":
                    if is_trend_strat:
                        self._signals_blocked_bg += 1
                        continue
                elif always_in == "lean_short" and event.direction == "BUY":
                    if is_trend_strat:
                        self._signals_blocked_bg += 1
                        continue

                # === Al Brooks: 信号棒质量综合评估 ===
                # CycleIdentifier 已做信号棒质量检查，这里降低阈值避免重复过滤
                if len(candles_q) >= 5:
                    sig_bar = candles_q[-1]
                    prev_bars = candles_q[-6:-1]
                    sbq = self._signal_bar_quality(
                        sig_bar, prev_bars, event.direction)
                    if sbq < 0.3:
                        self._signals_blocked_momentum += 1
                        continue

                # === 威科夫: No Demand 模式 ===
                if len(candles_q) >= 6:
                    curr_c = candles_q[-1]
                    spread = curr_c.high - curr_c.low
                    avg_spread = sum(
                        (c.high - c.low) for c in candles_q[-6:-1]
                    ) / 5
                    avg_vol = sum(
                        c.volume for c in candles_q[-6:-1]
                    ) / 5
                    if (avg_vol > 0 and spread < avg_spread * 0.6
                            and curr_c.volume < avg_vol * 0.7):
                        self._signals_blocked_vol += 1
                        continue

                # === 量化: 逆势过滤（SELL 专用，反转策略豁免）===
                # Al Brooks: 末端旗形/双重顶/楔形顶 就是在多头市场顶部做空
                # 这类反转策略不应被上升动能过滤（它们的目的正是捕捉末端反转）
                if event.direction == "SELL" and not is_reversal:
                    counter_candles = replay.get_candles(
                        event.symbol, ftf["counter"], limit=25
                    )
                    if len(counter_candles) >= 22:
                        closes_ct = [c.close for c in counter_candles]
                        ema_ct = self._simple_ema(closes_ct, 20)
                        if len(ema_ct) >= 3:
                            slope_ct = (
                                (ema_ct[-1] - ema_ct[-3])
                                / ema_ct[-3] * 100
                            )
                            if slope_ct > 0.1:
                                self._signals_blocked_momentum += 1
                                continue

                # 三域质量门槛
                # 顺势信号: q>=2；逆日线方向信号: q>=3（三域融合更严格）
                # Al Brooks: 逆大势需要更多确认，减少在强趋势中的错误逆势入场
                min_q = 3 if (
                    (bg.daily_trend == "多头" and event.direction == "SELL") or
                    (bg.daily_trend == "空头" and event.direction == "BUY")
                ) else 2
                if quality_score < min_q:
                    self._signals_blocked_momentum += 1
                    continue

                # 评分
                score, reasons = self.scoring.score_signal(
                    event, bg,
                    exchange.daily_losses,
                    exchange.strategy_history,
                )

                # 分数分布诊断
                bucket = (score // 10) * 10  # 0-9, 10-19, ...
                self._score_histogram[bucket] = self._score_histogram.get(bucket, 0) + 1

                if score == 0:
                    self._signals_blocked_rr += 1
                    continue
                if score < cfg.threshold:
                    self._signals_blocked_score += 1
                    continue

                self._signals_passed += 1

                # 统一 SL/TP 策略: 收紧SL + 远TP安全网
                # SCALP 是主要盈利来源，TP 是趋势行情的奖金
                risk = abs(event.price - event.stop_loss)
                if risk > 0:
                    # 最大风险上限: 风险距离 > 3.0% 的信号跳过
                    # Al Brooks: 加密货币结构性止损天生较宽(ATR-based)，1.2%过于严格
                    # 5m BTC典型ATR止损 = 1-3%，允许到3%才合理
                    risk_pct = risk / event.price * 100
                    if risk_pct > 3.0:
                        self._signals_blocked_rr += 1
                        continue
                    # SL 缩窄 20%: 减少平均亏损
                    sl_m, tp_m = 0.8, 2.5
                    if event.direction == "BUY":
                        event.stop_loss = event.price - risk * sl_m
                        event.take_profit = event.price + risk * tp_m
                    else:
                        event.stop_loss = event.price + risk * sl_m
                        event.take_profit = event.price - risk * tp_m

                # 开仓
                exchange.place_order(event, score, bg.background)

                if cfg.verbose:
                    print(f"\n  {ts} | {event.signal_type} {event.direction} "
                          f"@ {event.price:.2f} | 评分: {score} | {bg.background} "
                          f"| Q:{quality_score}/4 V:{vol_ok} R:{rsi_ok} O:{obv_ok} T:{tf_ok}")

        # Step 6: 强制平仓剩余持仓
        if exchange.open_trades:
            # 用最后一根 K 线平仓
            for symbol in cfg.symbols:
                candle = replay.get_current_candle(symbol, "5m")
                if candle:
                    exchange.force_close_all(candle)
                    break

        print(f"\n  回测完成!")
        print(f"  信号: {self._signals_generated} | 通过: {self._signals_passed} | "
              f"交易: {len(exchange.closed_trades)}")
        print(f"  拦截: 背景={self._signals_blocked_bg} | "
              f"量价/动量={self._signals_blocked_vol + self._signals_blocked_momentum} | "
              f"评分={self._signals_blocked_score} | "
              f"R:R={self._signals_blocked_rr}")

        # 分数分布（单分精度）
        if self._score_histogram:
            print(f"\n  === 分数分布 ===")
            for score_val in sorted(self._score_histogram.keys()):
                count = self._score_histogram[score_val]
                bar = "#" * min(count // 10, 50)
                marker = " <<<" if score_val == cfg.threshold else ""
                print(f"  {score_val:3d}: {count:5d} {bar}{marker}")

        # Step 7: 生成报告
        result = BacktestResult.from_exchange(
            exchange,
            symbol=",".join(cfg.symbols),
            threshold=cfg.threshold,
            signals_generated=self._signals_generated,
            signals_passed=self._signals_passed,
            signals_blocked_bg=self._signals_blocked_bg,
            signals_blocked_score=self._signals_blocked_score,
            signals_blocked_rr=self._signals_blocked_rr,
            days=cfg.days,
        )

        # 清理: 恢复 SignalPublisher 状态
        self._cleanup_engine()

        return result

    def _create_patched_engine(self, cfg, replay):
        """
        创建 monkey-patched PA 引擎

        关键替换:
          - _fetch_candles → replay.get_candles
          - _cooldown_storage → MemoryCooldownStorage
          - time.time() (在冷却判断中) → VirtualClock
          - SignalPublisher → 信号收集器
        """
        # 导入真实 PA 引擎
        signal_service_src = Path(__file__).parent.parent.parent / "services" / "signal-service" / "src"
        if str(signal_service_src) not in sys.path:
            sys.path.insert(0, str(signal_service_src))

        # 设置环境变量避免引擎初始化时连数据库
        os.environ.setdefault("DATABASE_URL", "postgresql://localhost:5432/dummy")

        from engines.pa_engine import PASignalEngine
        from events import SignalPublisher

        # 创建引擎实例（不使用单例）
        engine = PASignalEngine(symbols=cfg.symbols, timeframes=cfg.timeframes)

        # 1. 替换数据源
        engine._fetch_candles = replay.get_candles

        # 2. 替换冷却存储
        engine._cooldown_storage = MemoryCooldownStorage()
        engine.cooldowns = {}

        # 3. 虚拟时钟 — 替换 _is_cooled_down 中的 time.time()
        vclock = VirtualClock()
        original_is_cooled_down = engine._is_cooled_down

        def patched_is_cooled_down(signal_key: str, cooldown_seconds: float = None) -> bool:
            last = engine.cooldowns.get(signal_key, 0)
            effective_cooldown = cooldown_seconds if cooldown_seconds is not None else engine.cooldown_seconds
            return vclock.time() - last > effective_cooldown

        engine._is_cooled_down = patched_is_cooled_down

        # 同时 patch _set_cooldown 使用虚拟时钟
        def patched_set_cooldown(signal_key: str) -> bool:
            ts = vclock.time()
            try:
                engine._cooldown_storage.set(signal_key, ts)
                engine.cooldowns[signal_key] = ts
                return True
            except Exception as e:
                logger.error(f"Cooldown storage error: {e}")
                return False

        engine._set_cooldown = patched_set_cooldown

        # 4. 替换 RiskManager 的日期检查为虚拟时钟
        def patched_check_daily_reset():
            date_str = datetime.fromtimestamp(vclock.time()).strftime("%Y-%m-%d")
            if date_str != engine.risk_manager._last_reset_date:
                engine.risk_manager.daily_signal_count.clear()
                engine.risk_manager.consecutive_count.clear()
                engine.risk_manager._last_reset_date = date_str

        engine.risk_manager._check_daily_reset = patched_check_daily_reset

        # 5. 注册信号收集器
        signal_collector = []
        SignalPublisher.clear()
        SignalPublisher.subscribe(lambda event: signal_collector.append(event))

        self._signal_publisher_cls = SignalPublisher
        return engine, signal_collector, vclock

    def _cleanup_engine(self):
        """清理: 恢复 SignalPublisher"""
        if hasattr(self, "_signal_publisher_cls"):
            self._signal_publisher_cls.clear()

    def _get_background(self, replay: MarketReplay, symbol: str, current_time: datetime) -> BackgroundContext:
        """获取当前时间点的大周期背景"""
        daily_candles = replay.get_daily_candles(symbol, limit=50)
        h4_candles = replay.get_h4_candles(symbol, limit=50)

        # EMA20 需要 20 根 + 斜率 lookback 5 = 25; 日线可能不够但 4h 一般足够
        # 降低门槛: 有 EMA20 最低需求即可 (21根), 数据不足时背景分析自动退化
        if len(h4_candles) < 21:
            return BackgroundContext("中性", "中性", "⚪ 中性", 0, 0)

        return self.bg_analyzer.analyze(daily_candles, h4_candles)

    # === 三域融合过滤器 ===

    def _check_volume(self, candles, lookback=20, threshold=0.8):
        """威科夫: 信号棒成交量 >= 均量 × threshold
        Al Brooks: 好的信号棒不一定需要超高成交量，只要不是 No Demand 即可
        0.8 = 至少达到平均成交量的 80%（原来1.0太严格，50%棒子都失败）
        """
        if len(candles) < lookback + 1:
            return True
        curr_vol = candles[-1].volume
        if curr_vol == 0:
            return True  # 无量数据则放行
        avg_vol = sum(
            c.volume for c in candles[-(lookback + 1):-1]
        ) / lookback
        if avg_vol == 0:
            return True
        return curr_vol >= avg_vol * threshold

    def _calc_rsi(self, candles, period=14):
        """量化: 计算 RSI"""
        if len(candles) < period + 1:
            return 50.0
        closes = [c.close for c in candles[-(period + 1):]]
        deltas = [
            closes[i] - closes[i - 1] for i in range(1, len(closes))
        ]
        gains = [d if d > 0 else 0 for d in deltas]
        losses = [-d if d < 0 else 0 for d in deltas]
        avg_gain = sum(gains) / period
        avg_loss = sum(losses) / period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _check_rsi_direction(self, rsi, direction):
        """量化: RSI 方向过滤 — 不在极值区逆势"""
        if direction == "BUY":
            return rsi < 72  # 不追超买
        else:
            return rsi > 28  # 不追超卖

    def _check_obv_direction(self, candles, direction):
        """威科夫: OBV 趋势确认 — 资金流方向"""
        if len(candles) < 25:
            return True
        # 计算 OBV
        obv = [0.0]
        for i in range(1, len(candles)):
            if candles[i].close > candles[i - 1].close:
                obv.append(obv[-1] + candles[i].volume)
            elif candles[i].close < candles[i - 1].close:
                obv.append(obv[-1] - candles[i].volume)
            else:
                obv.append(obv[-1])
        # OBV 5期 vs 前5期 趋势
        if len(obv) < 10:
            return True
        recent = sum(obv[-5:]) / 5
        earlier = sum(obv[-10:-5]) / 5
        if direction == "BUY":
            return recent >= earlier  # OBV 不下降
        else:
            return recent <= earlier  # OBV 不上升

    def _check_higher_tf_trend(self, replay, symbol, direction, tf="15m"):
        """量化: 高周期 EMA20 趋势确认"""
        candles_tf = replay.get_candles(symbol, tf, limit=30)
        if len(candles_tf) < 25:
            return True
        closes = [c.close for c in candles_tf]
        ema = self._simple_ema(closes, 20)
        if len(ema) < 3:
            return True
        slope = (ema[-1] - ema[-3]) / ema[-3] * 100
        price = candles_tf[-1].close
        above = price > ema[-1]
        if direction == "BUY":
            return slope > -0.05 or above
        else:
            return slope < 0.05 or not above

    @staticmethod
    def _signal_bar_quality(sig_bar, prev_bars, direction) -> float:
        """Al Brooks 信号棒质量评分 (0-1)"""
        bar_range = sig_bar.high - sig_bar.low
        if bar_range <= 0:
            return 0.0
        body = abs(sig_bar.close - sig_bar.open)
        score = 0.0
        # 1. 实体比例 (0-0.3)
        score += min(0.3, (body / bar_range) * 0.4)
        # 2. 收盘位置 (0-0.3)
        close_pos = (sig_bar.close - sig_bar.low) / bar_range
        if direction == "BUY":
            score += close_pos * 0.3
        else:
            score += (1.0 - close_pos) * 0.3
        # 3. 相对大小 (0-0.2)
        if prev_bars:
            avg_r = sum(c.high - c.low for c in prev_bars) / len(prev_bars)
            if avg_r > 0:
                score += min(0.2, (bar_range / avg_r) * 0.1)
            else:
                score += 0.1
        else:
            score += 0.1
        # 4. 逆向影线惩罚 (0-0.2)
        if direction == "BUY":
            bad_wick = sig_bar.high - max(sig_bar.open, sig_bar.close)
        else:
            bad_wick = min(sig_bar.open, sig_bar.close) - sig_bar.low
        score += max(0.0, 0.2 - (bad_wick / bar_range) * 0.4)
        return score

    @staticmethod
    def _simple_ema(prices, period):
        """EMA 计算"""
        if len(prices) < period:
            return []
        m = 2 / (period + 1)
        ema = [sum(prices[:period]) / period]
        for p in prices[period:]:
            ema.append((p - ema[-1]) * m + ema[-1])
        return ema

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
import math
import os
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from importlib import import_module
from pathlib import Path

import pandas as pd

from .background import BackgroundAnalyzer, BackgroundContext
from .cycle_identifier import BACKTEST_STRATEGY_MATRIX, CycleIdentifier, classify_backtest_market_state
from .data_loader import DataLoader
from .market_replay import MarketReplay
from .report import BacktestResult
from .scoring import ScoringEngine
from .sim_exchange import SimExchange
from .strategy_filters import (
    StrategySelection,
    classify_management_style,
    default_management_profile,
    describe_strategy_selection,
    is_strategy_allowed,
    management_score_floor,
    resolve_strategy_selection,
)

logger = logging.getLogger(__name__)
_RUNTIME_TARGET_ROUTER = None


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
    initial_capital: float = 10000.0  # 账户初始资金，用于复利与回撤统计
    engine_threshold_overrides: dict[str, int] = field(default_factory=dict)  # 回测专用周期阈值覆盖
    strategy_whitelist: list[str] = field(default_factory=list)  # 策略白名单（支持族别名）
    strategy_blacklist: list[str] = field(default_factory=list)  # 策略黑名单（支持族别名）
    strategy_profile: str = ""  # 策略配置档
    management_profile: str = "default"  # 回测专用管理模板


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
    "急速通道", "末端旗形", "看衰突破", "第二腿陷阱",
}

ROUTE_REVERSAL_STRATEGIES = {
    *REVERSAL_STRATEGIES,
    "头肩顶MTR",
    "头肩底MTR",
}

ROUTE_MINOR_REVERSAL_STRATEGIES = {
    "双重顶",
    "双重底",
    "楔形顶",
    "楔形底",
}

ROUTE_TREND_STRATEGIES = {
    "高1",
    "低1",
    "高2",
    "低2",
    "收线追进",
    "20均线缺口",
    "第一均线缺口",
    "突破回调",
    "ii突破",
    "ioi突破",
    "HOY突破",
}

TR_BLSHS_BUY_SIGNALS = {"高1", "高2", "双重底", "头肩底MTR", "楔形底"}
TR_BLSHS_SELL_SIGNALS = {"低1", "低2", "双重顶", "头肩顶MTR", "楔形顶"}
LIMIT_FRIENDLY_REVERSAL_SIGNALS = {
    "双重顶",
    "双重底",
    "楔形顶",
    "楔形底",
    "头肩顶MTR",
    "头肩底MTR",
}

CHANNEL_SCALP_SIGNALS = {
    "高1",
    "低1",
    "高2",
    "低2",
    "20均线缺口",
    "MAG 20/20 Setup",
    "第一均线缺口",
    "突破回调",
}

BREAKOUT_CHASE_SIGNALS = {
    "收线追进",
    "ii突破",
    "ioi突破",
    "HOY突破",
    "LOY突破",
}

CHANNEL_FIRST_PULLBACK_SIGNALS = {"高1", "低1"}
CHANNEL_RECOVERY_SIGNALS = {"高2", "低2", "突破回调"}
EMA_RECOVERY_SIGNALS = {"20均线缺口", "MAG 20/20 Setup", "第一均线缺口"}
TR_LEG_RECOVERY_SIGNALS = {
    *CHANNEL_FIRST_PULLBACK_SIGNALS,
    *CHANNEL_RECOVERY_SIGNALS,
    *EMA_RECOVERY_SIGNALS,
}
BROOKS_REVERSAL_SIGNALS = {
    "双重顶",
    "双重底",
    "楔形顶",
    "楔形底",
    "头肩顶MTR",
    "头肩底MTR",
    "急速通道",
    "末端旗形",
    "看衰突破",
    "第二腿陷阱",
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
        self._signals_blocked_strategy = 0  # 策略白名单/黑名单拦截
        self._signals_blocked_route = 0  # Brooks 全局路由拦截
        self._score_histogram = {}  # 分数分布诊断
        self._route_block_reasons: dict[str, int] = defaultdict(int)
        self._entry_block_reasons: dict[str, int] = defaultdict(int)

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
        selection = self._resolve_strategy_selection(cfg)
        management_profile = (
            cfg.management_profile or default_management_profile(cfg.strategy_profile)
        ).strip() or "default"

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
        print(f"  初始资金: ${cfg.initial_capital:,.2f}")
        if cfg.engine_threshold_overrides:
            overrides = ", ".join(f"{tf}:{value}" for tf, value in sorted(cfg.engine_threshold_overrides.items()))
            print(f"  引擎阈值覆盖: {overrides}")
        if selection.is_active:
            print(f"  策略过滤: {describe_strategy_selection(selection)}")
            if selection.description:
                print(f"  过滤依据: {selection.description}")
        if management_profile != "default":
            print(f"  管理模板: {management_profile}")
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
        print("\nStep 4: 开始步进回测...")
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
                    market_snapshot = self._build_management_snapshot(replay, symbol, candle)
                    exchange.on_candle(candle, market_snapshot)

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
                if not is_strategy_allowed(event.signal_type, selection):
                    self._signals_blocked_strategy += 1
                    continue

                # 获取大周期背景
                bg = self._get_background(replay, event.symbol, ts)
                extra = dict(getattr(event, "extra", {}) or {})
                extra["background_label"] = str(bg.background or "")
                event.extra = extra

                # 信号周期 → 过滤器周期映射
                sig_tf = getattr(event, "timeframe", cfg.timeframes[0])
                ftf = TF_FILTER_MAP.get(sig_tf, TF_FILTER_MAP["5m"])

                # === 三域融合质量过滤 ===
                candles_q = replay.get_candles(
                    event.symbol, ftf["quality"], limit=30
                )
                market_state = self._build_market_state_context(event, candles_q)
                higher_market_state = self._attach_higher_tf_context(event, replay)
                self._apply_entry_route_adjustments(event, market_state, higher_market_state, candles_q)
                self._attach_structure_context(event, candles_q, replay)
                self._attach_playbook_context(event, market_state, higher_market_state)

                reentry_ctx = exchange.match_reentry(event)
                if reentry_ctx:
                    extra = dict(getattr(event, "extra", {}) or {})
                    extra["reentry_candidate"] = True
                    extra["reentry_attempt"] = int(reentry_ctx.get("next_attempt", 1) or 1)
                    event.extra = extra

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
                _trend_strats = {
                    "高1",
                    "低1",
                    "高2",
                    "低2",
                    "收线追进",
                    "20均线缺口",
                    "MAG 20/20 Setup",
                    "第一均线缺口",
                    "突破回调",
                }
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
                route_allowed, route_reason = self._check_route_consistency(
                    event,
                    market_state,
                    higher_market_state,
                    score,
                )
                if not route_allowed:
                    self._signals_blocked_route += 1
                    self._route_block_reasons[str(route_reason or "未知路由原因")] += 1
                    continue
                entry_ready, entry_reason = self._check_entry_readiness(event, score)
                if not entry_ready:
                    self._signals_blocked_rr += 1
                    self._entry_block_reasons[str(entry_reason or "未知入场原因")] += 1
                    continue

                # 分数分布诊断
                bucket = (score // 10) * 10  # 0-9, 10-19, ...
                self._score_histogram[bucket] = self._score_histogram.get(bucket, 0) + 1

                if score == 0:
                    self._signals_blocked_rr += 1
                    continue
                score_floor = max(
                    int(cfg.threshold),
                    int(
                        management_score_floor(
                            event.signal_type,
                            management_profile,
                            market_state=str((getattr(event, "extra", {}) or {}).get("market_state", "") or ""),
                            higher_market_state=str((getattr(event, "extra", {}) or {}).get("higher_market_state", "") or ""),
                            timeframe=str(getattr(event, "timeframe", "") or ""),
                            entry_type=str(getattr(event, "entry_type", "STOP") or "STOP"),
                            route_style=str((getattr(event, "extra", {}) or {}).get("route_style", "") or ""),
                        )
                    ),
                )
                if score < score_floor:
                    self._signals_blocked_score += 1
                    continue

                self._signals_passed += 1

                # 统一 SL/TP 策略: 收紧SL + 远TP安全网
                # SCALP 是主要盈利来源，TP 是趋势行情的奖金
                risk = abs(event.price - event.stop_loss)
                if risk > 0:
                    if not self._apply_management_template(event, bg, management_profile):
                        self._signals_blocked_rr += 1
                        continue

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

        print("\n  回测完成!")
        print(f"  信号: {self._signals_generated} | 通过: {self._signals_passed} | "
              f"交易: {len(exchange.closed_trades)}")
        print(f"  拦截: 背景={self._signals_blocked_bg} | "
              f"策略过滤={self._signals_blocked_strategy} | "
              f"路由={self._signals_blocked_route} | "
              f"量价/动量={self._signals_blocked_vol + self._signals_blocked_momentum} | "
              f"评分={self._signals_blocked_score} | "
              f"R:R={self._signals_blocked_rr}")

        # 分数分布（单分精度）
        if self._score_histogram:
            print("\n  === 分数分布 ===")
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
            signals_blocked_strategy=self._signals_blocked_strategy,
            signals_blocked_route=self._signals_blocked_route,
            route_block_reasons=dict(self._route_block_reasons),
            entry_block_reasons=dict(self._entry_block_reasons),
            days=cfg.days,
            initial_capital=cfg.initial_capital,
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

        # 设置环境变量避免引擎初始化时连数据库。
        # 真实数据源会在后面被 replay 替换，因此回测阶段不应强依赖 PG。
        os.environ["DATABASE_URL"] = "postgresql://localhost:5432/dummy"

        try:
            import storage.cooldown as cooldown_module
        except ImportError:
            from signal_service.src.storage import cooldown as cooldown_module  # pragma: no cover

        memory_cooldown = MemoryCooldownStorage()
        cooldown_module._storage = memory_cooldown
        cooldown_module.get_cooldown_storage = lambda: memory_cooldown

        from engines.pa_engine import PASignalEngine
        from events import SignalPublisher

        # 创建引擎实例（不使用单例）
        engine = PASignalEngine(symbols=cfg.symbols, timeframes=cfg.timeframes)

        # 回测阶段允许覆盖各周期信号阈值，用于参数实验，不污染生产默认值。
        for timeframe, threshold in (cfg.engine_threshold_overrides or {}).items():
            if timeframe in engine.timeframe_config:
                engine.timeframe_config[timeframe]["signal_threshold"] = int(threshold)

        # 1. 替换数据源
        engine._fetch_candles = replay.get_candles

        # 2. 替换冷却存储
        engine._cooldown_storage = MemoryCooldownStorage()
        engine.cooldowns = {}

        # 3. 虚拟时钟 — 替换 _is_cooled_down 中的 time.time()
        vclock = VirtualClock()
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

    @staticmethod
    def _resolve_strategy_selection(cfg: BacktestConfig) -> StrategySelection:
        """解析白名单 / 黑名单配置。"""
        return resolve_strategy_selection(
            whitelist_terms=cfg.strategy_whitelist,
            blacklist_terms=cfg.strategy_blacklist,
            profile=cfg.strategy_profile,
        )

    @staticmethod
    def _higher_structure_timeframe(timeframe: str) -> str:
        """给信号周期映射一个更高一级的结构周期。"""
        return {
            "1m": "5m",
            "5m": "15m",
            "15m": "1h",
            "30m": "1h",
            "1h": "4h",
        }.get(str(timeframe or ""), "")

    @staticmethod
    def _load_runtime_target_router():
        """懒加载 runtime 侧的磁体路由工具。"""
        global _RUNTIME_TARGET_ROUTER
        if _RUNTIME_TARGET_ROUTER is not None:
            return _RUNTIME_TARGET_ROUTER
        runtime_root = Path(__file__).resolve().parents[2] / "runtime"
        if str(runtime_root) not in sys.path:
            sys.path.insert(0, str(runtime_root))
        _RUNTIME_TARGET_ROUTER = import_module("utils.target_magnets")
        return _RUNTIME_TARGET_ROUTER

    def _identify_market_state_snapshot(self, candles_q) -> dict | None:
        """从一组 K 线提取可复用的市场状态快照。"""
        if len(candles_q) < 20:
            return None

        closes = [candle.close for candle in candles_q]
        ema20 = self._simple_ema(closes, 20)
        if len(ema20) < 5:
            return None

        market_state = CycleIdentifier.identify(candles_q, ema20)
        market_key = classify_backtest_market_state(market_state) or ""
        recommendation = BACKTEST_STRATEGY_MATRIX.get(market_key, {})
        range_span = max(market_state.range_high - market_state.range_low, 0.0)
        range_position = 0.5
        if range_span > 0:
            range_position = (candles_q[-1].close - market_state.range_low) / range_span
        range_position = max(0.0, min(1.0, range_position))
        if range_position <= 0.33:
            range_edge = "bottom"
        elif range_position >= 0.67:
            range_edge = "top"
        else:
            range_edge = "middle"
        return {
            "state": market_state,
            "market_state": market_key,
            "strategy_recommendation": recommendation,
            "pullback_ratio": market_state.pullback_ratio,
            "follow_through": market_state.follow_through,
            "channel_type": market_state.channel_type,
            "range_position": range_position,
            "range_edge": range_edge,
        }

    def _build_market_state_context(self, event, candles_q):
        """构建回测用的市场状态与策略推荐矩阵。"""
        snapshot = self._identify_market_state_snapshot(candles_q)
        if not snapshot:
            return None

        extra = dict(getattr(event, "extra", {}) or {})
        extra["market_state"] = snapshot["market_state"]
        extra["strategy_recommendation"] = snapshot["strategy_recommendation"]
        extra["pullback_ratio"] = snapshot["pullback_ratio"]
        extra["follow_through"] = snapshot["follow_through"]
        extra["channel_type"] = snapshot["channel_type"]
        extra["range_position"] = snapshot["range_position"]
        extra["range_edge"] = snapshot["range_edge"]
        event.extra = extra
        return snapshot["state"]

    def _attach_higher_tf_context(self, event, replay):
        """给信号补一个更高一级的结构状态，避免 5m 脱离 15m 乱做。"""
        higher_tf = self._higher_structure_timeframe(str(getattr(event, "timeframe", "") or ""))
        if not higher_tf:
            return None

        candles_higher = replay.get_candles(event.symbol, higher_tf, limit=30)
        snapshot = self._identify_market_state_snapshot(candles_higher)
        if not snapshot:
            return None

        extra = dict(getattr(event, "extra", {}) or {})
        extra["higher_timeframe"] = higher_tf
        extra["higher_market_state"] = snapshot["market_state"]
        extra["higher_pullback_ratio"] = snapshot["pullback_ratio"]
        extra["higher_follow_through"] = snapshot["follow_through"]
        extra["higher_channel_type"] = snapshot["channel_type"]
        extra["higher_range_position"] = snapshot["range_position"]
        extra["higher_range_edge"] = snapshot["range_edge"]
        event.extra = extra
        return snapshot["state"]

    @staticmethod
    def _nearest_levels_from_swings(
        price: float,
        swings: list[dict],
        fallback_low: float = 0.0,
        fallback_high: float = 0.0,
    ) -> tuple[float, float]:
        """从 swing 序列里提取最近支撑/阻力。"""
        supports = [
            float(swing["price"])
            for swing in swings
            if swing["type"] == "low" and float(swing["price"]) < price
        ]
        resistances = [
            float(swing["price"])
            for swing in swings
            if swing["type"] == "high" and float(swing["price"]) > price
        ]
        if fallback_low and fallback_low < price:
            supports.append(float(fallback_low))
        if fallback_high and fallback_high > price:
            resistances.append(float(fallback_high))
        nearest_support = max(supports) if supports else 0.0
        nearest_resistance = min(resistances) if resistances else 0.0
        return nearest_support, nearest_resistance

    @staticmethod
    def _round_number_step(price: float) -> float:
        """按价格数量级生成 Brooks 常见整数关口。"""
        price = abs(float(price or 0.0))
        if price >= 50000:
            return 1000.0
        if price >= 10000:
            return 500.0
        if price >= 1000:
            return 50.0
        if price >= 100:
            return 10.0
        if price >= 10:
            return 1.0
        if price >= 1:
            return 0.1
        if price >= 0.1:
            return 0.01
        return 0.001

    @classmethod
    def _round_number_candidates(cls, price: float) -> list[float]:
        """围绕当前价格生成相邻整数关口。"""
        price = float(price or 0.0)
        if price <= 0:
            return []
        step = cls._round_number_step(price)
        lower = math.floor(price / step) * step
        upper = lower + step
        values = []
        for candidate in (lower - step, lower, upper, upper + step):
            if candidate > 0:
                values.append(round(candidate, 6))
        return values

    @staticmethod
    def _locate_signal_candle(candles_q, signal_bar_high: float, signal_bar_low: float):
        """尽量在最近几根 K 线里定位真实信号棒。"""
        if not candles_q:
            return None
        for candle in reversed(candles_q[-4:]):
            if (
                abs(float(candle.high) - float(signal_bar_high or 0.0)) < 1e-9
                and abs(float(candle.low) - float(signal_bar_low or 0.0)) < 1e-9
            ):
                return candle
        return candles_q[-1]

    @staticmethod
    def _trendline_break_confirmed(candles_q, direction: str) -> bool:
        """用最近 swing 近似判断是否已经打破通道趋势线。"""
        if len(candles_q) < 8:
            return False
        window = candles_q[-12:] if len(candles_q) >= 12 else candles_q
        swings = CycleIdentifier._find_swings(window)
        last_index = len(window) - 1
        last_close = float(window[-1].close)
        if direction == "BUY":
            highs = [swing for swing in swings if swing["type"] == "high"]
            if len(highs) >= 2 and highs[-1]["idx"] != highs[-2]["idx"]:
                left, right = highs[-2], highs[-1]
                slope = (float(right["price"]) - float(left["price"])) / max(1, int(right["idx"]) - int(left["idx"]))
                projected = float(right["price"]) + slope * (last_index - int(right["idx"]))
                return last_close > projected
            return sum(1 for candle in window[-5:] if float(candle.close) > float(candle.open)) >= 4
        lows = [swing for swing in swings if swing["type"] == "low"]
        if len(lows) >= 2 and lows[-1]["idx"] != lows[-2]["idx"]:
            left, right = lows[-2], lows[-1]
            slope = (float(right["price"]) - float(left["price"])) / max(1, int(right["idx"]) - int(left["idx"]))
            projected = float(right["price"]) + slope * (last_index - int(right["idx"]))
            return last_close < projected
        return sum(1 for candle in window[-5:] if float(candle.close) < float(candle.open)) >= 4

    @classmethod
    def _failed_breakout_evidence(
        cls,
        candles_q,
        direction: str,
        signal_bar_high: float,
        signal_bar_low: float,
    ) -> tuple[bool, str, dict[str, float | bool]]:
        """判断是否已有失败突破证据，以及谁被困在场内。"""
        if len(candles_q) < 6:
            return False, "", {}
        signal_bar = cls._locate_signal_candle(candles_q, signal_bar_high, signal_bar_low)
        if signal_bar is None:
            return False, "", {}
        prior = candles_q[-6:-1]
        if not prior:
            return False, "", {}
        signal_range = max(float(signal_bar.high) - float(signal_bar.low), 1e-9)
        signal_quality = cls._signal_bar_quality(signal_bar, prior, direction)
        prior_window = prior[-3:] if len(prior) >= 3 else prior
        if direction == "BUY":
            close_position = (float(signal_bar.close) - float(signal_bar.low)) / signal_range
            tail_ratio = (min(float(signal_bar.open), float(signal_bar.close)) - float(signal_bar.low)) / signal_range
            broke_prior = float(signal_bar.low) < min(float(candle.low) for candle in prior)
            broke_micro = float(signal_bar.low) < min(float(candle.low) for candle in prior_window)
            closed_back = float(signal_bar.close) > float(signal_bar.low) + signal_range * 0.55
            reclaimed_prior_close = float(signal_bar.close) > max(float(prior[-1].close), float(prior[-1].open))
            evidence = broke_prior and tail_ratio >= 0.30 and closed_back
            return evidence, "bear" if evidence else "", {
                "signal_bar_quality": signal_quality,
                "signal_bar_tail_ratio": tail_ratio,
                "signal_bar_close_position": close_position,
                "reclaimed_prior_close": reclaimed_prior_close,
                "broke_micro_extreme": broke_micro,
            }

        close_position = (float(signal_bar.high) - float(signal_bar.close)) / signal_range
        tail_ratio = (float(signal_bar.high) - max(float(signal_bar.open), float(signal_bar.close))) / signal_range
        broke_prior = float(signal_bar.high) > max(float(candle.high) for candle in prior)
        broke_micro = float(signal_bar.high) > max(float(candle.high) for candle in prior_window)
        closed_back = float(signal_bar.close) < float(signal_bar.high) - signal_range * 0.55
        reclaimed_prior_close = float(signal_bar.close) < min(float(prior[-1].close), float(prior[-1].open))
        evidence = broke_prior and tail_ratio >= 0.30 and closed_back
        return evidence, "bull" if evidence else "", {
            "signal_bar_quality": signal_quality,
            "signal_bar_tail_ratio": tail_ratio,
            "signal_bar_close_position": close_position,
            "reclaimed_prior_close": reclaimed_prior_close,
            "broke_micro_extreme": broke_micro,
        }

    @staticmethod
    def _prior_leg_context(
        candles_q,
        direction: str,
        market_state: str,
        higher_market_state: str,
    ) -> tuple[str, int, float]:
        """估算信号前一腿更像趋势腿还是 TR 里的 second-leg trap。"""
        if len(candles_q) < 7:
            return "", 0, 0.0
        leg = candles_q[-7:-1]
        overlap_ratio = CycleIdentifier._overlap_ratio(leg)
        range_like = (
            "TR" in str(market_state or "").upper()
            or "range" in str(market_state or "").lower()
            or "TR" in str(higher_market_state or "").upper()
            or "range" in str(higher_market_state or "").lower()
        )
        if direction == "BUY":
            directional_bars = sum(1 for candle in leg if float(candle.close) < float(candle.open))
            progressive_bars = sum(1 for i in range(1, len(leg)) if float(leg[i].low) <= float(leg[i - 1].low))
        else:
            directional_bars = sum(1 for candle in leg if float(candle.close) > float(candle.open))
            progressive_bars = sum(1 for i in range(1, len(leg)) if float(leg[i].high) >= float(leg[i - 1].high))

        if directional_bars >= 4 and progressive_bars >= 4 and overlap_ratio <= 0.32:
            return "trend_leg", len(leg), overlap_ratio
        if range_like and overlap_ratio >= 0.42:
            return "tr_second_leg", len(leg), overlap_ratio
        if overlap_ratio >= 0.35:
            return "tr_leg", len(leg), overlap_ratio
        return "mixed", len(leg), overlap_ratio

    def _attach_structure_context(self, event, candles_q, replay) -> None:
        """补充关键位、目标路径与结构止损诊断。"""
        if not candles_q:
            return

        extra = dict(getattr(event, "extra", {}) or {})
        entry_price = float(getattr(event, "price", 0.0) or 0.0)
        stop_loss = float(getattr(event, "stop_loss", 0.0) or 0.0)
        take_profit = float(getattr(event, "take_profit", 0.0) or 0.0)
        direction = str(getattr(event, "direction", "") or "")
        higher_tf = str(extra.get("higher_timeframe", "") or "")
        higher_candles = replay.get_candles(event.symbol, higher_tf, limit=40) if higher_tf else []
        current_swings = CycleIdentifier._find_swings(candles_q[-30:] if len(candles_q) >= 30 else candles_q)
        higher_swings = CycleIdentifier._find_swings(
            higher_candles[-30:] if len(higher_candles) >= 30 else higher_candles
        )
        range_low = float(min(candle.low for candle in candles_q[-20:])) if len(candles_q) >= 5 else 0.0
        range_high = float(max(candle.high for candle in candles_q[-20:])) if len(candles_q) >= 5 else 0.0
        higher_range_low = (
            float(min(candle.low for candle in higher_candles[-20:]))
            if len(higher_candles) >= 5
            else 0.0
        )
        higher_range_high = (
            float(max(candle.high for candle in higher_candles[-20:]))
            if len(higher_candles) >= 5
            else 0.0
        )

        nearest_support, nearest_resistance = self._nearest_levels_from_swings(
            entry_price,
            [*current_swings, *higher_swings],
            fallback_low=min(value for value in [range_low, higher_range_low] if value > 0) if any(
                value > 0 for value in [range_low, higher_range_low]
            ) else 0.0,
            fallback_high=max(value for value in [range_high, higher_range_high] if value > 0) if any(
                value > 0 for value in [range_high, higher_range_high]
            ) else 0.0,
        )

        signal_bar_high = float(getattr(event, "signal_bar_high", 0.0) or 0.0)
        signal_bar_low = float(getattr(event, "signal_bar_low", 0.0) or 0.0)
        if signal_bar_high <= 0:
            signal_bar_high = float(candles_q[-1].high)
        if signal_bar_low <= 0:
            signal_bar_low = float(candles_q[-1].low)

        trendline_break_confirmed = self._trendline_break_confirmed(candles_q, direction)
        failed_breakout_evidence, trapped_side, signal_bar_context = self._failed_breakout_evidence(
            candles_q,
            direction,
            signal_bar_high,
            signal_bar_low,
        )
        prior_leg_context, prior_leg_bars, prior_leg_overlap_ratio = self._prior_leg_context(
            candles_q,
            direction,
            str(extra.get("market_state", "") or ""),
            str(extra.get("higher_market_state", "") or ""),
        )

        perfect_stop = stop_loss
        actual_risk = abs(entry_price - stop_loss)
        entry_type = str(getattr(event, "entry_type", "STOP") or "STOP").upper()
        route_style = str(extra.get("route_style", "") or "")
        if direction == "BUY":
            stop_candidates = [value for value in [signal_bar_low, nearest_support, higher_range_low] if value > 0]
            if stop_candidates:
                perfect_stop = min(stop_candidates)
            stop_structure_ok = stop_loss < signal_bar_low * 0.999 if signal_bar_low > 0 else stop_loss < entry_price
            if entry_type == "STOP" and nearest_support > 0 and stop_loss > nearest_support:
                stop_structure_ok = False
        else:
            stop_candidates = [value for value in [signal_bar_high, nearest_resistance, higher_range_high] if value > 0]
            if stop_candidates:
                perfect_stop = max(stop_candidates)
            stop_structure_ok = stop_loss > signal_bar_high * 1.001 if signal_bar_high > 0 else stop_loss > entry_price
            if entry_type == "STOP" and nearest_resistance > 0 and stop_loss < nearest_resistance:
                stop_structure_ok = False

        perfect_risk = abs(entry_price - perfect_stop)

        actual_to_perfect_risk_ratio = actual_risk / perfect_risk if perfect_risk > 0 else 1.0

        router = self._load_runtime_target_router()
        mm_target = float(extra.get("measured_move_target", 0.0) or 0.0)
        ab_mm: dict[str, object] = {}
        if direction == "BUY" and mm_target > entry_price:
            ab_mm["nearest_bull_target"] = {"price": mm_target, "type": "measured_move"}
        elif direction == "SELL" and 0 < mm_target < entry_price:
            ab_mm["nearest_bear_target"] = {"price": mm_target, "type": "measured_move"}
        key_levels = {
            "support": [value for value in [nearest_support, range_low, higher_range_low] if value > 0],
            "resistance": [value for value in [nearest_resistance, range_high, higher_range_high] if value > 0],
            "round": self._round_number_candidates(entry_price),
        }
        magnets = router.build_target_magnets(
            direction,
            entry_price,
            ab_sr={
                "nearest_support": nearest_support,
                "nearest_resistance": nearest_resistance,
                "major_hl": higher_range_low,
                "major_lh": higher_range_high,
            },
            ab_mm=ab_mm,
            key_levels=key_levels,
        )
        target_plan = router.resolve_target_path(
            direction,
            entry_price,
            take_profit,
            stop_loss=stop_loss,
            market_state=str(extra.get("market_state", "") or ""),
            route_style=route_style,
            magnets=magnets,
        )
        target_path_clear = bool(target_plan.get("path_clear", True))
        recommended_target = float(target_plan.get("recommended_target") or 0.0)
        raw_blocking_cluster = target_plan.get("blocking_cluster")
        blocking_cluster = raw_blocking_cluster if isinstance(raw_blocking_cluster, dict) else {}
        blocking_price = float(blocking_cluster.get("price") or 0.0)
        first_target_distance_r = (
            abs(recommended_target - entry_price) / actual_risk
            if actual_risk > 0 and recommended_target > 0
            else 0.0
        )
        blocking_magnet_distance_r = (
            abs(blocking_price - entry_price) / actual_risk
            if actual_risk > 0 and blocking_price > 0
            else 0.0
        )

        extra["nearest_support"] = nearest_support
        extra["nearest_resistance"] = nearest_resistance
        extra["signal_bar_high"] = signal_bar_high
        extra["signal_bar_low"] = signal_bar_low
        extra["trendline_break_confirmed"] = trendline_break_confirmed
        extra["failed_breakout_evidence"] = failed_breakout_evidence
        extra["signal_bar_quality"] = float(signal_bar_context.get("signal_bar_quality", 0.0) or 0.0)
        extra["signal_bar_tail_ratio"] = float(signal_bar_context.get("signal_bar_tail_ratio", 0.0) or 0.0)
        extra["signal_bar_close_position"] = float(signal_bar_context.get("signal_bar_close_position", 0.0) or 0.0)
        extra["reclaimed_prior_close"] = bool(signal_bar_context.get("reclaimed_prior_close", False))
        extra["broke_micro_extreme"] = bool(signal_bar_context.get("broke_micro_extreme", False))
        extra["trapped_side"] = trapped_side
        extra["prior_leg_context"] = prior_leg_context
        extra["prior_leg_bars"] = prior_leg_bars
        extra["prior_leg_overlap_ratio"] = prior_leg_overlap_ratio
        extra["target_path_clear"] = target_path_clear
        extra["recommended_target"] = recommended_target
        extra["target_magnets"] = target_plan.get("magnet_summary") or []
        extra["target_clusters"] = target_plan.get("cluster_summary") or []
        extra["magnet_cluster_count"] = int(target_plan.get("magnet_cluster_count") or 0)
        extra["magnet_cluster_strength"] = float(target_plan.get("magnet_cluster_strength") or 0.0)
        extra["first_target_distance_r"] = first_target_distance_r
        extra["blocking_magnet_distance_r"] = blocking_magnet_distance_r
        primary_cluster = (
            target_plan.get("primary_cluster")
            if isinstance(target_plan.get("primary_cluster"), dict)
            else {}
        )
        blocking_cluster = (
            target_plan.get("blocking_cluster")
            if isinstance(target_plan.get("blocking_cluster"), dict)
            else {}
        )
        extra["primary_magnet_kind"] = str(primary_cluster.get("kind") or "")
        extra["blocking_magnet_kind"] = str(blocking_cluster.get("kind") or "")
        extra["stop_structure_ok"] = stop_structure_ok
        extra["perfect_stop"] = perfect_stop
        extra["actual_to_perfect_risk_ratio"] = actual_to_perfect_risk_ratio
        event.extra = extra

    @staticmethod
    def _market_state_to_trend_label(market_state: str) -> str:
        """把回测市场状态映射成 premise/strength 可读的 bull/bear 标签。"""
        key = str(market_state or "")
        if "bull" in key:
            return "bull"
        if "bear" in key:
            return "bear"
        return "neutral"

    def _build_management_snapshot(self, replay, symbol: str, candle) -> dict:
        """给持仓管理构造当前 symbol 的轻量级结构快照。"""
        candles_5m = replay.get_candles(symbol, "5m", limit=30)
        candles_15m = replay.get_candles(symbol, "15m", limit=30)
        candles_1h = replay.get_candles(symbol, "1h", limit=30)

        snapshot_5m = self._identify_market_state_snapshot(candles_5m)
        snapshot_15m = self._identify_market_state_snapshot(candles_15m)
        snapshot_1h = self._identify_market_state_snapshot(candles_1h)

        current_swings = CycleIdentifier._find_swings(candles_5m[-30:] if len(candles_5m) >= 30 else candles_5m)
        higher_swings = CycleIdentifier._find_swings(candles_15m[-30:] if len(candles_15m) >= 30 else candles_15m)
        nearest_support, nearest_resistance = self._nearest_levels_from_swings(
            float(candle.close),
            [*current_swings, *higher_swings],
        )
        minor_support, minor_resistance = self._nearest_levels_from_swings(
            float(candle.close),
            current_swings,
        )

        def bars_payload(bars) -> list[dict]:
            return [
                {
                    "time": bar.timestamp,
                    "O": float(bar.open),
                    "H": float(bar.high),
                    "L": float(bar.low),
                    "C": float(bar.close),
                    "body": "bull" if float(bar.close) >= float(bar.open) else "bear",
                }
                for bar in bars[-20:]
            ]

        def ema_payload(bars) -> float:
            values = [bar.close for bar in bars]
            ema = self._simple_ema(values, 20)
            return float(ema[-1]) if ema else 0.0

        def sr_payload(price: float, current_bars, higher_bars) -> dict:
            current_tf_swings = CycleIdentifier._find_swings(
                current_bars[-30:] if len(current_bars) >= 30 else current_bars
            )
            higher_tf_swings = CycleIdentifier._find_swings(
                higher_bars[-30:] if len(higher_bars) >= 30 else higher_bars
            )
            major_support, major_resistance = self._nearest_levels_from_swings(
                price,
                [*current_tf_swings, *higher_tf_swings],
            )
            minor_level_support, minor_level_resistance = self._nearest_levels_from_swings(price, current_tf_swings)
            return {
                "nearest_support": major_support,
                "nearest_resistance": major_resistance,
                "major_hl": major_support,
                "major_lh": major_resistance,
                "minor_hl": minor_level_support,
                "minor_lh": minor_level_resistance,
                "gaps": [],
            }

        recent_bars = bars_payload(candles_5m)

        return {
            "current_price": float(candle.close),
            "recent_bars": recent_bars,
            "key_levels": {
                "support": [value for value in [nearest_support, minor_support] if value > 0],
                "resistance": [value for value in [nearest_resistance, minor_resistance] if value > 0],
            },
            "ab_ema": {"ema20": ema_payload(candles_5m)},
            "ab_mm": {},
            "ab_patterns": {"patterns": []},
            "ab_sr": {
                "nearest_support": nearest_support,
                "nearest_resistance": nearest_resistance,
                "major_hl": nearest_support,
                "major_lh": nearest_resistance,
                "minor_hl": minor_support,
                "minor_lh": minor_resistance,
                "gaps": [],
            },
            "timeframe_states": {
                "5m": str((snapshot_5m or {}).get("market_state", "") or ""),
                "15m": str((snapshot_15m or {}).get("market_state", "") or ""),
                "1h": str((snapshot_1h or {}).get("market_state", "") or ""),
            },
            "timeframes": {
                "5m": {
                    "trend": self._market_state_to_trend_label(
                        str((snapshot_5m or {}).get("market_state", "") or "")
                    )
                },
                "15m": {
                    "trend": self._market_state_to_trend_label(
                        str((snapshot_15m or {}).get("market_state", "") or "")
                    )
                },
                "1h": {
                    "trend": self._market_state_to_trend_label(
                        str((snapshot_1h or {}).get("market_state", "") or "")
                    )
                },
            },
            "timeframe_recent_bars": {
                "5m": bars_payload(candles_5m),
                "15m": bars_payload(candles_15m),
                "1h": bars_payload(candles_1h),
            },
            "timeframe_ema": {
                "5m": ema_payload(candles_5m),
                "15m": ema_payload(candles_15m),
                "1h": ema_payload(candles_1h),
            },
            "timeframe_sr": {
                "5m": sr_payload(float(candle.close), candles_5m, candles_15m),
                "15m": sr_payload(float(candle.close), candles_15m, candles_1h),
                "1h": sr_payload(float(candle.close), candles_1h, []),
            },
        }

    @staticmethod
    def _range_edge_matches_direction(range_edge: str, direction: str) -> bool:
        """交易区间边缘应与反做方向一致。"""
        return (range_edge == "bottom" and direction == "BUY") or (range_edge == "top" and direction == "SELL")

    @staticmethod
    def _is_tr_blshs_signal(signal_type: str, direction: str, range_edge: str) -> bool:
        """H1/H2/L1/L2 与反转结构在 TR 边缘可作为 BLSHS 的执行信号。"""
        if direction == "BUY" and range_edge == "bottom":
            return signal_type in TR_BLSHS_BUY_SIGNALS
        if direction == "SELL" and range_edge == "top":
            return signal_type in TR_BLSHS_SELL_SIGNALS
        return False

    @staticmethod
    def _is_origin_half(range_position: float, direction: str) -> bool:
        """判断当前 leg 是否仍在更高 TR 的起始半区。"""
        pos = max(0.0, min(1.0, float(range_position or 0.5)))
        if direction == "BUY":
            return pos <= 0.55
        if direction == "SELL":
            return pos >= 0.45
        return False

    @staticmethod
    def _is_edge_zone(range_position: float, direction: str) -> bool:
        """判断是否仍靠近更高 TR 边缘。"""
        pos = max(0.0, min(1.0, float(range_position or 0.5)))
        if direction == "BUY":
            return pos <= 0.45
        if direction == "SELL":
            return pos >= 0.55
        return False

    @staticmethod
    def _is_mid_band(range_position: float) -> bool:
        """判断是否已经回到更高 TR 中部附近。"""
        pos = max(0.0, min(1.0, float(range_position or 0.5)))
        return 0.45 < pos < 0.55

    @staticmethod
    def _convert_to_limit_order(
        event,
        candles_q,
        *,
        route_style: str,
        inner_low: float,
        inner_high: float,
        stop_buffer: float,
    ) -> None:
        """把 stop 追单降级成更贴近 Brooks 的 limit/scalp 挂单。"""
        if not candles_q:
            return
        if str(getattr(event, "entry_type", "STOP") or "STOP").upper() == "LIMIT":
            return

        signal_bar = candles_q[-1]
        bar_range = max(float(signal_bar.high) - float(signal_bar.low), 1e-9)
        original_price = float(getattr(event, "price", 0.0) or 0.0)
        direction = str(getattr(event, "direction", "") or "")

        if direction == "BUY":
            repriced = min(original_price, float(signal_bar.low) + bar_range * inner_high)
            repriced = max(float(signal_bar.low) + bar_range * inner_low, repriced)
            desired_stop = float(signal_bar.low) - bar_range * stop_buffer
            event.stop_loss = min(float(getattr(event, "stop_loss", desired_stop) or desired_stop), desired_stop)
        else:
            repriced = max(original_price, float(signal_bar.high) - bar_range * inner_high)
            repriced = min(float(signal_bar.high) - bar_range * inner_low, repriced)
            desired_stop = float(signal_bar.high) + bar_range * stop_buffer
            event.stop_loss = max(float(getattr(event, "stop_loss", desired_stop) or desired_stop), desired_stop)

        event.price = repriced
        event.entry_type = "LIMIT"
        event.entry_trigger = repriced
        extra = dict(getattr(event, "extra", {}) or {})
        extra["route_style"] = route_style
        extra["original_entry_price"] = float(extra.get("original_entry_price", original_price) or original_price)
        extra["entry_repriced"] = abs(repriced - original_price) > 1e-9
        extra["converted_to_limit"] = True
        event.extra = extra

    @staticmethod
    def _resolve_playbook_context(
        signal_type: str,
        market_key: str,
        higher_key: str,
        entry_type: str,
        extra: dict,
    ) -> tuple[str, str, str]:
        """按 Brooks 状态路由给候选单打上 playbook 标签。"""
        if market_key in {"tight_range", "broad_range"}:
            if signal_type == "第二腿陷阱" or str(extra.get("playbook_hint") or "") == "TR3_SECOND_LEG_TRAP":
                return "TR3_SECOND_LEG_TRAP", "tr", "STOP"
            if signal_type == "看衰突破" or bool(extra.get("failed_breakout_evidence", False)):
                return "TR2_FAILED_BO_FADE", "tr", "STOP"
            if str(extra.get("prior_leg_context") or "") == "tr_second_leg":
                return "TR3_SECOND_LEG_TRAP", "tr", "STOP"
            return "TR1_BLSHS", "tr", "LIMIT"

        if signal_type in BROOKS_REVERSAL_SIGNALS:
            if higher_key in {"tight_range", "broad_range"}:
                return "R2_TR_EDGE_REVERSAL", "reversal", "LIMIT"
            if market_key in {"weak_trend_bull", "weak_trend_bear"}:
                return "R1_BROAD_CHANNEL_REVERSAL", "reversal", "LIMIT"
            return "R0_FIRST_REVERSAL_PROBE", "reversal", "STOP"

        if signal_type in CHANNEL_FIRST_PULLBACK_SIGNALS:
            if higher_key in {"tight_range", "broad_range"}:
                return "T6_TR_LEG_FIRST_PULLBACK", "channel", "LIMIT" if entry_type == "LIMIT" else "STOP"
            return "T1_FIRST_PULLBACK", "trend", "STOP"

        if signal_type in CHANNEL_RECOVERY_SIGNALS:
            if higher_key in {"tight_range", "broad_range"}:
                return "T6_TR_LEG_CHANNEL_RECOVERY", "channel", "LIMIT" if entry_type == "LIMIT" else "STOP"
            if market_key in {"weak_trend_bull", "weak_trend_bear"}:
                return "T2_BROAD_CHANNEL_RECOVERY", "channel", "STOP"
            return "T2_TREND_H2", "trend", "STOP"

        if signal_type in EMA_RECOVERY_SIGNALS:
            if higher_key in {"tight_range", "broad_range"}:
                return "T6_TR_LEG_EMA_RECOVERY", "channel", "LIMIT" if entry_type == "LIMIT" else "STOP"
            if market_key in {"weak_trend_bull", "weak_trend_bear"}:
                return "T3_BROAD_CHANNEL_EMA", "channel", "STOP"
            return "T3_TREND_EMA", "trend", "STOP"

        if signal_type in BREAKOUT_CHASE_SIGNALS:
            return "T5_BREAKOUT_CHASE", "breakout", "STOP"

        return "UNCLASSIFIED", "other", entry_type

    @staticmethod
    def _attach_playbook_context(event, market_state, higher_market_state) -> None:
        """把 Brooks playbook 路由写进事件上下文，便于审计和后续管理。"""
        extra = dict(getattr(event, "extra", {}) or {})
        market_key = (
            classify_backtest_market_state(market_state) if market_state is not None else ""
        ) or str(extra.get("market_state", "") or "")
        higher_key = (
            classify_backtest_market_state(higher_market_state) if higher_market_state is not None else ""
        ) or str(extra.get("higher_market_state", "") or "")
        entry_type = str(getattr(event, "entry_type", "STOP") or "STOP").upper()
        playbook_id, playbook_family, order_bias = BacktestRunner._resolve_playbook_context(
            str(getattr(event, "signal_type", "") or ""),
            str(market_key or ""),
            str(higher_key or ""),
            entry_type,
            extra,
        )
        extra["playbook_id"] = playbook_id
        extra["playbook_family"] = playbook_family
        extra["order_bias"] = order_bias
        event.extra = extra

    def _apply_entry_route_adjustments(self, event, market_state, higher_market_state, candles_q) -> None:
        """把 TR / Broad Channel 里本该 limit 的 setup 从 stop 追单链路里拉出来。"""
        if market_state is None or not candles_q:
            return

        market_key = classify_backtest_market_state(market_state) or ""
        higher_key = (
            classify_backtest_market_state(higher_market_state) if higher_market_state is not None else ""
        ) or ""
        timeframe = str(getattr(event, "timeframe", "") or "")
        signal_type = str(getattr(event, "signal_type", "") or "")
        direction = str(getattr(event, "direction", "") or "")
        entry_type = str(getattr(event, "entry_type", "STOP") or "STOP").upper()
        extra = dict(getattr(event, "extra", {}) or {})
        range_edge = str(extra.get("range_edge", "") or "")
        higher_range_position = float(extra.get("higher_range_position", 0.5) or 0.5)
        higher_range_edge = str(extra.get("higher_range_edge", "") or "")

        if timeframe != "5m" or entry_type == "LIMIT":
            return

        higher_range_like = higher_key in {"tight_range", "broad_range"}
        higher_edge_conflict = (
            (direction == "BUY" and higher_range_edge == "top")
            or (direction == "SELL" and higher_range_edge == "bottom")
        )
        higher_edge_zone = self._is_edge_zone(higher_range_position, direction)
        higher_origin_half = self._is_origin_half(higher_range_position, direction)
        higher_mid_band = self._is_mid_band(higher_range_position)
        counter_weak_trend = (
            (market_key == "weak_trend_bull" and direction == "SELL")
            or (market_key == "weak_trend_bear" and direction == "BUY")
        )

        if market_key in {"tight_range", "broad_range"} and self._is_tr_blshs_signal(signal_type, direction, range_edge):
            self._convert_to_limit_order(
                event,
                candles_q,
                route_style="tr_blshs_limit",
                inner_low=0.20,
                inner_high=0.45,
                stop_buffer=0.12,
            )
            return

        if signal_type in LIMIT_FRIENDLY_REVERSAL_SIGNALS:
            if counter_weak_trend:
                self._convert_to_limit_order(
                    event,
                    candles_q,
                    route_style="broad_channel_limit_reversal",
                    inner_low=0.18,
                    inner_high=0.40,
                    stop_buffer=0.15,
                )
                return
            if higher_range_like and not higher_edge_conflict and not higher_mid_band:
                self._convert_to_limit_order(
                    event,
                    candles_q,
                    route_style="higher_tr_limit_reversal",
                    inner_low=0.18,
                    inner_high=0.42,
                    stop_buffer=0.15,
                )
                return

        if (
            higher_range_like
            and signal_type in TR_LEG_RECOVERY_SIGNALS
            and not higher_edge_conflict
            and (higher_edge_zone or higher_origin_half)
            and market_key in {"weak_trend_bull", "weak_trend_bear", "tight_range", "broad_range"}
        ):
            self._convert_to_limit_order(
                event,
                candles_q,
                route_style="tr_leg_limit_pullback",
                inner_low=0.25,
                inner_high=0.52,
                stop_buffer=0.12,
            )

    @staticmethod
    def _check_route_consistency(event, market_state, higher_market_state, score: int) -> tuple[bool, str]:
        """按 Brooks 路由规则检查“当前市场状态 × setup × 订单方式”是否一致。"""
        if market_state is None:
            return True, ""

        market_key = classify_backtest_market_state(market_state) or ""
        if not market_key:
            return True, ""

        signal_type = str(getattr(event, "signal_type", "") or "")
        entry_type = str(getattr(event, "entry_type", "STOP") or "STOP").upper()
        timeframe = str(getattr(event, "timeframe", "") or "")
        direction = str(getattr(event, "direction", "") or "")
        extra = dict(getattr(event, "extra", {}) or {})
        tbtl_big = int(extra.get("tbtl_big", 0) or 0)
        range_edge = str(extra.get("range_edge", "") or "")
        higher_key = (
            classify_backtest_market_state(higher_market_state) if higher_market_state is not None else ""
        ) or str(extra.get("higher_market_state", "") or "")
        higher_follow_through = bool(
            getattr(higher_market_state, "follow_through", extra.get("higher_follow_through", False))
        )
        higher_pullback_ratio = float(
            getattr(higher_market_state, "pullback_ratio", extra.get("higher_pullback_ratio", 0.0)) or 0.0
        )
        higher_range_position = float(extra.get("higher_range_position", 0.5) or 0.5)
        higher_range_edge = str(extra.get("higher_range_edge", "") or "")
        playbook_id = str(extra.get("playbook_id", "") or "")
        higher_weakening = (
            higher_pullback_ratio >= 0.5
            or bool(getattr(higher_market_state, "is_ttr", False))
            or not higher_follow_through
        )

        is_reversal = signal_type in ROUTE_REVERSAL_STRATEGIES
        is_minor_reversal = signal_type in ROUTE_MINOR_REVERSAL_STRATEGIES
        is_trend = signal_type in ROUTE_TREND_STRATEGIES
        is_tr_blshs = BacktestRunner._is_tr_blshs_signal(signal_type, direction, range_edge)
        is_channel_scalp = signal_type in CHANNEL_SCALP_SIGNALS
        is_breakout_chase = signal_type in BREAKOUT_CHASE_SIGNALS
        is_breakout = (
            ("突破" in signal_type and signal_type not in {"突破回调", "看衰突破"})
            or signal_type == "收线追进"
        )

        pullback_ratio = float(getattr(market_state, "pullback_ratio", 0.0) or 0.0)
        follow_through = bool(getattr(market_state, "follow_through", False))
        weakening = pullback_ratio >= 0.5 or market_state.is_ttr or not follow_through or tbtl_big >= 5

        if market_key == "strong_trend_bull":
            if direction == "SELL":
                if not is_reversal:
                    return False, "强多趋势中禁止逆势顺势单"
                if not weakening or score < 70:
                    return False, "强多趋势中反转证据不足"
        elif market_key == "strong_trend_bear":
            if direction == "BUY":
                if not is_reversal:
                    return False, "强空趋势中禁止逆势顺势单"
                if not weakening or score < 70:
                    return False, "强空趋势中反转证据不足"

        if market_key in {"tight_range", "broad_range"}:
            if range_edge == "middle":
                return False, "交易区间中部不做单"
            if not BacktestRunner._range_edge_matches_direction(range_edge, direction):
                return False, "交易区间里必须在边缘反做"
            if is_breakout and signal_type not in {"看衰突破"}:
                return False, "区间里禁止突破追单和趋势延续单"
            if is_trend and not is_tr_blshs:
                return False, "交易区间里趋势延续单只允许边缘二次信号"
            if market_key == "tight_range" and score < 60:
                return False, "紧密交易区间只做更高质量 setup"
            if is_reversal and entry_type == "STOP" and signal_type not in {"头肩顶MTR", "头肩底MTR"} and score < 65:
                return False, "区间中的反转 stop 单质量不足"

        if market_key in {"weak_trend_bull", "weak_trend_bear"}:
            aligned_bull = market_key == "weak_trend_bull" and direction == "BUY"
            aligned_bear = market_key == "weak_trend_bear" and direction == "SELL"
            if is_breakout and not follow_through:
                return False, "弱趋势里缺少 follow-through 不追突破"
            if (aligned_bull or aligned_bear) and is_trend and pullback_ratio > 0.66 and score < 70:
                return False, "深回调后的趋势延续质量不足"
            if (
                not (aligned_bull or aligned_bear)
                and is_reversal
                and entry_type == "STOP"
                and tbtl_big < 5
                and score < 65
            ):
                return False, "弱趋势中的逆势反转证据不足"

        if timeframe == "5m" and higher_key in {"tight_range", "broad_range"}:
            higher_edge_conflict = (
                (direction == "BUY" and higher_range_edge == "top")
                or (direction == "SELL" and higher_range_edge == "bottom")
            )
            higher_origin_half = BacktestRunner._is_origin_half(higher_range_position, direction)
            higher_edge_zone = BacktestRunner._is_edge_zone(higher_range_position, direction)
            higher_mid_band = BacktestRunner._is_mid_band(higher_range_position)
            if market_key in {"tight_range", "broad_range"}:
                if is_breakout and signal_type not in {"看衰突破"}:
                    return False, "15m 为 TR，5m 不追突破"
                if is_trend and not is_tr_blshs:
                    return False, "15m 为 TR，5m 只做边缘 BLSHS 或明确反转"
            else:
                if (
                    is_breakout_chase
                    and (score < 80 or higher_edge_conflict or higher_weakening or not higher_edge_zone)
                ):
                    return False, "15m 为 TR，5m breakout mode 证据不足"
                if higher_mid_band and (is_trend or is_channel_scalp) and not is_reversal:
                    return False, "15m 为 TR，中部腿不做顺势追单"
                if (
                    playbook_id == "T6_TR_LEG_FIRST_PULLBACK"
                    and (not higher_edge_zone or higher_weakening or not follow_through or score < 76)
                ):
                    return False, "15m 为 TR，5m H1/L1 只在边缘第一腿做"
                if playbook_id in {"T6_TR_LEG_CHANNEL_RECOVERY", "T6_TR_LEG_EMA_RECOVERY"}:
                    if entry_type == "LIMIT":
                        if higher_mid_band:
                            return False, "15m 为 TR，中部不做顺势 limit 单"
                        if not higher_origin_half and not higher_edge_zone and score < 72:
                            return False, "15m 为 TR，5m 顺势 limit 已离开边缘优势区"
                    elif not higher_origin_half:
                        return False, "15m 为 TR，5m 顺势恢复已离开有利半区"
                    if higher_edge_conflict:
                        return False, "15m 为 TR，5m 顺势恢复已逼近对侧边缘"
                    if signal_type in CHANNEL_RECOVERY_SIGNALS and not higher_edge_zone and score < 74:
                        return False, "15m 为 TR，5m H2/L2/突破回调 先等边缘半区确认"
                    if not (follow_through or higher_follow_through) and score < 72:
                        return False, "15m 为 TR，5m 顺势恢复缺少 follow-through"
                if is_trend and not is_reversal and not is_channel_scalp and higher_edge_conflict:
                    return False, "15m 为 TR，5m 趋势腿已逼近对侧边缘"
                if is_channel_scalp and (not follow_through) and score < 74:
                    return False, "15m 为 TR，5m scalp 缺少 follow-through"
                if is_channel_scalp and higher_edge_conflict and score < 78:
                    return False, "15m 为 TR，5m scalp 已接近对侧边缘"
            if is_reversal and entry_type == "STOP" and signal_type not in {"头肩顶MTR", "头肩底MTR"} and score < 67:
                return False, "15m 为 TR，5m 反转 stop 单确认不足"
            if is_minor_reversal and entry_type == "STOP" and score < 70:
                return False, "15m 为 TR，5m 小反转要更强确认"

        if timeframe == "5m" and higher_key == "strong_trend_bull" and direction == "SELL":
            if not is_reversal:
                return False, "15m 强多趋势中，5m 禁止逆势顺势单"
            if not higher_weakening and score < 74:
                return False, "15m 强多趋势中，5m 反转证据不足"

        if timeframe == "5m" and higher_key == "strong_trend_bear" and direction == "BUY":
            if not is_reversal:
                return False, "15m 强空趋势中，5m 禁止逆势顺势单"
            if not higher_weakening and score < 74:
                return False, "15m 强空趋势中，5m 反转证据不足"

        if timeframe == "5m" and higher_key == "weak_trend_bull":
            if direction == "SELL" and is_minor_reversal and (not higher_weakening or score < 72):
                return False, "15m 弱多结构中，5m 小反转证据不足"
            if signal_type in {"低1", "低2"} and not is_tr_blshs:
                return False, "15m 弱多结构中，不做 5m 逆势 L1/L2"
            if (
                signal_type in {"高1", "高2"}
                and ((not higher_follow_through) or higher_pullback_ratio > 0.45)
                and score < 72
            ):
                return False, "15m 弱多结构里，5m H1/H2 需要更好 FT"

        if timeframe == "5m" and higher_key == "weak_trend_bear":
            if direction == "BUY" and is_minor_reversal and (not higher_weakening or score < 72):
                return False, "15m 弱空结构中，5m 小反转证据不足"
            if signal_type in {"高1", "高2"} and not is_tr_blshs:
                return False, "15m 弱空结构中，不做 5m 逆势 H1/H2"
            if (
                signal_type in {"低1", "低2"}
                and ((not higher_follow_through) or higher_pullback_ratio > 0.45)
                and score < 72
            ):
                return False, "15m 弱空结构里，5m L1/L2 需要更好 FT"

        return True, ""

    @staticmethod
    def _check_entry_readiness(event, score: int) -> tuple[bool, str]:
        """按 S5/S6 检查关键位、目标路径与止损结构。"""
        extra = dict(getattr(event, "extra", {}) or {})
        signal_type = str(getattr(event, "signal_type", "") or "")
        entry_type = str(getattr(event, "entry_type", "STOP") or "STOP").upper()
        timeframe = str(getattr(event, "timeframe", "") or "")
        stop_structure_ok = bool(extra.get("stop_structure_ok", True))
        target_path_clear = bool(extra.get("target_path_clear", True))
        risk_ratio = float(extra.get("actual_to_perfect_risk_ratio", 1.0) or 1.0)
        background_label = str(extra.get("background_label") or "")

        if not stop_structure_ok:
            return False, "止损没有放到结构位外"

        market_state = str(extra.get("market_state", "") or "")
        higher_market_state = str(extra.get("higher_market_state", "") or "")
        higher_follow_through = bool(extra.get("higher_follow_through"))
        follow_through = bool(extra.get("follow_through"))
        range_like = (
            "TR" in market_state.upper()
            or "range" in market_state.lower()
            or "range" in higher_market_state.lower()
        )
        candidate_stage = str(extra.get("candidate_stage") or "").upper()
        requires_second_entry = bool(extra.get("requires_second_entry"))
        acceptance_ready = bool(extra.get("acceptance_ready"))
        executable_signal_ready = bool(extra.get("executable_signal_ready"))
        magnet_cluster_count = int(extra.get("magnet_cluster_count", 0) or 0)
        magnet_cluster_strength = float(extra.get("magnet_cluster_strength", 0.0) or 0.0)
        blocking_magnet_kind = str(extra.get("blocking_magnet_kind") or "")
        trendline_break_confirmed = bool(extra.get("trendline_break_confirmed", False))
        failed_breakout_evidence = bool(extra.get("failed_breakout_evidence", False))
        signal_bar_tail_ratio = float(extra.get("signal_bar_tail_ratio", 0.0) or 0.0)
        reclaimed_prior_close = bool(extra.get("reclaimed_prior_close", False))
        broke_micro_extreme = bool(extra.get("broke_micro_extreme", False))
        first_target_distance_r = float(extra.get("first_target_distance_r", 0.0) or 0.0)
        blocking_magnet_distance_r = float(extra.get("blocking_magnet_distance_r", 0.0) or 0.0)
        trapped_side = str(extra.get("trapped_side") or "")
        prior_leg_context = str(extra.get("prior_leg_context") or "")
        playbook_id = str(extra.get("playbook_id") or "")
        higher_range_position = float(extra.get("higher_range_position", 0.5) or 0.5)
        signal_rank = 0
        if signal_type in {"高1", "低1"}:
            signal_rank = 1
        elif signal_type in {"高2", "低2"}:
            signal_rank = 2

        extra["signal_rank"] = signal_rank
        extra["signal_stage"] = "executable"
        extra["signal_stage_reason"] = "结构、目标路径与信号成熟度通过"

        def block(stage: str, reason: str) -> tuple[bool, str]:
            extra["signal_stage"] = stage
            extra["signal_stage_reason"] = reason
            event.extra = extra
            return False, reason

        if signal_rank == 1:
            if range_like and entry_type != "LIMIT":
                return block("watch", "H1/L1 在区间里仍停留在 watch，不能直接追 stop")
            if not (follow_through or higher_follow_through) and score < 74:
                return block("watch", "H1/L1 仍缺少 follow-through / acceptance")
            if requires_second_entry and not (acceptance_ready and executable_signal_ready):
                return block("candidate", "第一次信号尚未完成接受，继续等 H2/L2 或二次确认")
        elif signal_rank == 2 and score < 68 and entry_type == "STOP":
            return block("candidate", "H2/L2 还没成熟到 executable")

        if playbook_id == "T6_TR_LEG_FIRST_PULLBACK" and entry_type == "STOP":
            if not BacktestRunner._is_edge_zone(higher_range_position, str(getattr(event, "direction", "") or "")):
                return block("watch", "更高 TR 里的第一腿回调还不在边缘，继续观察")

        if playbook_id in {"T6_TR_LEG_CHANNEL_RECOVERY", "T6_TR_LEG_EMA_RECOVERY"} and entry_type == "STOP":
            if BacktestRunner._is_mid_band(higher_range_position) and not acceptance_ready:
                return block("candidate", "更高 TR 的顺势恢复刚回到中部附近，先等接受完成再执行")

        if timeframe == "5m" and signal_type == "高2" and entry_type == "STOP":
            if "震荡背景" in background_label:
                return block("watch", "5m 高2 在震荡背景中更像区间噪音，先等更清晰确认")
            if risk_ratio < 0.55:
                return block("candidate", "5m 高2 止损过紧，回调还没有足够呼吸空间")

        if signal_type == "楔形底" and entry_type == "STOP":
            if market_state == "weak_trend_bear" and higher_market_state in {"broad_range", "tight_range"}:
                return block("candidate", "空头弱趋势里的楔形底更像 first reversal，先等 failed breakout 或二次确认")

        if timeframe == "5m" and signal_type in {"双重底", "楔形底"} and entry_type == "STOP":
            if not target_path_clear:
                return block("candidate", "5m 底部反转前方阻力过近，按 Brooks 先等二次确认或改限价")

        if timeframe == "5m" and signal_type == "楔形顶" and entry_type == "STOP":
            if (
                not target_path_clear
                and market_state == "weak_trend_bull"
                and higher_market_state == "weak_trend_bull"
            ):
                return block("candidate", "双层弱多里的 5m 楔形顶更像 minor reversal，先等 LH MTR / broad channel")

        if timeframe == "5m" and signal_type == "双重顶" and entry_type == "STOP":
            if not target_path_clear and score < 82:
                return block("candidate", "5m 双重顶前方目标受阻，按 Brooks 更适合限价刮头皮或等更强反转")

        if signal_type == "看衰突破":
            if not failed_breakout_evidence or not trapped_side:
                return block("candidate", "看衰突破仍缺少真正的 failed breakout / trapped side 证据")
            if signal_bar_tail_ratio < 0.25:
                return block("candidate", "看衰突破的 rejection tail 不够明显，先不进场")
            if not reclaimed_prior_close and score < 76:
                return block("candidate", "看衰突破尚未收回前一根收盘位，拒绝证据不足")
            if not broke_micro_extreme and score < 76:
                return block("candidate", "看衰突破还没形成 micro extreme trap，先等更清晰失败")
            if not target_path_clear:
                return block("candidate", "看衰突破前方目标受阻，先不追")
            if 0 < first_target_distance_r < 0.35:
                return block("candidate", "看衰突破离第一目标磁体太近，更像区间噪音")

        if signal_type == "头肩底MTR" and entry_type == "STOP":
            if (
                market_state == "weak_trend_bear"
                and higher_market_state == "weak_trend_bear"
                and not target_path_clear
            ):
                return block("candidate", "头肩底 MTR 所在的上下级结构仍在弱空，先等 failed breakout 证据")

        if timeframe == "5m" and signal_type == "头肩底MTR" and entry_type == "STOP":
            if not target_path_clear and risk_ratio < 0.5:
                return block("candidate", "5m 头肩底 MTR 止损太紧且前方受阻，先等更清晰的 failed breakout")

        if candidate_stage in {"WATCH", "PRE_SIGNAL", "COUNTERTREND_PROBE"}:
            return block("watch", f"Brooks 候选阶段仍为 {candidate_stage or 'WATCH'}")
        if candidate_stage.startswith("CANDIDATE") and not executable_signal_ready:
            return block("candidate", f"Brooks 候选阶段 {candidate_stage} 仍缺少执行确认")

        if signal_rank == 2 and range_like and entry_type == "STOP" and not follow_through and score < 72:
            return block("candidate", "区间里的 H2/L2 仍可能只是 second leg trap")

        if signal_type in {"高2", "低2"} and entry_type == "STOP":
            if (
                prior_leg_context == "tr_second_leg"
                and not failed_breakout_evidence
                and not trendline_break_confirmed
                and score < 76
            ):
                return block("candidate", "H2/L2 前一腿更像 TR 里的 second-leg trap，且缺少失败突破证据")
            if (
                prior_leg_context == "tr_second_leg"
                and first_target_distance_r > 0
                and first_target_distance_r < 1.25
                and score < 78
            ):
                return block("candidate", "H2/L2 到第一目标磁体太近，不值得用 stop 追")
            if (
                not target_path_clear
                and blocking_magnet_distance_r > 0
                and blocking_magnet_distance_r < 1.0
                and score < 78
            ):
                return block("candidate", "H2/L2 前方近端磁体和 trapped side 太近，先等二次确认")
            if (
                signal_type == "低2"
                and prior_leg_context == "tr_second_leg"
                and not failed_breakout_evidence
                and not target_path_clear
                and 0 < blocking_magnet_distance_r < 0.35
            ):
                return block("candidate", "低2 前一腿更像 TR second-leg trap，且近端磁体太近，不追 stop")

        if entry_type == "STOP" and risk_ratio < 0.45 and signal_type not in {"头肩顶MTR", "头肩底MTR"}:
            return block("candidate", "实际止损明显小于结构止损")

        trend_breakout_setups = {
            "收线追进",
            "高1",
            "低1",
            "高2",
            "低2",
            "20均线缺口",
            "第一均线缺口",
            "突破回调",
            "ii突破",
            "ioi突破",
            "HOY突破",
            "LOY突破",
        }
        if signal_type in trend_breakout_setups and not target_path_clear and score < 74:
            if magnet_cluster_count >= 2 or magnet_cluster_strength >= 4.0:
                return block("candidate", f"目标路径在磁体簇受阻 ({blocking_magnet_kind or 'cluster'})")
            return block("candidate", "目标路径在近端关键位受阻")

        if magnet_cluster_count >= 2 and signal_rank < 2 and score < 76:
            return block("candidate", "前方磁体簇过密，第一次信号先不追")

        event.extra = extra
        return True, ""

    def _apply_management_template(self, event, background: BackgroundContext, management_profile: str) -> bool:
        """按回测管理模板修正 SL / TP。"""
        risk = abs(event.price - event.stop_loss)
        if risk <= 0 or event.price <= 0:
            return False

        risk_pct = risk / event.price * 100
        if risk_pct > 3.0:
            return False

        extra = dict(getattr(event, "extra", {}) or {})
        style = classify_management_style(
            event.signal_type,
            management_profile,
            market_state=str(extra.get("market_state", "") or ""),
            higher_market_state=str(extra.get("higher_market_state", "") or ""),
            timeframe=str(getattr(event, "timeframe", "") or ""),
            entry_type=str(getattr(event, "entry_type", "STOP") or "STOP"),
            route_style=str(extra.get("route_style", "") or ""),
        )
        extra = dict(getattr(event, "extra", {}) or {})
        extra["management_style"] = style
        extra["management_profile"] = management_profile
        event.extra = extra

        if style == "brooks_scalp":
            stop_mult, target_mult = 1.0, 1.4
        elif style == "brooks_hs_reversal":
            # 头肩 MTR 通常值得留出更大的 swing 空间。
            stop_mult, target_mult = 1.0, 5.0
            if risk_pct > 2.2:
                return False
        elif style == "brooks_dt_db_reversal":
            # 双顶双底更容易先走一腿 scalp，因此先收紧目标。
            stop_mult, target_mult = 1.0, 3.0
            if risk_pct > 1.8:
                return False
        elif style == "brooks_wedge_reversal":
            # 楔形/高潮后的第一腿多数先按保守 reversal 处理。
            stop_mult, target_mult = 1.0, 2.4
            if risk_pct > 1.6:
                return False
        elif style == "brooks_swing":
            stop_mult, target_mult = 1.0, 6.0
        elif style == "brooks_breakout":
            # 原课里 late BO 常常是末端，不接受宽风险追单。
            stop_mult, target_mult = 1.0, 4.0
            if risk_pct > 1.4:
                return False
        elif style == "brooks_tr_blshs":
            # 5m TR = limit + scalp，不把目标挂到区间外。
            stop_mult, target_mult = 1.0, 1.25
            if risk_pct > 1.2:
                return False
        else:
            # 默认保持现有实验口径，避免影响旧报告可比性。
            stop_mult, target_mult = 0.8, 2.5

        if event.direction == "BUY":
            event.stop_loss = event.price - risk * stop_mult
            event.take_profit = event.price + risk * target_mult
        else:
            event.stop_loss = event.price + risk * stop_mult
            event.take_profit = event.price - risk * target_mult

        recommended_target = float(extra.get("recommended_target", 0.0) or 0.0)
        if recommended_target > 0:
            if event.direction == "BUY" and recommended_target > event.price:
                if style in {"brooks_tr_blshs", "brooks_scalp", "brooks_dt_db_reversal", "brooks_wedge_reversal"}:
                    event.take_profit = min(event.take_profit, recommended_target)
                elif recommended_target < event.take_profit:
                    event.take_profit = recommended_target
            elif event.direction == "SELL" and recommended_target < event.price:
                if style in {"brooks_tr_blshs", "brooks_scalp", "brooks_dt_db_reversal", "brooks_wedge_reversal"}:
                    event.take_profit = max(event.take_profit, recommended_target)
                elif recommended_target > event.take_profit:
                    event.take_profit = recommended_target

        return True

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

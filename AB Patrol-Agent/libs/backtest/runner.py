"""
BacktestRunner — 回测主控

核心思路: 不复制策略代码，而是 monkey-patch 真实 PA 引擎:
  1. 替换 engine._fetch_candles → MarketReplay.get_candles
  2. 替换冷却系统 → 内存 dict + 虚拟时钟
  3. 通过 SignalPublisher.subscribe() 捕获信号
  4. 让 Brooks 路由与执行检查直接消费真实 PA 信号
  5. 用 SimExchange 模拟交易执行

这样修改 pa_engine.py 的策略/参数后，重跑回测就能直接看到效果。
"""

import logging
import math
import os
import sys
import time
import types
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from importlib import import_module, util
from pathlib import Path

import pandas as pd

from trading.market.playbook_router import (
    CHANNEL_LINE_FADE_PLAYBOOK,
    DAILY_TR_FADE_PLAYBOOK,
    HTF_SR_REVERSAL_PLAYBOOK,
    MICRO_CHANNEL_REVERSAL_PLAYBOOK,
    WEDGE_PULLBACK_PLAYBOOK,
    build_daily_playbook_context,
    infer_htf_sr_bias,
    resolve_playbook_context,
)
from trading.position_management.followup import annotate_followup_signal

from .cycle_identifier import BACKTEST_STRATEGY_MATRIX, CycleIdentifier, classify_backtest_market_state
from .data_loader import DataLoader
from .market_replay import MarketReplay
from .report import BacktestResult
from .sim_exchange import SimExchange
from .strategy_filters import (
    ALL_KNOWN_STRATEGIES,
    StrategySelection,
    classify_management_style,
    default_management_profile,
    describe_strategy_selection,
    is_strategy_allowed,
    normalize_management_style,
    resolve_strategy_selection,
)

logger = logging.getLogger(__name__)
_RUNTIME_TARGET_ROUTER = None
_STRUCTURE_STOPS = None


@dataclass
class BacktestConfig:
    """回测配置"""
    symbols: list[str] = field(default_factory=lambda: ["BTCUSDT"])
    timeframes: list[str] = field(default_factory=lambda: ["5m"])
    days: int = 30
    start_date: str = None
    end_date: str = None
    threshold: int = 0           # 兼容字段，不再驱动 Brooks 主链过滤
    max_holding_bars: int = 48   # 最大持仓 K 线数
    fee_rate: float = 0.0004     # 手续费率
    cache_dir: str = None        # 数据缓存目录
    parquet_path: str = None     # 直接指定 Parquet 文件
    verbose: bool = False
    initial_capital: float = 10000.0  # 账户初始资金，用于复利与回撤统计
    engine_threshold_overrides: dict[str, int] = field(default_factory=dict)  # 兼容字段，主链已忽略
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
    "iii突破",
    "HOY突破",
    "LOY突破",
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
    "iii突破",
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

        # 统计
        self._signals_generated = 0
        self._signals_passed = 0
        self._signals_blocked_bg = 0
        self._signals_blocked_score = 0
        self._signals_blocked_rr = 0
        self._signals_blocked_strategy = 0  # 策略白名单/黑名单拦截
        self._signals_blocked_route = 0  # Brooks 全局路由拦截
        self._score_histogram = {}  # 分数分布诊断
        self._route_block_reasons: dict[str, int] = defaultdict(int)
        self._entry_block_reasons: dict[str, int] = defaultdict(int)
        self._route_block_by_strategy: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._entry_block_by_strategy: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._signals_generated_by_strategy: dict[str, int] = defaultdict(int)
        self._signals_passed_by_strategy: dict[str, int] = defaultdict(int)
        self._signals_blocked_strategy_by_strategy: dict[str, int] = defaultdict(int)

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
            cfg.cache_dir = str(Path(__file__).parent.parent.parent / "data" / "history" / "cache")

        print("=" * 60)
        print("  可复用回测模块 (Real PA Engine)")
        print("=" * 60)
        print(f"  币种: {', '.join(cfg.symbols)}")
        print(f"  周期: {', '.join(cfg.timeframes)}")
        print(f"  日期: {cfg.start_date or '全部'} ~ {cfg.end_date or '全部'}")
        print(f"  初始资金: ${cfg.initial_capital:,.2f}")
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
                if not _h4:
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
                signal_label = str(getattr(event, "signal_type", "") or "UNKNOWN")
                self._signals_generated_by_strategy[signal_label] += 1

                # 修正时间戳: PASignal 用 datetime.now()，需替换为虚拟时间
                event.timestamp = ts
                if not is_strategy_allowed(event.signal_type, selection):
                    self._signals_blocked_strategy += 1
                    self._signals_blocked_strategy_by_strategy[signal_label] += 1
                    continue

                # 信号周期 → 过滤器周期映射
                sig_tf = getattr(event, "timeframe", cfg.timeframes[0])
                ftf = TF_FILTER_MAP.get(sig_tf, TF_FILTER_MAP["5m"])

                candles_q = replay.get_candles(
                    event.symbol, ftf["quality"], limit=30
                )
                market_state = self._build_market_state_context(event, candles_q)
                higher_market_state = self._attach_higher_tf_context(event, replay)
                self._attach_daily_playbook_context(event, replay)
                self._apply_entry_route_adjustments(event, market_state, higher_market_state, candles_q)
                self._attach_structure_context(event, candles_q, replay)
                self._attach_htf_sr_context(event)
                self._attach_playbook_context(event, market_state, higher_market_state)
                extra = dict(getattr(event, "extra", {}) or {})
                extra["background_label"] = self._compose_background_label(extra)
                event.extra = extra

                reentry_ctx = exchange.match_reentry(event)
                existing_trade = next((trade for trade in exchange.open_trades if trade.symbol == event.symbol), None)
                annotate_followup_signal(
                    event,
                    existing_trade=existing_trade,
                    reentry_context=reentry_ctx,
                )

                # === Al Brooks: 信号棒质量综合评估 ===
                # 只保留价格行为自己的信号棒质量，不再叠加 RSI/OBV/Wyckoff 外围前置层。
                if len(candles_q) >= 5:
                    sig_bar = candles_q[-1]
                    prev_bars = candles_q[-6:-1]
                    sbq = self._signal_bar_quality(
                        sig_bar, prev_bars, event.direction)
                    if sbq < 0.3:
                        continue

                # 分数直接沿用真实 PA 引擎的 strength，避免回测链再叠一套额外评分体系。
                score = int(getattr(event, "strength", 0) or 0)
                route_allowed, route_reason = self._check_route_consistency(
                    event,
                    market_state,
                    higher_market_state,
                    score,
                )
                if not route_allowed:
                    self._signals_blocked_route += 1
                    self._route_block_reasons[str(route_reason or "未知路由原因")] += 1
                    self._route_block_by_strategy[str(event.signal_type or "UNKNOWN")][
                        str(route_reason or "未知路由原因")
                    ] += 1
                    continue
                entry_ready, entry_reason = self._check_entry_readiness(event, score)
                if not entry_ready:
                    self._signals_blocked_rr += 1
                    self._entry_block_reasons[str(entry_reason or "未知入场原因")] += 1
                    self._entry_block_by_strategy[str(event.signal_type or "UNKNOWN")][
                        str(entry_reason or "未知入场原因")
                    ] += 1
                    continue

                # 分数分布诊断
                bucket = (score // 10) * 10  # 0-9, 10-19, ...
                self._score_histogram[bucket] = self._score_histogram.get(bucket, 0) + 1

                self._signals_passed += 1
                self._signals_passed_by_strategy[signal_label] += 1

                # 统一 SL/TP 策略: 收紧SL + 远TP安全网
                # SCALP 是主要盈利来源，TP 是趋势行情的奖金
                risk = abs(event.price - event.stop_loss)
                if risk > 0:
                    if not self._apply_management_template(event, management_profile):
                        self._signals_blocked_rr += 1
                        continue

                # 开仓
                background_label = self._compose_background_label(getattr(event, "extra", {}) or {})
                exchange.place_order(event, score, background_label)

                if cfg.verbose:
                    print(f"\n  {ts} | {event.signal_type} {event.direction} "
                          f"@ {event.price:.2f} | 强度: {score} | {background_label}")

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
              f"评分={self._signals_blocked_score} | "
              f"入场/管理={self._signals_blocked_rr}")

        # 分数分布（单分精度）
        if self._score_histogram:
            print("\n  === 分数分布 ===")
            for score_val in sorted(self._score_histogram.keys()):
                count = self._score_histogram[score_val]
                bar = "#" * min(count // 10, 50)
                print(f"  {score_val:3d}: {count:5d} {bar}")

        # Step 7: 生成报告
        result = BacktestResult.from_exchange(
            exchange,
            symbol=",".join(cfg.symbols),
            threshold=0,
            signals_generated=self._signals_generated,
            signals_passed=self._signals_passed,
            signals_blocked_bg=self._signals_blocked_bg,
            signals_blocked_score=self._signals_blocked_score,
            signals_blocked_rr=self._signals_blocked_rr,
            signals_blocked_strategy=self._signals_blocked_strategy,
            signals_blocked_route=self._signals_blocked_route,
            route_block_reasons=dict(self._route_block_reasons),
            route_block_by_strategy={
                strategy: dict(reasons)
                for strategy, reasons in self._route_block_by_strategy.items()
            },
            entry_block_reasons=dict(self._entry_block_reasons),
            entry_block_by_strategy={
                strategy: dict(reasons)
                for strategy, reasons in self._entry_block_by_strategy.items()
            },
            signals_generated_by_strategy={
                strategy: self._signals_generated_by_strategy.get(strategy, 0)
                for strategy in sorted(
                    set(ALL_KNOWN_STRATEGIES)
                    | set(self._signals_generated_by_strategy)
                    | set(self._signals_passed_by_strategy)
                    | set(self._signals_blocked_strategy_by_strategy)
                    | set(self._route_block_by_strategy)
                    | set(self._entry_block_by_strategy)
                )
            },
            signals_passed_by_strategy={
                strategy: self._signals_passed_by_strategy.get(strategy, 0)
                for strategy in sorted(
                    set(ALL_KNOWN_STRATEGIES)
                    | set(self._signals_generated_by_strategy)
                    | set(self._signals_passed_by_strategy)
                    | set(self._signals_blocked_strategy_by_strategy)
                    | set(self._route_block_by_strategy)
                    | set(self._entry_block_by_strategy)
                )
            },
            signals_blocked_strategy_by_strategy={
                strategy: self._signals_blocked_strategy_by_strategy.get(strategy, 0)
                for strategy in sorted(
                    set(ALL_KNOWN_STRATEGIES)
                    | set(self._signals_generated_by_strategy)
                    | set(self._signals_passed_by_strategy)
                    | set(self._signals_blocked_strategy_by_strategy)
                    | set(self._route_block_by_strategy)
                    | set(self._entry_block_by_strategy)
                )
            },
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

        cooldown_module = self._load_signal_service_cooldown(signal_service_src)

        memory_cooldown = MemoryCooldownStorage()
        cooldown_module._storage = memory_cooldown
        cooldown_module.get_cooldown_storage = lambda: memory_cooldown

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

    @staticmethod
    def _load_signal_service_cooldown(signal_service_src: Path):
        """只加载 cooldown 模块，避免触发失效的 storage 包初始化链。"""
        package_name = "storage"
        module_name = "storage.cooldown"
        existing = sys.modules.get(module_name)
        if existing is not None:
            return existing

        storage_pkg = sys.modules.get(package_name)
        if storage_pkg is None:
            storage_pkg = types.ModuleType(package_name)
            storage_pkg.__path__ = [str(signal_service_src / "storage")]
            sys.modules[package_name] = storage_pkg

        cooldown_path = signal_service_src / "storage" / "cooldown.py"
        spec = util.spec_from_file_location(module_name, cooldown_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"无法加载 cooldown 模块: {cooldown_path}")

        module = util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        storage_pkg.cooldown = module
        return module

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

    @staticmethod
    def _load_structure_stops():
        """懒加载真实引擎的结构止损工具，保证回测与真实链共用一套模板。"""
        global _STRUCTURE_STOPS
        if _STRUCTURE_STOPS is not None:
            return _STRUCTURE_STOPS
        signal_service_src = Path(__file__).parent.parent.parent / "services" / "signal-service" / "src"
        if str(signal_service_src) not in sys.path:
            sys.path.insert(0, str(signal_service_src))
        _STRUCTURE_STOPS = import_module("engines.pa.structure_stops")
        return _STRUCTURE_STOPS

    def _identify_market_state_snapshot(self, candles_q) -> dict | None:
        """从一组 K 线提取可复用的市场状态快照。"""
        if len(candles_q) < 20:
            return None

        closes = [candle.close for candle in candles_q]
        ema20 = self._simple_ema(closes, 20)
        if len(ema20) < 5:
            return None

        market_state = CycleIdentifier.identify(candles_q, ema20)
        context_meta = CycleIdentifier.context_range(candles_q)
        market_key = classify_backtest_market_state(market_state) or ""
        recommendation = BACKTEST_STRATEGY_MATRIX.get(market_key, {})
        range_low = float(context_meta["range_low"] or market_state.range_low or 0.0)
        range_high = float(context_meta["range_high"] or market_state.range_high or 0.0)
        range_span = max(range_high - range_low, 0.0)
        range_position = 0.5
        if range_span > 0:
            range_position = (candles_q[-1].close - range_low) / range_span
        range_position = max(0.0, min(1.0, range_position))
        if range_position <= 0.33:
            range_edge = "bottom"
        elif range_position >= 0.67:
            range_edge = "top"
        else:
            range_edge = "middle"
        if range_position <= 0.22:
            range_zone = "deep_bottom"
        elif range_position <= 0.38:
            range_zone = "bottom_advantage"
        elif range_position < 0.45:
            range_zone = "lower_origin"
        elif range_position <= 0.55:
            range_zone = "middle"
        elif range_position < 0.62:
            range_zone = "upper_origin"
        elif range_position < 0.78:
            range_zone = "top_advantage"
        else:
            range_zone = "deep_top"
        return {
            "state": market_state,
            "market_state": market_key,
            "strategy_recommendation": recommendation,
            "pullback_ratio": market_state.pullback_ratio,
            "follow_through": market_state.follow_through,
            "channel_type": market_state.channel_type,
            "range_position": range_position,
            "range_edge": range_edge,
            "range_zone": range_zone,
            "range_window": int(context_meta["window_size"] or len(candles_q)),
            "range_high": range_high,
            "range_low": range_low,
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
        extra["range_zone"] = snapshot["range_zone"]
        extra["range_window"] = snapshot["range_window"]
        event.extra = extra
        return snapshot["state"]

    def _attach_higher_tf_context(self, event, replay):
        """给信号补一个更高一级的结构状态，避免 5m 脱离 15m 乱做。"""
        higher_tf = self._higher_structure_timeframe(str(getattr(event, "timeframe", "") or ""))
        if not higher_tf:
            return None

        candles_higher = replay.get_candles(event.symbol, higher_tf, limit=80)
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
        extra["higher_range_zone"] = snapshot["range_zone"]
        extra["higher_range_window"] = snapshot["range_window"]
        event.extra = extra
        return snapshot["state"]

    def _attach_daily_playbook_context(self, event, replay) -> None:
        """补充日线 TR fade / 微通道所需的上下文。"""
        daily_candles = replay.get_candles(event.symbol, "1d", limit=8)
        if not daily_candles:
            return

        extra = dict(getattr(event, "extra", {}) or {})
        daily_context = build_daily_playbook_context(
            daily_candles,
            float(getattr(event, "price", 0.0) or 0.0),
            getattr(event, "timestamp", None),
            str(getattr(event, "timeframe", "") or "5m"),
        )
        if daily_context:
            extra.update(daily_context)
        extra["signal_timeframe"] = str(getattr(event, "timeframe", "") or "5m")
        event.extra = extra

    def _attach_htf_sr_context(self, event) -> None:
        """根据已经提取的高周期结构位，给 S1 路由提供方向偏置。"""
        extra = dict(getattr(event, "extra", {}) or {})
        price = float(getattr(event, "price", 0.0) or 0.0)
        support_levels = [
            float(value)
            for value in [
                extra.get("nearest_support"),
                extra.get("higher_range_low"),
                extra.get("daily_prev_low"),
            ]
            if float(value or 0.0) > 0
        ]
        resistance_levels = [
            float(value)
            for value in [
                extra.get("nearest_resistance"),
                extra.get("higher_range_high"),
                extra.get("daily_prev_high"),
            ]
            if float(value or 0.0) > 0
        ]
        bias = infer_htf_sr_bias(price, support_levels, resistance_levels)
        if bias:
            extra["htf_sr_bias"] = bias
        event.extra = extra

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
    def _compose_background_label(extra: dict) -> str:
        """把当前与更高周期状态压成可读背景标签。"""
        market_state = str(extra.get("market_state", "") or "")
        higher_market_state = str(extra.get("higher_market_state", "") or "")
        higher_timeframe = str(extra.get("higher_timeframe", "") or "")
        range_zone = str(extra.get("range_zone", "") or "")
        higher_range_zone = str(extra.get("higher_range_zone", "") or "")

        parts: list[str] = []
        if market_state:
            parts.append(f"当前:{market_state}")
        if higher_market_state:
            label = higher_timeframe or "HTF"
            parts.append(f"{label}:{higher_market_state}")
        if range_zone:
            parts.append(f"区位:{range_zone}")
        if higher_range_zone:
            parts.append(f"HTF区位:{higher_range_zone}")
        return " | ".join(parts) if parts else "价格行为背景"

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
            evidence = broke_prior and (
                (tail_ratio >= 0.20 and closed_back)
                or (reclaimed_prior_close and (broke_micro or close_position >= 0.60))
            )
            trapped_side = "bear" if evidence or (broke_micro and reclaimed_prior_close) else ""
            return evidence, trapped_side, {
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
        evidence = broke_prior and (
            (tail_ratio >= 0.20 and closed_back)
            or (reclaimed_prior_close and (broke_micro or close_position >= 0.60))
        )
        trapped_side = "bull" if evidence or (broke_micro and reclaimed_prior_close) else ""
        return evidence, trapped_side, {
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

    @staticmethod
    def _is_endless_pullback_context(
        prior_leg_context: str,
        prior_leg_bars: int,
        prior_leg_overlap_ratio: float,
    ) -> bool:
        """把过长、重叠过多的回调腿视为 Endless PB / 弱恢复环境。"""
        return (
            prior_leg_context in {"tr_leg", "tr_second_leg"}
            and prior_leg_bars >= 5
            and prior_leg_overlap_ratio >= 0.38
        )

    @staticmethod
    def _estimate_atr(candles_q, period: int = 14) -> float:
        """轻量估算 ATR，供回测结构止损模板共用。"""
        if len(candles_q) < 2:
            return 0.0
        window = candles_q[-period:] if len(candles_q) >= period else candles_q
        true_ranges: list[float] = []
        prev_close = float(window[0].close)
        for candle in window:
            high = float(candle.high)
            low = float(candle.low)
            tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
            true_ranges.append(tr)
            prev_close = float(candle.close)
        return sum(true_ranges) / max(len(true_ranges), 1)

    @classmethod
    def _build_playbook_perfect_stop(
        cls,
        *,
        direction: str,
        signal_type: str,
        playbook_id: str,
        candles_q,
        signal_bar_high: float,
        signal_bar_low: float,
        nearest_support: float,
        nearest_resistance: float,
        higher_range_low: float,
        higher_range_high: float,
        extra: dict,
    ) -> float:
        """按 Brooks playbook 生成回测侧的结构止损基准。"""
        structure_stops = cls._load_structure_stops()
        atr = cls._estimate_atr(candles_q)
        direction = str(direction or "")
        signal_type = str(signal_type or "")
        playbook_id = str(playbook_id or "")
        reference_levels = [
            value
            for value in [
                nearest_support,
                nearest_resistance,
                higher_range_low,
                higher_range_high,
                extra.get("daily_prev_low"),
                extra.get("daily_prev_high"),
            ]
            if float(value or 0.0) > 0
        ]

        if playbook_id == "TR2_FAILED_BO_FADE":
            breakout_extreme = float(extra.get("breakout_extreme") or 0.0)
            if breakout_extreme <= 0:
                breakout_extreme = signal_bar_high if direction == "SELL" else signal_bar_low
            return structure_stops.build_tr_failed_breakout_stop(
                direction,
                candles_q,
                breakout_extreme,
                signal_bar_high,
                signal_bar_low,
                atr,
            )

        if playbook_id == "TR3_SECOND_LEG_TRAP":
            second_leg_extreme = float(extra.get("second_leg_extreme") or 0.0)
            if second_leg_extreme <= 0:
                second_leg_extreme = signal_bar_high if direction == "SELL" else signal_bar_low
            return structure_stops.build_tr_second_leg_trap_stop(
                direction,
                candles_q,
                second_leg_extreme,
                signal_bar_high,
                signal_bar_low,
                atr,
            )

        if playbook_id in {
            "R0_FIRST_REVERSAL_PROBE",
            "R1_BROAD_CHANNEL_REVERSAL",
            "R2_TR_EDGE_REVERSAL",
            CHANNEL_LINE_FADE_PLAYBOOK,
            DAILY_TR_FADE_PLAYBOOK,
            HTF_SR_REVERSAL_PLAYBOOK,
            MICRO_CHANNEL_REVERSAL_PLAYBOOK,
            WEDGE_PULLBACK_PLAYBOOK,
        }:
            return structure_stops.build_reversal_structure_stop(
                direction,
                candles_q,
                signal_bar_high,
                signal_bar_low,
                atr,
                reference_levels=reference_levels,
            )

        if playbook_id in {"T6_TR_LEG_FIRST_PULLBACK", "T6_TR_LEG_CHANNEL_RECOVERY", "T6_TR_LEG_EMA_RECOVERY"}:
            return structure_stops.build_channel_recovery_stop(
                direction,
                candles_q,
                signal_bar_high,
                signal_bar_low,
                atr,
            )

        if signal_type in {"双重顶", "双重底", "楔形顶", "楔形底", "头肩顶MTR", "头肩底MTR", "末端旗形", "急速通道"}:
            return structure_stops.build_reversal_structure_stop(
                direction,
                candles_q,
                signal_bar_high,
                signal_bar_low,
                atr,
                reference_levels=reference_levels,
            )

        return structure_stops.build_trend_pullback_stop(
            direction,
            candles_q,
            signal_bar_high,
            signal_bar_low,
            atr,
        )

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
        higher_candles = replay.get_candles(event.symbol, higher_tf, limit=80) if higher_tf else []
        current_swings = CycleIdentifier._find_swings(candles_q[-30:] if len(candles_q) >= 30 else candles_q)
        higher_swings = CycleIdentifier._find_swings(
            higher_candles[-30:] if len(higher_candles) >= 30 else higher_candles
        )
        current_context = CycleIdentifier.context_range(candles_q)
        higher_context = CycleIdentifier.context_range(higher_candles) if higher_candles else {
            "range_low": 0.0,
            "range_high": 0.0,
            "window_size": 0,
        }
        range_low = float(current_context["range_low"] or 0.0)
        range_high = float(current_context["range_high"] or 0.0)
        range_midpoint = (range_low + range_high) / 2.0 if range_low > 0 and range_high > 0 else 0.0
        higher_range_low = float(higher_context["range_low"] or 0.0)
        higher_range_high = float(higher_context["range_high"] or 0.0)
        higher_range_midpoint = (
            (higher_range_low + higher_range_high) / 2.0
            if higher_range_low > 0 and higher_range_high > 0
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
        signal_bar_range = max(signal_bar_high - signal_bar_low, 0.0)
        # Brooks 的“结构位外”优先看最近可见波动，而不是 ATR 倍数。
        signal_bar_buffer = max(
            signal_bar_range * 0.08,
            abs(entry_price) * 0.0001,
            1e-9,
        )

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

        playbook_id = str(extra.get("playbook_id") or "")
        signal_type = str(getattr(event, "signal_type", "") or "")
        perfect_stop = stop_loss
        entry_type = str(getattr(event, "entry_type", "STOP") or "STOP").upper()
        route_style = str(extra.get("route_style", "") or "")
        if entry_price > 0:
            perfect_stop = self._build_playbook_perfect_stop(
                direction=direction,
                signal_type=signal_type,
                playbook_id=playbook_id,
                candles_q=candles_q,
                signal_bar_high=signal_bar_high,
                signal_bar_low=signal_bar_low,
                nearest_support=nearest_support,
                nearest_resistance=nearest_resistance,
                higher_range_low=higher_range_low,
                higher_range_high=higher_range_high,
                extra=extra,
            )

        relaxed_trend_stop_playbooks = {
            "T1_FIRST_PULLBACK",
            "T2_TREND_H2",
            "T3_TREND_EMA",
            "T2_BROAD_CHANNEL_RECOVERY",
            "T3_BROAD_CHANNEL_EMA",
        }
        strict_structure_playbooks = {
            "TR2_FAILED_BO_FADE",
            "TR3_SECOND_LEG_TRAP",
            "R0_FIRST_REVERSAL_PROBE",
            "R1_BROAD_CHANNEL_REVERSAL",
            "R2_TR_EDGE_REVERSAL",
            CHANNEL_LINE_FADE_PLAYBOOK,
            DAILY_TR_FADE_PLAYBOOK,
            HTF_SR_REVERSAL_PLAYBOOK,
            MICRO_CHANNEL_REVERSAL_PLAYBOOK,
        }
        stop_auto_realigned = False
        if perfect_stop > 0:
            if stop_loss <= 0:
                stop_loss = perfect_stop
                stop_auto_realigned = True
            elif playbook_id not in relaxed_trend_stop_playbooks:
                if direction == "BUY" and stop_loss > perfect_stop:
                    stop_loss = perfect_stop
                    stop_auto_realigned = True
                elif direction == "SELL" and stop_loss < perfect_stop:
                    stop_loss = perfect_stop
                    stop_auto_realigned = True
        if stop_auto_realigned:
            event.stop_loss = stop_loss

        actual_risk = abs(entry_price - stop_loss)
        perfect_risk = abs(entry_price - perfect_stop)
        actual_to_perfect_risk_ratio = actual_risk / perfect_risk if perfect_risk > 0 else 1.0

        if direction == "BUY":
            stop_structure_ok = (
                stop_loss <= signal_bar_low - signal_bar_buffer
                if signal_bar_low > 0
                else stop_loss < entry_price
            )
            if (
                playbook_id in strict_structure_playbooks
                and entry_type == "STOP"
                and nearest_support > 0
                and stop_loss > nearest_support
            ):
                stop_structure_ok = False
            if perfect_stop > 0:
                if playbook_id not in relaxed_trend_stop_playbooks and stop_loss > perfect_stop:
                    stop_structure_ok = False
        else:
            stop_structure_ok = (
                stop_loss >= signal_bar_high + signal_bar_buffer
                if signal_bar_high > 0
                else stop_loss > entry_price
            )
            if (
                playbook_id in strict_structure_playbooks
                and entry_type == "STOP"
                and nearest_resistance > 0
                and stop_loss < nearest_resistance
            ):
                stop_structure_ok = False
            if perfect_stop > 0:
                if playbook_id not in relaxed_trend_stop_playbooks and stop_loss < perfect_stop:
                    stop_structure_ok = False

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
            "midline": [value for value in [range_midpoint, higher_range_midpoint] if value > 0],
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
            signal_type=signal_type,
            signal_bar_quality=float(signal_bar_context.get("signal_bar_quality", 0.0) or 0.0),
            follow_through=bool(extra.get("follow_through", False)),
            higher_follow_through=bool(extra.get("higher_follow_through", False)),
            broke_micro_extreme=bool(signal_bar_context.get("broke_micro_extreme", False)),
            reclaimed_prior_close=bool(signal_bar_context.get("reclaimed_prior_close", False)),
            prior_leg_context=str(extra.get("prior_leg_context", "") or ""),
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
        extra["blocking_magnet_cluster_count"] = int(target_plan.get("blocking_cluster_count") or 0)
        extra["blocking_magnet_cluster_strength"] = float(target_plan.get("blocking_cluster_strength") or 0.0)
        extra["blocking_magnet_structural"] = bool(target_plan.get("blocking_cluster_structural", False))
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
        extra["stop_auto_realigned"] = stop_auto_realigned
        extra["actual_to_perfect_risk_ratio"] = actual_to_perfect_risk_ratio
        extra["range_window"] = int(current_context["window_size"] or 0)
        extra["higher_range_window"] = int(higher_context["window_size"] or 0)
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
        candles_5m = replay.get_candles(symbol, "5m", limit=80)
        candles_15m = replay.get_candles(symbol, "15m", limit=80)
        candles_1h = replay.get_candles(symbol, "1h", limit=80)

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
    def _range_zone_matches_direction(range_zone: str, direction: str, *, allow_origin: bool = False) -> bool:
        """交易区间近边缘优势区与反做方向是否一致。"""
        if direction == "BUY":
            zones = {"deep_bottom", "bottom_advantage"}
            if allow_origin:
                zones.add("lower_origin")
            return range_zone in zones
        if direction == "SELL":
            zones = {"deep_top", "top_advantage"}
            if allow_origin:
                zones.add("upper_origin")
            return range_zone in zones
        return False

    @staticmethod
    def _is_tr_blshs_signal(signal_type: str, direction: str, range_edge: str, range_zone: str = "") -> bool:
        """H1/H2/L1/L2 与反转结构在 TR 边缘可作为 BLSHS 的执行信号。"""
        if direction == "BUY" and (
            range_edge == "bottom" or range_zone in {"deep_bottom", "bottom_advantage"}
        ):
            return signal_type in TR_BLSHS_BUY_SIGNALS
        if direction == "SELL" and (
            range_edge == "top" or range_zone in {"deep_top", "top_advantage"}
        ):
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
        """判断是否仍贴近更高 TR 边缘。"""
        pos = max(0.0, min(1.0, float(range_position or 0.5)))
        if direction == "BUY":
            return pos <= 0.38
        if direction == "SELL":
            return pos >= 0.62
        return False

    @staticmethod
    def _is_advantage_zone(range_position: float, direction: str) -> bool:
        """判断是否仍处于 Brooks 可接受的优势半区，而非真正中部。"""
        pos = max(0.0, min(1.0, float(range_position or 0.5)))
        if direction == "BUY":
            return pos <= 0.48
        if direction == "SELL":
            return pos >= 0.52
        return False

    @staticmethod
    def _is_mid_band(range_position: float) -> bool:
        """判断是否已经回到更高 TR 中部附近。"""
        pos = max(0.0, min(1.0, float(range_position or 0.5)))
        return 0.48 < pos < 0.52

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
        direction: str,
        entry_type: str,
        extra: dict,
    ) -> tuple[str, str, str]:
        """按共享 Brooks 路由给候选单打上 playbook 标签。"""
        return resolve_playbook_context(
            signal_type,
            market_key,
            higher_key=higher_key,
            direction=direction,
            entry_type=entry_type,
            extra=extra,
        )

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
            str(getattr(event, "direction", "") or ""),
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
        range_zone = str(extra.get("range_zone", "") or "")
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
        higher_advantage_zone = self._is_advantage_zone(higher_range_position, direction)
        higher_origin_half = self._is_origin_half(higher_range_position, direction)
        higher_mid_band = self._is_mid_band(higher_range_position)
        counter_weak_trend = (
            (market_key == "weak_trend_bull" and direction == "SELL")
            or (market_key == "weak_trend_bear" and direction == "BUY")
        )

        if market_key in {"tight_range", "broad_range"} and self._is_tr_blshs_signal(
            signal_type,
            direction,
            range_edge,
            range_zone,
        ):
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
            and (higher_edge_zone or higher_advantage_zone or higher_origin_half)
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
        direction = str(getattr(event, "direction", "") or "")
        extra = dict(getattr(event, "extra", {}) or {})
        tbtl_big = int(extra.get("tbtl_big", 0) or 0)
        range_edge = str(extra.get("range_edge", "") or "")
        range_zone = str(extra.get("range_zone", "") or "")
        higher_key = (
            classify_backtest_market_state(higher_market_state) if higher_market_state is not None else ""
        ) or str(extra.get("higher_market_state", "") or "")
        higher_timeframe = str(extra.get("higher_timeframe", "") or "")
        higher_follow_through = bool(
            getattr(higher_market_state, "follow_through", extra.get("higher_follow_through", False))
        )
        higher_pullback_ratio = float(
            getattr(higher_market_state, "pullback_ratio", extra.get("higher_pullback_ratio", 0.0)) or 0.0
        )
        range_position = float(extra.get("range_position", 0.5) or 0.5)
        higher_range_position = float(extra.get("higher_range_position", 0.5) or 0.5)
        higher_range_edge = str(extra.get("higher_range_edge", "") or "")
        playbook_id = str(extra.get("playbook_id", "") or "")
        higher_weakening = (
            higher_pullback_ratio >= 0.5
            or bool(getattr(higher_market_state, "is_ttr", False))
            or not higher_follow_through
        )
        failed_breakout_evidence = bool(extra.get("failed_breakout_evidence", False))
        trapped_side = str(extra.get("trapped_side", "") or "")
        prior_leg_context = str(extra.get("prior_leg_context", "") or "")
        prior_leg_bars = int(extra.get("prior_leg_bars", 0) or 0)
        prior_leg_overlap_ratio = float(extra.get("prior_leg_overlap_ratio", 0.0) or 0.0)
        trendline_break_confirmed = bool(extra.get("trendline_break_confirmed", False))
        signal_bar_quality = float(extra.get("signal_bar_quality", 0.0) or 0.0)
        near_ema = bool(extra.get("near_ema", False))

        is_reversal = signal_type in ROUTE_REVERSAL_STRATEGIES
        is_minor_reversal = signal_type in ROUTE_MINOR_REVERSAL_STRATEGIES
        is_trend = signal_type in ROUTE_TREND_STRATEGIES
        is_tr_blshs = BacktestRunner._is_tr_blshs_signal(signal_type, direction, range_edge, range_zone)
        is_breakout_chase = signal_type in BREAKOUT_CHASE_SIGNALS
        is_breakout = (
            ("突破" in signal_type and signal_type not in {"突破回调", "看衰突破"})
            or signal_type == "收线追进"
        )

        pullback_ratio = float(getattr(market_state, "pullback_ratio", 0.0) or 0.0)
        follow_through = bool(getattr(market_state, "follow_through", False))
        weakening = pullback_ratio >= 0.5 or market_state.is_ttr or not follow_through or tbtl_big >= 5
        tradeable_advantage_zone = BacktestRunner._is_advantage_zone(range_position, direction)
        tradeable_edge_zone = BacktestRunner._is_edge_zone(range_position, direction)
        tradeable_origin_zone = BacktestRunner._range_zone_matches_direction(
            range_zone,
            direction,
            allow_origin=True,
        )
        tradeable_zone = tradeable_origin_zone or tradeable_advantage_zone or tradeable_edge_zone
        strong_signal_bar = signal_bar_quality >= 0.58
        good_signal_bar = signal_bar_quality >= 0.54
        acceptance_ready = bool(extra.get("acceptance_ready", False))
        executable_signal_ready = bool(extra.get("executable_signal_ready", False))
        reclaimed_prior_close = bool(extra.get("reclaimed_prior_close", False))
        gap_context = extra.get("gap_context") if isinstance(extra.get("gap_context"), dict) else {}
        stairs_pattern = bool(gap_context.get("stairs_pattern", False))
        exhaustion_detected = bool(gap_context.get("exhaustion_detected", False))
        classic_reversal_setup = signal_type in {
            "高2",
            "低2",
            "双重顶",
            "双重底",
            "楔形顶",
            "楔形底",
            "头肩顶MTR",
            "头肩底MTR",
            "第二腿陷阱",
            "看衰突破",
        }
        reversal_evidence = failed_breakout_evidence or trendline_break_confirmed or bool(trapped_side)
        second_leg_pressure = prior_leg_context == "tr_second_leg"
        endless_pullback_context = BacktestRunner._is_endless_pullback_context(
            prior_leg_context,
            prior_leg_bars,
            prior_leg_overlap_ratio,
        )
        brooks_reversal_ready = reversal_evidence or (
            (
                tradeable_edge_zone
                or tradeable_advantage_zone
                or second_leg_pressure
                or (classic_reversal_setup and tradeable_advantage_zone)
            )
            and (
                strong_signal_bar
                or good_signal_bar
                or follow_through
                or (acceptance_ready and executable_signal_ready)
                or (stairs_pattern and good_signal_bar)
                or (exhaustion_detected and strong_signal_bar)
            )
        )
        breakout_mode_ready = False
        if signal_type in {"ii突破", "ioi突破"}:
            breakout_mode_ready = (
                near_ema
                or tradeable_advantage_zone
                or tradeable_edge_zone
                or follow_through
                or higher_follow_through
                or signal_bar_quality >= 0.56
            ) and not bool(trapped_side)
        elif signal_type == "iii突破":
            breakout_mode_ready = (
                (
                    follow_through
                    or higher_follow_through
                    or (near_ema and signal_bar_quality >= 0.56)
                    or (tradeable_advantage_zone and signal_bar_quality >= 0.58)
                )
                and not bool(trapped_side)
            )

        strong_first_entry_recovery = (
            signal_type in {"高1", "低1"}
            and good_signal_bar
            and (
                tradeable_zone
                or prior_leg_context == "trend_leg"
                or (acceptance_ready and executable_signal_ready)
                or reclaimed_prior_close
            )
        )
        strong_second_entry_recovery = (
            signal_type in {"高2", "低2", "突破回调", "20均线缺口", "第一均线缺口"}
            and (good_signal_bar or signal_bar_quality >= 0.52)
            and (
                trendline_break_confirmed
                or tradeable_zone
                or prior_leg_context in {"trend_leg", "tr_second_leg"}
                or (acceptance_ready and executable_signal_ready)
                or reclaimed_prior_close
                or stairs_pattern
            )
        )
        continuation_context_ready = (
            acceptance_ready
            or executable_signal_ready
            or reclaimed_prior_close
            or stairs_pattern
            or exhaustion_detected
        )
        endless_pullback_ready = (
            trendline_break_confirmed
            or breakout_mode_ready
            or (follow_through and reclaimed_prior_close)
            or (follow_through and strong_signal_bar)
            or (higher_follow_through and acceptance_ready and executable_signal_ready)
            or (tradeable_zone and reclaimed_prior_close and good_signal_bar)
            or (acceptance_ready and executable_signal_ready and good_signal_bar)
            or (stairs_pattern and tradeable_zone and good_signal_bar)
        )

        if market_key == "strong_trend_bull":
            if direction == "SELL":
                if not is_reversal:
                    return False, "强多趋势中禁止逆势顺势单"
                if not weakening:
                    return False, "强多趋势中反转证据不足"
        elif market_key == "strong_trend_bear":
            if direction == "BUY":
                if not is_reversal:
                    return False, "强空趋势中禁止逆势顺势单"
                if not weakening:
                    return False, "强空趋势中反转证据不足"

        if market_key == "tight_range":
            in_advantage_edge = BacktestRunner._range_zone_matches_direction(
                range_zone,
                direction,
                allow_origin=strong_signal_bar or second_leg_pressure,
            ) or tradeable_advantage_zone
            near_edge_trade_ready = in_advantage_edge and (
                brooks_reversal_ready
                or signal_type in {"双重顶", "双重底", "头肩顶MTR", "头肩底MTR", "高2", "低2"}
            )
            tradeable_edge = BacktestRunner._range_edge_matches_direction(
                range_edge,
                direction,
            ) or near_edge_trade_ready or (tradeable_edge_zone and strong_signal_bar)
            if range_zone in {"middle", "lower_origin", "upper_origin"}:
                return False, "交易区间中部不做单"
            if not tradeable_edge:
                return False, "交易区间里必须在边缘反做"
            if is_breakout and signal_type not in {"看衰突破"}:
                return False, "区间里禁止突破追单和趋势延续单"
            if is_trend and not is_tr_blshs:
                return False, "交易区间里趋势延续单只允许边缘二次信号"
            if market_key == "tight_range" and not (follow_through or higher_follow_through):
                return False, "紧密交易区间只做更高质量 setup"
            if (
                is_reversal
                and entry_type == "STOP"
                and signal_type not in {"头肩顶MTR", "头肩底MTR"}
                and not brooks_reversal_ready
            ):
                return False, "区间中的反转 stop 单质量不足"

        if market_key == "broad_range":
            in_advantage_edge = BacktestRunner._range_zone_matches_direction(
                range_zone,
                direction,
                allow_origin=True,
            ) or tradeable_advantage_zone
            near_edge_trade_ready = in_advantage_edge and (
                brooks_reversal_ready
                or signal_type in {"双重顶", "双重底", "头肩顶MTR", "头肩底MTR", "高2", "低2", "楔形顶", "楔形底"}
            )
            tradeable_edge = BacktestRunner._range_edge_matches_direction(
                range_edge,
                direction,
            ) or tradeable_advantage_zone or near_edge_trade_ready or (tradeable_edge_zone and strong_signal_bar)

            if playbook_id in {
                "TR1_BLSHS",
                "TR2_FAILED_BO_FADE",
                "TR3_SECOND_LEG_TRAP",
                "R1_BROAD_CHANNEL_REVERSAL",
                "R2_TR_EDGE_REVERSAL",
                CHANNEL_LINE_FADE_PLAYBOOK,
                DAILY_TR_FADE_PLAYBOOK,
                HTF_SR_REVERSAL_PLAYBOOK,
                MICRO_CHANNEL_REVERSAL_PLAYBOOK,
            } or is_reversal:
                if range_zone == "middle" and not brooks_reversal_ready:
                    return False, "宽通道中部不做逆势 fade"
                if not tradeable_edge and not (follow_through or brooks_reversal_ready):
                    return False, "宽通道逆势单仍需靠近边缘或优势区"
                if (
                    is_breakout
                    and signal_type not in {"看衰突破"}
                    and not failed_breakout_evidence
                    and not breakout_mode_ready
                ):
                    return False, "宽通道逆势里不追弱突破"

            if playbook_id in {
                "T2_BROAD_CHANNEL_RECOVERY",
                "T3_BROAD_CHANNEL_EMA",
                "T6_TR_LEG_FIRST_PULLBACK",
                "T6_TR_LEG_CHANNEL_RECOVERY",
                "T6_TR_LEG_EMA_RECOVERY",
            } or (is_trend and not is_reversal):
                continuation_ready = (
                    follow_through
                    or higher_follow_through
                    or prior_leg_context == "trend_leg"
                    or strong_first_entry_recovery
                    or strong_second_entry_recovery
                    or breakout_mode_ready
                    or continuation_context_ready
                )
                if endless_pullback_context and not endless_pullback_ready:
                    return False, "endless PB 里先等 BO+FT 或收回前收盘"
                if (
                    range_zone == "middle"
                    and not continuation_ready
                    and prior_leg_context != "trend_leg"
                ):
                    return False, "宽通道中部顺势恢复仍缺少接受"
                if (
                    not continuation_ready
                ):
                    return False, "宽通道顺势恢复缺少 follow-through"
                if is_breakout and not follow_through and not breakout_mode_ready:
                    return False, "宽通道里不追弱突破"

        if market_key in {"weak_trend_bull", "weak_trend_bear"}:
            aligned_bull = market_key == "weak_trend_bull" and direction == "BUY"
            aligned_bear = market_key == "weak_trend_bear" and direction == "SELL"
            if is_breakout and not follow_through and not breakout_mode_ready:
                return False, "弱趋势里缺少 follow-through 不追突破"
            if (
                (aligned_bull or aligned_bear)
                and is_trend
                and endless_pullback_context
                and not endless_pullback_ready
            ):
                return False, "endless PB 里的趋势恢复先等 BO+FT"
            if (
                (aligned_bull or aligned_bear)
                and is_trend
                and pullback_ratio > 0.66
                and not (
                    follow_through
                    or higher_follow_through
                    or continuation_context_ready
                    or strong_first_entry_recovery
                    or strong_second_entry_recovery
                    or trendline_break_confirmed
                )
            ):
                return False, "深回调后的趋势延续质量不足"
            if (
                not (aligned_bull or aligned_bear)
                and is_reversal
                and entry_type == "STOP"
                and tbtl_big < 5
                and not brooks_reversal_ready
            ):
                return False, "弱趋势中的逆势反转证据不足"

        if higher_timeframe and higher_key in {"tight_range", "broad_range"}:
            higher_edge_conflict = (
                (direction == "BUY" and higher_range_edge == "top")
                or (direction == "SELL" and higher_range_edge == "bottom")
            )
            higher_mid_band = BacktestRunner._is_mid_band(higher_range_position)
            if is_breakout_chase and higher_mid_band and not follow_through:
                return False, "更高一级周期为 TR，当前周期中部不追弱突破"
            if is_breakout_chase and higher_edge_conflict and not failed_breakout_evidence:
                return False, "更高一级周期为 TR，当前周期已逼近对侧边缘"
            if (
                playbook_id in {"T6_TR_LEG_FIRST_PULLBACK", "T6_TR_LEG_CHANNEL_RECOVERY", "T6_TR_LEG_EMA_RECOVERY"}
                and higher_edge_conflict
                and not trendline_break_confirmed
            ):
                return False, "更高一级周期为 TR，当前腿已贴近对侧边缘"
            if is_reversal and entry_type == "STOP" and higher_mid_band and not (
                brooks_reversal_ready
                or tradeable_advantage_zone
                or (classic_reversal_setup and strong_signal_bar and tradeable_edge_zone)
            ):
                return False, "更高一级周期为 TR，中部反转仍缺少失败突破证据"
            if (
                is_reversal
                and entry_type == "STOP"
                and signal_type not in {"头肩顶MTR", "头肩底MTR"}
                and not (
                    brooks_reversal_ready
                    or (classic_reversal_setup and strong_signal_bar and tradeable_advantage_zone)
                )
            ):
                return False, "更高一级周期为 TR，当前周期反转 stop 单确认不足"
            if (
                is_minor_reversal
                and entry_type == "STOP"
                and not (brooks_reversal_ready or (strong_signal_bar and tradeable_edge_zone))
            ):
                return False, "更高一级周期为 TR，当前周期小反转要更强确认"

        if higher_timeframe and higher_key == "strong_trend_bull" and direction == "SELL":
            if not is_reversal:
                return False, "更高一级周期强多趋势中，禁止逆势顺势单"
            if not higher_weakening:
                return False, "更高一级周期强多趋势中，当前周期反转证据不足"

        if higher_timeframe and higher_key == "strong_trend_bear" and direction == "BUY":
            if not is_reversal:
                return False, "更高一级周期强空趋势中，禁止逆势顺势单"
            if not higher_weakening:
                return False, "更高一级周期强空趋势中，当前周期反转证据不足"

        if higher_timeframe and higher_key == "weak_trend_bull":
            if direction == "SELL" and is_minor_reversal and not higher_weakening:
                return False, "更高一级周期弱多结构中，当前周期小反转证据不足"

        if higher_timeframe and higher_key == "weak_trend_bear":
            if direction == "BUY" and is_minor_reversal and not higher_weakening:
                return False, "更高一级周期弱空结构中，当前周期小反转证据不足"

        return True, ""

    @staticmethod
    def _check_entry_readiness(event, score: int) -> tuple[bool, str]:
        """按 S5/S6 检查关键位、目标路径与止损结构。"""
        extra = dict(getattr(event, "extra", {}) or {})
        signal_type = str(getattr(event, "signal_type", "") or "")
        entry_type = str(getattr(event, "entry_type", "STOP") or "STOP").upper()
        stop_structure_ok = bool(extra.get("stop_structure_ok", True))
        target_path_clear = bool(extra.get("target_path_clear", True))
        if not stop_structure_ok:
            return False, "止损没有放到结构位外"

        market_state = str(extra.get("market_state", "") or "")
        higher_market_state = str(extra.get("higher_market_state", "") or "")
        higher_follow_through = bool(extra.get("higher_follow_through"))
        follow_through = bool(extra.get("follow_through"))
        requires_second_entry = bool(extra.get("requires_second_entry"))
        acceptance_ready = bool(extra.get("acceptance_ready"))
        executable_signal_ready = bool(extra.get("executable_signal_ready"))
        range_position = float(extra.get("range_position", 0.5) or 0.5)
        range_edge = str(extra.get("range_edge", "") or "")
        range_zone = str(extra.get("range_zone", "") or "")
        direction = str(getattr(event, "direction", "") or "")
        magnet_cluster_count = int(extra.get("blocking_magnet_cluster_count", 0) or 0)
        magnet_cluster_strength = float(extra.get("blocking_magnet_cluster_strength", 0.0) or 0.0)
        blocking_magnet_structural = bool(extra.get("blocking_magnet_structural", False))
        blocking_magnet_kind = str(extra.get("blocking_magnet_kind") or "")
        blocking_magnet_distance_r = float(extra.get("blocking_magnet_distance_r", 0.0) or 0.0)
        trendline_break_confirmed = bool(extra.get("trendline_break_confirmed", False))
        failed_breakout_evidence = bool(extra.get("failed_breakout_evidence", False))
        signal_bar_quality = float(extra.get("signal_bar_quality", 0.0) or 0.0)
        signal_bar_tail_ratio = float(extra.get("signal_bar_tail_ratio", 0.0) or 0.0)
        reclaimed_prior_close = bool(extra.get("reclaimed_prior_close", False))
        broke_micro_extreme = bool(extra.get("broke_micro_extreme", False))
        trapped_side = str(extra.get("trapped_side") or "")
        prior_leg_context = str(extra.get("prior_leg_context") or "")
        prior_leg_bars = int(extra.get("prior_leg_bars", 0) or 0)
        prior_leg_overlap_ratio = float(extra.get("prior_leg_overlap_ratio", 0.0) or 0.0)
        playbook_id = str(extra.get("playbook_id") or "")
        gap_context = extra.get("gap_context") if isinstance(extra.get("gap_context"), dict) else {}
        stairs_pattern = bool(gap_context.get("stairs_pattern", False))
        exhaustion_detected = bool(gap_context.get("exhaustion_detected", False))
        signal_rank = 0
        if signal_type in {"高1", "低1"}:
            signal_rank = 1
        elif signal_type in {"高2", "低2"}:
            signal_rank = 2

        extra["signal_rank"] = signal_rank
        extra["signal_stage"] = "executable"
        extra["signal_stage_reason"] = "结构、目标路径与信号成熟度通过"
        tradeable_edge = (
            BacktestRunner._range_edge_matches_direction(range_edge, direction)
            or BacktestRunner._is_edge_zone(range_position, direction)
        )
        tradeable_zone = (
            tradeable_edge
            or BacktestRunner._range_zone_matches_direction(range_zone, direction, allow_origin=True)
            or BacktestRunner._is_advantage_zone(range_position, direction)
        )
        strong_signal_bar = signal_bar_quality >= 0.58
        good_signal_bar = signal_bar_quality >= 0.54
        reversal_evidence = failed_breakout_evidence or trendline_break_confirmed or bool(trapped_side)
        endless_pullback_context = BacktestRunner._is_endless_pullback_context(
            prior_leg_context,
            prior_leg_bars,
            prior_leg_overlap_ratio,
        )
        first_signal_context_ready = (
            tradeable_zone
            or prior_leg_context == "trend_leg"
            or acceptance_ready
            or follow_through
            or higher_follow_through
        )
        first_signal_exception = good_signal_bar and (
            reversal_evidence
            or first_signal_context_ready
            or prior_leg_context == "tr_second_leg"
        )
        h2_l2_context_ready = (
            tradeable_zone
            or prior_leg_context in {"trend_leg", "tr_second_leg"}
            or acceptance_ready
            or follow_through
            or higher_follow_through
        )
        second_signal_exception = (good_signal_bar or signal_bar_quality >= 0.52) and (
            reversal_evidence
            or h2_l2_context_ready
        )
        endless_pullback_ready = (
            trendline_break_confirmed
            or reversal_evidence
            or (follow_through and reclaimed_prior_close)
            or (follow_through and strong_signal_bar)
            or (higher_follow_through and acceptance_ready and executable_signal_ready)
            or (tradeable_zone and reclaimed_prior_close and good_signal_bar)
            or (acceptance_ready and executable_signal_ready and good_signal_bar)
            or (stairs_pattern and tradeable_zone and good_signal_bar)
        )

        def block(stage: str, reason: str) -> tuple[bool, str]:
            extra["signal_stage"] = stage
            extra["signal_stage_reason"] = reason
            event.extra = extra
            return False, reason

        if signal_rank == 1:
            if endless_pullback_context and not endless_pullback_ready:
                return block("watch", "endless PB 里的 H1/L1 先等 BO+FT 或收回前收盘")
            if not (
                follow_through
                or higher_follow_through
                or first_signal_exception
                or (tradeable_zone and good_signal_bar)
                or (acceptance_ready and executable_signal_ready and good_signal_bar)
            ):
                return block("watch", "H1/L1 仍缺少 follow-through / acceptance")
            if (
                requires_second_entry
                and not (
                    (acceptance_ready and executable_signal_ready)
                    or follow_through
                    or higher_follow_through
                    or prior_leg_context == "trend_leg"
                )
                and not first_signal_exception
                and not (tradeable_zone and signal_bar_quality >= 0.56)
            ):
                return block("candidate", "第一次信号尚未完成接受，继续等 H2/L2 或二次确认")

        if signal_type == "第二腿陷阱":
            if prior_leg_context not in {"tr_second_leg", "tr_leg"}:
                return block("watch", "第二腿陷阱缺少清晰的 second-leg 背景")
            if not (
                failed_breakout_evidence
                or trapped_side
                or trendline_break_confirmed
                or (tradeable_zone and strong_signal_bar)
                or (tradeable_zone and reclaimed_prior_close and good_signal_bar)
                or (stairs_pattern and tradeable_zone and good_signal_bar)
                or (exhaustion_detected and tradeable_zone and strong_signal_bar)
            ):
                return block("candidate", "第二腿陷阱仍缺少 failed breakout / trapped trader 证据")
            if (
                not target_path_clear
                and blocking_magnet_structural
                and blocking_magnet_distance_r < 0.8
                and not (failed_breakout_evidence or strong_signal_bar)
            ):
                return block("candidate", "第二腿陷阱前方磁体过近，先等更清晰的折返空间")

        if signal_type == "楔形底" and entry_type == "STOP":
            if market_state == "weak_trend_bear" and higher_market_state in {"broad_range", "tight_range"}:
                return block("candidate", "空头弱趋势里的楔形底更像 first reversal，先等 failed breakout 或二次确认")

        if signal_type == "看衰突破":
            fade_breakout_ready = (
                failed_breakout_evidence
                or reclaimed_prior_close
                or (signal_bar_tail_ratio >= 0.18 and bool(trapped_side))
            )
            if not fade_breakout_ready:
                return block("candidate", "看衰突破还没完成回到区间内的失败突破")
            if not (
                trapped_side
                or signal_bar_tail_ratio >= 0.14
                or trendline_break_confirmed
                or broke_micro_extreme
                or (tradeable_zone and good_signal_bar and reclaimed_prior_close)
                or (acceptance_ready and executable_signal_ready and reclaimed_prior_close)
            ):
                return block("candidate", "看衰突破缺少拒绝或受困一侧证据")
            if (
                not target_path_clear
                and blocking_magnet_structural
                and blocking_magnet_distance_r < 0.9
            ):
                return block("candidate", "看衰突破前方目标受阻，先不追")

        if signal_type == "头肩底MTR" and entry_type == "STOP":
            if (
                market_state == "weak_trend_bear"
                and higher_market_state == "weak_trend_bear"
                and not target_path_clear
                and not (failed_breakout_evidence or trendline_break_confirmed or strong_signal_bar)
            ):
                return block("candidate", "头肩底 MTR 所在的上下级结构仍在弱空，先等 failed breakout 证据")

        if playbook_id in {"R1_BROAD_CHANNEL_REVERSAL", CHANNEL_LINE_FADE_PLAYBOOK}:
            if (
                not target_path_clear
                and blocking_magnet_structural
                and blocking_magnet_distance_r < 0.8
                and not (failed_breakout_evidence or trendline_break_confirmed or strong_signal_bar)
            ):
                return block("candidate", "宽通道反转前方磁体过近，先等 failed breakout 或更清晰路径")
            classic_broad_channel_reversal = (
                signal_type in {"双重顶", "双重底", "头肩顶MTR", "头肩底MTR", "楔形顶", "楔形底"}
                and tradeable_zone
                and (strong_signal_bar or bool(trapped_side) or signal_bar_quality >= 0.54)
                and (
                    signal_type not in {"楔形顶", "楔形底", "头肩顶MTR", "头肩底MTR"}
                    or stairs_pattern
                    or exhaustion_detected
                    or failed_breakout_evidence
                    or trendline_break_confirmed
                    or bool(trapped_side)
                    or (reclaimed_prior_close and tradeable_zone and good_signal_bar)
                    or (acceptance_ready and executable_signal_ready and good_signal_bar)
                )
            )
            if (
                prior_leg_context in {"tr_second_leg", "tr_leg"}
                and not failed_breakout_evidence
                and not trendline_break_confirmed
                and not classic_broad_channel_reversal
                and not (strong_signal_bar and tradeable_zone)
                and not (stairs_pattern and tradeable_zone and good_signal_bar)
            ):
                return block("candidate", "宽通道反转更像 second-leg trap，先等失败突破或趋势线破坏")

        if signal_type in {"高2", "低2"} and entry_type == "STOP":
            if endless_pullback_context and not endless_pullback_ready:
                return block("candidate", "endless PB 里的 H2/L2 先等 BO+FT 或更强接受")
            range_or_weak_context = (
                market_state in {"tight_range", "broad_range", "weak_trend_bull", "weak_trend_bear"}
                or higher_market_state in {"tight_range", "broad_range", "weak_trend_bull", "weak_trend_bear"}
            )
            h2_l2_brooks_second_entry_ready = (
                (tradeable_zone and strong_signal_bar)
                or (tradeable_zone and reclaimed_prior_close and good_signal_bar)
                or (stairs_pattern and tradeable_zone and good_signal_bar)
                or (exhaustion_detected and tradeable_zone and strong_signal_bar)
                or (acceptance_ready and executable_signal_ready and reclaimed_prior_close and good_signal_bar)
            )
            if (
                range_or_weak_context
                and prior_leg_context not in {"trend_leg", "mixed"}
                and not failed_breakout_evidence
                and not trendline_break_confirmed
                and not follow_through
                and not second_signal_exception
                and not (tradeable_zone and good_signal_bar)
                and not (acceptance_ready and executable_signal_ready and good_signal_bar)
            ):
                return block("candidate", "区间/弱趋势里的 H2/L2 仍缺少失败突破或趋势线破坏证据")
            if (
                prior_leg_context == "tr_second_leg"
                and not failed_breakout_evidence
                and not trendline_break_confirmed
                and not second_signal_exception
                and not h2_l2_brooks_second_entry_ready
            ):
                return block("candidate", "H2/L2 前一腿更像 TR 里的 second-leg trap，且缺少失败突破证据")
            if not target_path_clear and not (
                failed_breakout_evidence
                or second_signal_exception
                or (not blocking_magnet_structural and tradeable_zone and signal_bar_quality >= 0.56)
                or (tradeable_zone and strong_signal_bar and blocking_magnet_distance_r >= 0.8)
            ):
                return block("candidate", "H2/L2 前方近端磁体和 trapped side 太近，先等二次确认")

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
            "iii突破",
            "HOY突破",
            "LOY突破",
        }
        if (
            signal_type in {"高1", "低1", "高2", "低2", "20均线缺口", "第一均线缺口", "突破回调"}
            and endless_pullback_context
            and not endless_pullback_ready
        ):
            return block("candidate", "endless PB 里的趋势恢复单先等 BO+FT 或收回前收盘")
        if signal_type in trend_breakout_setups and not target_path_clear:
            if blocking_magnet_structural and (magnet_cluster_count >= 1 or magnet_cluster_strength >= 3.0):
                return block("candidate", f"目标路径在结构磁体受阻 ({blocking_magnet_kind or 'cluster'})")
            if magnet_cluster_count >= 3 or magnet_cluster_strength >= 5.5:
                return block("candidate", f"目标路径在磁体簇受阻 ({blocking_magnet_kind or 'cluster'})")
            return block("candidate", "目标路径在近端关键位受阻")

        event.extra = extra
        return True, ""

    def _apply_management_template(self, event, management_profile: str) -> bool:
        """按回测管理模板修正 SL / TP。"""
        risk = abs(event.price - event.stop_loss)
        if risk <= 0 or event.price <= 0:
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
            playbook_id=str(extra.get("playbook_id", "") or ""),
            setup_valid=bool(extra.get("setup_valid", True)),
            setup_clear_trend_leg=bool(extra.get("setup_clear_trend_leg", True)),
            setup_first_pullback_shape=bool(extra.get("setup_first_pullback_shape", True)),
            setup_pullback_depth_ratio=float(extra.get("setup_pullback_depth_ratio", 0.0) or 0.0),
            setup_pullback_overlap_ratio=float(extra.get("setup_pullback_overlap_ratio", 0.0) or 0.0),
        )
        style = normalize_management_style(style)
        extra = dict(getattr(event, "extra", {}) or {})
        extra["management_style"] = style
        extra["management_profile"] = management_profile
        event.extra = extra

        if style == "brooks_scalp":
            stop_mult, target_mult = 1.0, 1.4
        elif style == "brooks_mtr_reversal":
            # Brooks 里双顶双底、楔形、头肩 MTR 本质上都是反转试探家族。
            # 默认先按“probe -> 兑现部分利润 -> 再看是否升级 swing”处理。
            stop_mult, target_mult = 1.0, 3.2
        elif style == "brooks_t4_wedge_pullback":
            # T4 是趋势中的三推回调，允许比普通 reversal 多留一些 swing 空间。
            stop_mult, target_mult = 1.0, 4.6
        elif style == "brooks_r3_channel_line_fade":
            # R3 默认按 70% swing reversal 管，不再压成普通楔形反转。
            stop_mult, target_mult = 1.0, 4.2
        elif style == "brooks_tr4_daily_tr_fade":
            # TR4 仍在 TR 家族内，先保守拿到区间中部。
            stop_mult, target_mult = 1.0, 2.1
        elif style == "brooks_s1_htf_sr_reversal":
            stop_mult, target_mult = 1.0, 5.2
        elif style == "brooks_s2_micro_channel":
            stop_mult, target_mult = 1.0, 4.8
        elif style == "brooks_climax_reversal":
            # 高潮/陷阱反转族的第一腿多数先按保守 reversal 处理。
            stop_mult, target_mult = 1.0, 2.4
        elif style == "brooks_swing":
            stop_mult, target_mult = 1.0, 6.0
        elif style == "brooks_breakout":
            # 原课里 late BO 常常是末端，不接受宽风险追单。
            stop_mult, target_mult = 1.0, 4.0
        elif style == "brooks_tr_blshs":
            # 5m TR = limit + scalp，不把目标挂到区间外。
            stop_mult, target_mult = 1.0, 1.25
        else:
            # 默认也保留结构止损，不再把止损压回结构内。
            stop_mult, target_mult = 1.0, 2.5

        if event.direction == "BUY":
            event.stop_loss = event.price - risk * stop_mult
            event.take_profit = event.price + risk * target_mult
        else:
            event.stop_loss = event.price + risk * stop_mult
            event.take_profit = event.price - risk * target_mult

        recommended_target = float(extra.get("recommended_target", 0.0) or 0.0)
        if recommended_target > 0:
            if event.direction == "BUY" and recommended_target > event.price:
                if style in {
                    "brooks_tr_blshs",
                    "brooks_scalp",
                    "brooks_mtr_reversal",
                    "brooks_climax_reversal",
                    "brooks_tr4_daily_tr_fade",
                    "brooks_r3_channel_line_fade",
                }:
                    event.take_profit = min(event.take_profit, recommended_target)
                elif recommended_target < event.take_profit:
                    event.take_profit = recommended_target
            elif event.direction == "SELL" and recommended_target < event.price:
                if style in {
                    "brooks_tr_blshs",
                    "brooks_scalp",
                    "brooks_mtr_reversal",
                    "brooks_climax_reversal",
                    "brooks_tr4_daily_tr_fade",
                    "brooks_r3_channel_line_fade",
                }:
                    event.take_profit = max(event.take_profit, recommended_target)
                elif recommended_target > event.take_profit:
                    event.take_profit = recommended_target

        return True

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

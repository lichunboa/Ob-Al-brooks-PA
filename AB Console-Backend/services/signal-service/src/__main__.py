"""
Signal Service 入口

用法:
    python -m src --sqlite          # 启动 SQLite 引擎
    python -m src --pg              # 启动 PG 引擎（60秒轮询）
    python -m src --realtime        # 启动实时引擎（毫秒级，推荐）
    python -m src --pa              # 启动 PA 引擎（Al Brooks 方法）
    python -m src --wyckoff         # 启动威科夫引擎（五阶段检测）
    python -m src --all             # 启动所有引擎
    python -m src --once            # 单次检查
    python -m src --stats           # 显示统计
"""

import argparse
import logging
import sys
import threading
import time
from pathlib import Path

# 确保 src 在路径中
SRC_DIR = Path(__file__).parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 全局运行标志
_running = True


def main():
    parser = argparse.ArgumentParser(description="Signal Service - 独立信号检测服务")
    parser.add_argument("--sqlite", action="store_true", help="启动 SQLite 引擎")
    parser.add_argument("--pg", action="store_true", help="启动 PG 引擎（60秒轮询）")
    parser.add_argument("--realtime", action="store_true", help="启动实时引擎（毫秒级）")
    parser.add_argument("--pa", action="store_true", help="启动纯价格行为引擎（Al Brooks 方法）")
    parser.add_argument("--wyckoff", action="store_true", help="启动威科夫引擎（五阶段检测）")
    parser.add_argument("--all", action="store_true", help="启动所有引擎")
    parser.add_argument("--once", action="store_true", help="单次检查")
    parser.add_argument("--interval", type=int, default=60, help="检查间隔（秒）")
    parser.add_argument("--stats", action="store_true", help="显示统计")
    parser.add_argument("--test", action="store_true", help="测试配置")
    parser.add_argument("--health-port", type=int, default=8086, help="健康检查端口(8083/8084被Docker占用)")
    args = parser.parse_args()

    if args.test:
        from config import get_database_url, get_history_db_path, get_sqlite_path
        from rules import RULE_COUNT, TABLE_COUNT

        logger.info("=== Signal Service 配置测试 ===")
        logger.info(f"  SQLite 路径: {get_sqlite_path()}")
        logger.info(f"  PG URL: {get_database_url()[:50]}...")
        logger.info(f"  历史 DB: {get_history_db_path()}")
        logger.info(f"  规则数: {RULE_COUNT}")
        logger.info(f"  表数: {TABLE_COUNT}")
        logger.info("✅ 配置测试通过")
        return

    if args.stats:
        from engines import get_pg_engine, get_sqlite_engine

        logger.info("=== 引擎统计 ===")
        try:
            sqlite_engine = get_sqlite_engine()
            logger.info(f"SQLite: {sqlite_engine.get_stats()}")
        except Exception as e:
            logger.warning(f"SQLite 引擎不可用: {e}")

        try:
            pg_engine = get_pg_engine()
            logger.info(f"PG: {pg_engine.get_stats()}")
        except Exception as e:
            logger.warning(f"PG 引擎不可用: {e}")
        return

    if args.once:
        # 单次检查
        if args.sqlite or args.all:
            from engines import get_sqlite_engine

            engine = get_sqlite_engine()
            signals = engine.check_signals()
            logger.info(f"SQLite 检测到 {len(signals)} 个信号")

        if args.pg or args.all:
            from engines import get_pg_engine

            engine = get_pg_engine()
            signals = engine.check_signals()
            logger.info(f"PG 检测到 {len(signals)} 个信号")

        if args.wyckoff or args.all:
            from engines.wyckoff_detector import get_wyckoff_engine

            engine = get_wyckoff_engine()
            signals = engine.check_signals()
            logger.info(f"Wyckoff 检测到 {len(signals)} 个信号")
        return

    # 持续运行模式
    engines = []
    threads = []

    # 注册持久化：把事件写入历史表
    try:
        from storage.history import get_history
        from events import SignalPublisher

        history = get_history()
        SignalPublisher.register_persist(lambda ev: history.save(ev, source=ev.source))
        logger.info("已注册历史持久化回调")
    except Exception as e:
        logger.warning(f"历史持久化注册失败: {e}")

    # 注册 OpenClaw 信号文件写入回调
    try:
        import json
        from datetime import datetime, timezone
        from events import SignalPublisher

        OPENCLAW_SIGNAL_FILE = "/tmp/openclaw_signals.jsonl"

        def write_openclaw_signal(ev):
            """写入信号到 OpenClaw 信号文件"""
            signal_data = {
                "symbol": ev.symbol,
                "direction": ev.direction,
                "strength": ev.strength,
                "timeframe": ev.timeframe,
                "price": ev.price,
                "signal_type": ev.signal_type,
                "timestamp": int(datetime.now(timezone.utc).timestamp()),
                "received_at": datetime.now(timezone.utc).isoformat(),
            }
            with open(OPENCLAW_SIGNAL_FILE, "a") as f:
                f.write(json.dumps(signal_data) + "\n")
            logger.info(f"[OpenClaw] 信号已写入: {ev.symbol} {ev.direction}")

        SignalPublisher.subscribe(write_openclaw_signal)
        logger.info(f"已注册 OpenClaw 信号文件回调: {OPENCLAW_SIGNAL_FILE}")
    except Exception as e:
        logger.warning(f"OpenClaw 信号文件回调注册失败: {e}")

    # 注册 OpenClaw HTTP Webhook 回调
    try:
        import json
        import os
        import urllib.request
        from datetime import datetime, timezone
        from events import SignalPublisher

        # 本地运行用 localhost，Docker 内用 host.docker.internal
        _default_host = "localhost"
        if os.path.exists("/.dockerenv"):
            _default_host = "host.docker.internal"
        OPENCLAW_WEBHOOK_URL = os.environ.get(
            "OPENCLAW_WEBHOOK_URL",
            f"http://{_default_host}:18789/hooks/al-brooks-signal"
        )
        OPENCLAW_WEBHOOK_TOKEN = os.environ.get(
            "OPENCLAW_WEBHOOK_TOKEN",
            "hooks-5fed4a9a7de03c21c542049f68669b0983b8119a471ae74a7909f2fb17ace267"
        )

        # ── V5.0 信号路由: PA 聚焦模式 ──
        # PA_ONLY_MODE: 只有 PA 相关信号到 al-brooks，其他全丢弃
        # 恢复多 Agent 时改为 False
        PA_ONLY_MODE = True

        # PA 相关的信号类别（Al Brooks 价格行为哲学）
        PA_CATEGORIES = {'pattern'}  # K线形态、SMC、斐波那契、支撑阻力

        # 以下保留用于未来恢复多 Agent 路由
        WYCKOFF_PG_TYPES = {
            'volume_spike', 'price_surge', 'price_dump',
            'oi_surge', 'oi_dump',
            'top_trader_extreme_long', 'top_trader_extreme_short',
            'taker_buy_dominance', 'taker_sell_dominance',
            'taker_ratio_flip_long', 'taker_ratio_flip_short',
        }
        QUANT_CATEGORIES = {'momentum', 'trend', 'volatility'}
        WYCKOFF_CATEGORIES = {'volume', 'futures', 'misc'}
        PATTERN_CATEGORIES = {'pattern'}
        SHARED_CATEGORIES = {'core'}

        def determine_route_targets(ev):
            """V5.0 PA 聚焦路由

            PA_ONLY_MODE=True 时:
            - PA Engine 信号 → al-brooks
            - pattern 类规则 → al-brooks
            - 其他全部丢弃（不符合 Al Brooks 哲学）

            PA_ONLY_MODE=False 时恢复原始多 Agent 路由。
            """
            source = getattr(ev, 'source', 'unknown')
            entry_trigger = getattr(ev, 'entry_trigger', 0.0) or 0.0
            category = getattr(ev, 'category', '')
            signal_type = getattr(ev, 'signal_type', '')

            # 0. route_to 字段优先
            route_to = getattr(ev, 'route_to', '')
            if route_to:
                targets = [route_to] if isinstance(route_to, str) else list(route_to)
                if PA_ONLY_MODE:
                    return [t for t in targets if t == 'al-brooks'] or []
                return targets

            # ── PA 聚焦模式 ──
            if PA_ONLY_MODE:
                # PA Engine → al-brooks
                if source in ('pa_engine', 'pa') or entry_trigger > 0:
                    return ['al-brooks']
                # pattern 类 SQLite 规则 → al-brooks
                if source == 'sqlite' and category in PA_CATEGORIES:
                    return ['al-brooks']
                # 其他全部丢弃
                return []

            # ── 多 Agent 路由（PA_ONLY_MODE=False 时启用）──
            if source in ('pa_engine', 'pa') or entry_trigger > 0:
                return ['al-brooks']
            if source == 'wyckoff':
                return ['wyckoff']
            if source == 'pg' or signal_type in WYCKOFF_PG_TYPES:
                return ['wyckoff']
            if source == 'sqlite':
                if category in QUANT_CATEGORIES:
                    return ['trader']
                elif category in WYCKOFF_CATEGORIES:
                    return ['wyckoff']
                elif category in PATTERN_CATEGORIES:
                    return ['al-brooks']
                elif category in SHARED_CATEGORIES:
                    return ['trader', 'wyckoff']
                else:
                    return ['trader']
            return []

        def send_to_target(signal_data, target):
            """发送信号到指定目标"""
            signal_data_copy = signal_data.copy()
            signal_data_copy["route_to"] = target

            # 根据 target 选择不同的 webhook endpoint
            webhook_paths = {
                'al-brooks': 'al-brooks-signal',
                'trader': 'trader-signal',
                'wyckoff': 'wyckoff-signal',
            }
            webhook_path = webhook_paths.get(target, 'al-brooks-signal')
            webhook_url = OPENCLAW_WEBHOOK_URL.replace('al-brooks-signal', webhook_path)

            try:
                data = json.dumps(signal_data_copy).encode("utf-8")
                req = urllib.request.Request(
                    webhook_url,
                    data=data,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {OPENCLAW_WEBHOOK_TOKEN}",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    body = resp.read().decode("utf-8")
                    if body.strip():
                        result = json.loads(body)
                        logger.info(f"[OpenClaw] {signal_data['symbol']} → {target}: {result.get('status', 'ok')}")
                    else:
                        logger.info(f"[OpenClaw] {signal_data['symbol']} → {target}: 已发送 (HTTP {resp.status})")
                    return True
            except Exception as e:
                logger.error(f"[OpenClaw] {signal_data['symbol']} → {target} 失败: {e}")
                return False

        # AI 进化反馈配置路径
        EVOLUTION_FEEDBACK_FILE = "/Users/mitchellcb/.openclaw/workspaces/trading-shared/stats/evolution_feedback.json"

        def load_evolution_feedback():
            """加载 AI 进化反馈配置"""
            try:
                if os.path.exists(EVOLUTION_FEEDBACK_FILE):
                    with open(EVOLUTION_FEEDBACK_FILE, 'r') as f:
                        return json.load(f)
            except Exception as e:
                logger.warning(f"[Evolution] 加载反馈配置失败: {e}")
            return None

        def should_filter_signal(ev, feedback):
            """根据 AI 进化反馈决定是否过滤信号"""
            if not feedback:
                # 无反馈配置，使用默认规则
                return ev.strength < 70, "默认强度过滤"

            # 1. 全局强度过滤
            global_min = feedback.get("global_filters", {}).get("min_strength", 70)

            # 2. 周期特定强度
            timeframe = getattr(ev, 'timeframe', '5m')
            if timeframe == '1m':
                global_min = feedback.get("global_filters", {}).get("min_strength_1m", 85)
            elif timeframe == '5m':
                global_min = feedback.get("global_filters", {}).get("min_strength_5m", 75)
            elif timeframe == '15m':
                global_min = feedback.get("global_filters", {}).get("min_strength_15m", 70)

            if ev.strength < global_min:
                return True, f"强度 {ev.strength} < {global_min} ({timeframe})"

            # 3. 品种特定过滤
            symbol_config = feedback.get("symbol_filters", {}).get(ev.symbol, {})
            if symbol_config:
                if not symbol_config.get("enabled", True):
                    return True, f"品种 {ev.symbol} 已禁用"
                symbol_min = symbol_config.get("min_strength", global_min)
                if ev.strength < symbol_min:
                    return True, f"品种 {ev.symbol} 强度 {ev.strength} < {symbol_min}"

            # 4. 冷却规则检查
            cooldown = feedback.get("cooldown_rules", {})
            if ev.symbol in cooldown.get("cooldown_symbols", []):
                return True, f"品种 {ev.symbol} 在冷却中"

            return False, None

        def send_openclaw_webhook(ev):
            """发送信号到 OpenClaw HTTP Webhook（多机器人路由）"""
            # 加载 AI 进化反馈配置
            feedback = load_evolution_feedback()

            # 智能过滤（基于 AI 进化反馈）
            should_filter, reason = should_filter_signal(ev, feedback)
            if should_filter:
                logger.debug(f"[OpenClaw] 过滤信号: {ev.symbol} - {reason}")
                return

            # 基础字段
            signal_data = {
                "symbol": ev.symbol,
                "direction": ev.direction,
                "strength": ev.strength,
                "timeframe": ev.timeframe,
                "price": ev.price,
                "signal_type": ev.signal_type,
                "strategy": ev.signal_type,  # V3.7: signal-router 读 strategy 字段
                "timestamp": int(datetime.now(timezone.utc).timestamp()),
                "source": getattr(ev, 'source', 'unknown'),
                "category": getattr(ev, 'category', ''),
            }

            # V5.0: 市场状态 + 路由字段
            if hasattr(ev, 'market_state') and ev.market_state:
                signal_data["market_state"] = ev.market_state
            if hasattr(ev, 'strategy_recommendation') and ev.strategy_recommendation:
                signal_data["strategy_recommendation"] = ev.strategy_recommendation

            # PA 信号增强字段（如果存在）
            if hasattr(ev, 'stop_loss') and ev.stop_loss:
                signal_data["stop_loss"] = ev.stop_loss
            if hasattr(ev, 'take_profit') and ev.take_profit:
                signal_data["take_profit"] = ev.take_profit
            if hasattr(ev, 'entry_trigger') and ev.entry_trigger:
                signal_data["entry_trigger"] = ev.entry_trigger
            if hasattr(ev, 'entry_type') and ev.entry_type:
                signal_data["entry_type"] = ev.entry_type
            if hasattr(ev, 'signal_bar_high') and ev.signal_bar_high:
                signal_data["signal_bar_high"] = ev.signal_bar_high
                signal_data["signal_bar_low"] = ev.signal_bar_low
            if hasattr(ev, 'probability') and ev.probability:
                signal_data["probability"] = ev.probability
            if hasattr(ev, 'cycle') and ev.cycle:
                signal_data["cycle"] = ev.cycle
            if hasattr(ev, 'confirmation_needed'):
                signal_data["confirmation_needed"] = ev.confirmation_needed
            if hasattr(ev, 'extra') and ev.extra:
                signal_data["extra"] = ev.extra

            # 决定路由目标并发送
            targets = determine_route_targets(ev)
            logger.info(f"[OpenClaw] {ev.symbol} {ev.direction} 强度={ev.strength} → {targets}")

            for target in targets:
                send_to_target(signal_data, target)

        SignalPublisher.subscribe(send_openclaw_webhook)
        logger.info(f"已注册 OpenClaw HTTP Webhook 回调: {OPENCLAW_WEBHOOK_URL}")
    except Exception as e:
        logger.warning(f"OpenClaw HTTP Webhook 回调注册失败: {e}")

    if args.sqlite or args.all:
        from engines import get_sqlite_engine

        def run_sqlite():
            engine = get_sqlite_engine()
            engines.append(("SQLite", engine))
            while True:
                try:
                    engine.run_loop(interval=args.interval)
                except Exception as e:
                    logger.error(f"SQLite engine crashed: {e}")
                    time.sleep(5)  # 等待后重试

        t = threading.Thread(target=run_sqlite, daemon=False, name="SQLiteEngine")
        t.start()
        threads.append(t)
        logger.info("SQLite 引擎已启动")

    if args.pg or args.all:
        from engines import get_pg_engine

        pg_interval = 300  # V3.8.2: 60s→300s 减少信号生成频率

        def run_pg():
            engine = get_pg_engine()
            engines.append(("PG", engine))
            while True:
                try:
                    engine.run_loop(interval=pg_interval)
                except Exception as e:
                    logger.error(f"PG engine crashed: {e}")
                    time.sleep(5)  # 等待后重试

        t = threading.Thread(target=run_pg, daemon=False, name="PGEngine")
        t.start()
        threads.append(t)
        logger.info("PG 引擎已启动（%d秒轮询模式）", pg_interval)

    # 实时引擎（毫秒级，推荐）
    realtime_engine = None
    if args.realtime or args.all:
        from engines import get_pg_engine
        from engines.realtime_engine import create_realtime_signal_checker

        pg_engine = get_pg_engine()
        realtime_engine = create_realtime_signal_checker(pg_engine)
        realtime_engine.start()
        engines.append(("Realtime", realtime_engine))
        logger.info("实时引擎已启动（毫秒级 LISTEN/NOTIFY 模式）")

    # 纯价格行为引擎（Al Brooks 方法）
    pa_engine = None
    if args.pa or args.all:
        from engines.pa_engine import get_pa_engine

        def run_pa():
            pa = get_pa_engine()
            pa._running = True  # 设置运行状态，用于健康检查
            engines.append(("PA", pa))
            logger.info("纯价格行为引擎已启动（Al Brooks 方法）")
            while _running:
                try:
                    signals = pa.check_signals()
                    if signals:
                        logger.info(f"PA 引擎检测到 {len(signals)} 个信号")
                    time.sleep(60)  # 每 60 秒检测一次
                except Exception as e:
                    logger.error(f"PA engine error: {e}")
                    time.sleep(60)
            pa._running = False  # 退出时重置状态

        t = threading.Thread(target=run_pa, daemon=False, name="PAEngine")
        t.start()
        threads.append(t)
        pa_engine = True

    # 威科夫引擎（五阶段检测，V5.0）
    if args.wyckoff or args.all:
        from engines.wyckoff_detector import get_wyckoff_engine

        wyckoff_interval = 300  # 5 分钟间隔，威科夫分析不需要高频

        def run_wyckoff():
            wk = get_wyckoff_engine()
            wk._running = True
            engines.append(("Wyckoff", wk))
            logger.info("威科夫引擎已启动（%d秒轮询模式）", wyckoff_interval)
            while _running:
                try:
                    signals = wk.check_signals()
                    if signals:
                        logger.info(f"Wyckoff 引擎检测到 {len(signals)} 个信号")
                    time.sleep(wyckoff_interval)
                except Exception as e:
                    logger.error(f"Wyckoff engine error: {e}")
                    time.sleep(60)
            wk._running = False

        t = threading.Thread(target=run_wyckoff, daemon=False, name="WyckoffEngine")
        t.start()
        threads.append(t)

    if not threads and realtime_engine is None:
        logger.error(
            "请指定要启动的引擎: --sqlite, --pg, --realtime, --pa, --wyckoff, 或 --all"
        )
        sys.exit(1)

    # 启动健康检查服务器
    from health import start_health_server, stop_health_server
    start_health_server(engines, port=args.health_port)

    # 主线程保持运行
    engine_count = len(threads) + (1 if realtime_engine else 0)
    logger.info("Signal Service 正在运行，已启动 %d 个引擎", engine_count)
    logger.info("按 Ctrl+C 停止服务")

    try:
        while True:
            # 检查线程是否还在运行
            alive_threads = [t for t in threads if t.is_alive()]
            realtime_alive = (
                realtime_engine and realtime_engine.get_stats().get("running")
            )

            if len(alive_threads) != len(threads):
                dead_count = len(threads) - len(alive_threads)
                logger.warning("有 %d 个引擎线程已停止", dead_count)

            # 如果所有引擎都停止了，退出
            if len(alive_threads) == 0 and not realtime_alive:
                logger.error("所有引擎都已停止，服务退出")
                break

            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("收到中断信号，正在停止服务...")
        # 给引擎一些时间清理
        for name, engine in engines:
            try:
                if hasattr(engine, 'stop'):
                    engine.stop()
                    logger.info("%s 引擎已停止", name)
            except Exception as e:
                logger.warning("停止 %s 引擎时出错: %s", name, e)

        # 等待线程结束
        for t in threads:
            t.join(timeout=5)

        # 停止健康检查服务器
        stop_health_server()

        logger.info("服务已退出")


if __name__ == "__main__":
    main()

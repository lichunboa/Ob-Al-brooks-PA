"""
Signal Service 入口

用法:
    python -m src --sqlite          # 启动 SQLite 引擎
    python -m src --pg              # 启动 PG 引擎（60秒轮询）
    python -m src --realtime        # 启动实时引擎（毫秒级，推荐）
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
    parser.add_argument("--all", action="store_true", help="启动所有引擎")
    parser.add_argument("--once", action="store_true", help="单次检查")
    parser.add_argument("--interval", type=int, default=60, help="检查间隔（秒）")
    parser.add_argument("--stats", action="store_true", help="显示统计")
    parser.add_argument("--test", action="store_true", help="测试配置")
    parser.add_argument("--health-port", type=int, default=8083, help="健康检查端口")
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

        # 从 Docker 容器访问主机，使用 host.docker.internal
        OPENCLAW_WEBHOOK_URL = os.environ.get(
            "OPENCLAW_WEBHOOK_URL",
            "http://host.docker.internal:18789/hooks/al-brooks-signal"
        )
        OPENCLAW_WEBHOOK_TOKEN = os.environ.get(
            "OPENCLAW_WEBHOOK_TOKEN",
            "hooks-5fed4a9a7de03c21c542049f68669b0983b8119a471ae74a7909f2fb17ace267"
        )

        def determine_route_targets(ev):
            """根据信号特征决定路由目标 - V2.9 多路由版

            路由规则（按优先级）：
            1. PA Engine 信号（source=pa 或 entry_trigger>0）→ al-brooks
            2. 威科夫专属信号 → wyckoff
            3. 威科夫+量化 双路由信号 → [wyckoff, trader]
            4. 其他量化信号（强度>=70）→ trader
            5. 低强度信号 → 不发送
            """
            targets = []
            source = getattr(ev, 'source', 'unknown')
            signal_type = getattr(ev, 'signal_type', '')
            entry_trigger = getattr(ev, 'entry_trigger', 0.0) or 0.0

            # 1. PA Engine 信号 → al-brooks
            if source == 'pa_engine' or source == 'pa' or entry_trigger > 0:
                targets.append('al-brooks')
                return targets

            # 2. 威科夫专属信号（供求/成交量类）
            wyckoff_only = [
                'volume_spike', 'trend_reversal', 'breakout',
            ]
            if signal_type in wyckoff_only:
                targets.append('wyckoff')
                return targets

            # 3. 双路由：威科夫 + 量化（大户持仓/OI 变化）
            wyckoff_and_trader = [
                'oi_surge', 'oi_dump',
                'top_trader_extreme_long', 'top_trader_extreme_short',
            ]
            if signal_type in wyckoff_and_trader:
                targets.append('wyckoff')
                targets.append('trader')
                return targets

            # 4. 量化信号（强度>=70）→ trader
            if ev.strength >= 70:
                targets.append('trader')
                return targets

            # 5. 低强度信号 → 不发送
            return targets

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
                    result = json.loads(resp.read().decode("utf-8"))
                    logger.info(f"[OpenClaw] {signal_data['symbol']} → {target}: {result.get('status', 'ok')}")
                    return True
            except Exception as e:
                logger.error(f"[OpenClaw] {signal_data['symbol']} → {target} 失败: {e}")
                return False

        # AI 进化反馈配置路径
        EVOLUTION_FEEDBACK_FILE = "/Users/mitchellcb/.openclaw/workspace/stats/evolution_feedback.json"

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
                "timestamp": int(datetime.now(timezone.utc).timestamp()),
                "source": getattr(ev, 'source', 'unknown'),
            }

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

        def run_pg():
            engine = get_pg_engine()
            engines.append(("PG", engine))
            while True:
                try:
                    engine.run_loop(interval=args.interval)
                except Exception as e:
                    logger.error(f"PG engine crashed: {e}")
                    time.sleep(5)  # 等待后重试

        t = threading.Thread(target=run_pg, daemon=False, name="PGEngine")
        t.start()
        threads.append(t)
        logger.info("PG 引擎已启动（60秒轮询模式）")

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
                    time.sleep(60)  # 每 60 秒检测一次（从 5 秒改为 60 秒，减少 token 消耗）
                except Exception as e:
                    logger.error(f"PA engine error: {e}")
                    time.sleep(60)
            pa._running = False  # 退出时重置状态

        t = threading.Thread(target=run_pa, daemon=False, name="PAEngine")
        t.start()
        threads.append(t)
        pa_engine = True

    if not threads and realtime_engine is None:
        logger.error(
            "请指定要启动的引擎: --sqlite, --pg, --realtime, 或 --all"
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

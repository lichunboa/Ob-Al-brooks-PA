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

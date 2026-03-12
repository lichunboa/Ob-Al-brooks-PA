"""
Signal Service 入口

用法:
    python -m src                   # 启动默认 Brooks / PA 引擎
    python -m src --engine pa       # 显式指定 Brooks / PA 引擎
    python -m src --engine legacy-pg  # 启动 legacy PG 引擎
    python -m src --once            # 单次检查
    python -m src --stats           # 显示统计
"""

import argparse
import logging
import sys
from pathlib import Path

# 确保 src 在路径中
SRC_DIR = Path(__file__).parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Signal Service - 独立信号检测服务")
    parser.add_argument(
        "--engine",
        choices=["pa", "legacy-pg"],
        default="pa",
        help="选择引擎：pa=Brooks/PA 主链，legacy-pg=旧 PG 规则引擎",
    )
    parser.add_argument("--pg", action="store_true", help="兼容旧参数，等价于 --engine legacy-pg")
    parser.add_argument("--once", action="store_true", help="单次检查")
    parser.add_argument("--interval", type=int, default=60, help="检查间隔（秒）")
    parser.add_argument("--stats", action="store_true", help="显示统计")
    parser.add_argument("--test", action="store_true", help="测试配置")
    args = parser.parse_args()

    engine_name = "legacy-pg" if args.pg else str(args.engine or "pa")

    def _get_engine():
        if engine_name == "legacy-pg":
            from engines import get_pg_engine

            return get_pg_engine()

        from engines import get_default_engine

        return get_default_engine()

    if args.test:
        from config import get_database_url

        logger.info("=== Signal Service 配置测试 ===")
        logger.info(f"  PG URL: {get_database_url()[:50]}...")
        logger.info(f"  默认引擎: {engine_name}")
        if engine_name == "legacy-pg":
            from rules import RULE_COUNT, TABLE_COUNT

            logger.info(f"  规则数: {RULE_COUNT}")
            logger.info(f"  表数: {TABLE_COUNT}")
        else:
            engine = _get_engine()
            logger.info(f"  Brooks symbols: {len(getattr(engine, 'symbols', []))}")
            logger.info(f"  Brooks timeframes: {getattr(engine, 'timeframes', [])}")
        logger.info("✅ 配置测试通过")
        return

    if args.stats:
        logger.info("=== 引擎统计 ===")
        try:
            engine = _get_engine()
            logger.info(f"{engine_name}: {engine.get_stats()}")
        except Exception as e:
            logger.warning(f"{engine_name} 引擎不可用: {e}")
        return

    if args.once:
        engine = _get_engine()
        signals = engine.check_signals()
        logger.info(f"{engine_name} 检测到 {len(signals)} 个信号")
        return

    # 持续运行
    import threading

    # 注册持久化：把事件写入历史表
    try:
        from events import SignalPublisher
        from storage.history import get_history

        history = get_history()
        SignalPublisher.register_persist(lambda ev: history.save(ev, source=ev.source))
        logger.info("已注册历史持久化回调")
    except Exception as e:
        logger.warning(f"历史持久化注册失败: {e}")

    threads = []

    def run_engine():
        engine = _get_engine()
        engine.run_loop(interval=args.interval)

    thread_name = "PAEngine" if engine_name == "pa" else "LegacyPGEngine"
    t = threading.Thread(target=run_engine, daemon=True, name=thread_name)
    t.start()
    threads.append(t)
    logger.info("%s 引擎已启动", engine_name)

    # 等待
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        logger.info("收到中断信号，退出...")


if __name__ == "__main__":
    main()

import os
import statistics
import time

import pytest

from src.core.engine import Engine


def _read_rss_mb():
    try:
        import resource
        import sys
        rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        if sys.platform == "darwin":
            return rss_kb / 1024 / 1024
        return rss_kb / 1024
    except Exception:
        return None


@pytest.mark.skipif(os.getenv("PERF_BENCH") != "1", reason="需要 PERF_BENCH=1 才运行基准测试")
def test_engine_benchmark_smoke():
    """基准冒烟：输出中位耗时与 RSS 快照（需配置数据库与环境）"""
    repeats = int(os.getenv("PERF_REPEAT", "3"))
    symbols = [s for s in os.getenv("PERF_SYMBOLS", "BTCUSDT,ETHUSDT").split(",") if s]
    intervals = [s for s in os.getenv("PERF_INTERVALS", "5m,1h").split(",") if s]
    mode = os.getenv("PERF_MODE", "all")

    durations = []
    rss_samples = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        Engine(symbols=symbols, intervals=intervals).run(mode=mode)
        durations.append(time.perf_counter() - t0)
        rss_samples.append(_read_rss_mb())

    median_s = statistics.median(durations)
    print(f"benchmark_median_s={median_s:.3f} durations={durations} rss_mb={rss_samples}")
    assert median_s > 0

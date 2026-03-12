#!/usr/bin/env python3
"""
历史场景回测入口（兼容旧 `backtest_v4.py` 路径）。

旧版逐 bar 自建回测逻辑已退场，当前统一复用 `BacktestRunner`。
"""

from _runner_entry import run_scenario_main


if __name__ == "__main__":
    run_scenario_main()

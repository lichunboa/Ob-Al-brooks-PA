#!/usr/bin/env python3
"""
单品种回测入口。

当前已统一切到 `libs.backtest.runner.BacktestRunner`。
"""

from _runner_entry import run_single_main


if __name__ == "__main__":
    run_single_main()

#!/usr/bin/env python3
"""
旧 `backtest_tool.py` 兼容入口。

当前直接转发到权威 `libs.backtest.cli`，不再维护旧评分体系和旧回测实现。
"""

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.backtest.cli import main  # noqa: E402


if __name__ == "__main__":
    main()

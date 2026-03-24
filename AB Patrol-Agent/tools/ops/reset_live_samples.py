#!/usr/bin/env python3
"""
有边界地归档并清空实盘样本。

只处理：
- data/pa_trader/journal/*.jsonl
- data/charts/live-review/
- data/charts/backtest/tmp/
- data/run/web_execution_history_reset.json

不会处理：
- broker 真实持仓/挂单
- execution workspace 映射
- 日级 K 线归档
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

DATA_ROOT = ROOT / "data"
PA_TRADER_ROOT = DATA_ROOT / "pa_trader"
RUN_ROOT = DATA_ROOT / "run"
CHART_ROOT = DATA_ROOT / "charts"
RESET_FILE = RUN_ROOT / "web_execution_history_reset.json"


def utc_now_text() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def archive_file(src: Path, dest: Path) -> bool:
    if not src.exists():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    src.parent.mkdir(parents=True, exist_ok=True)
    src.touch()
    return True


def archive_dir(src: Path, dest: Path) -> bool:
    if not src.exists():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        shutil.rmtree(dest)
    shutil.move(str(src), str(dest))
    src.mkdir(parents=True, exist_ok=True)
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="归档并清空实盘样本")
    parser.add_argument("--label", default="manual_reset", help="本次归档标签")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    timestamp = utc_now_text()
    archive_root = RUN_ROOT / "archive" / "live_sample_reset" / f"{timestamp}_{args.label}"
    archive_root.mkdir(parents=True, exist_ok=True)

    actions: list[dict[str, object]] = []

    file_targets = [
        PA_TRADER_ROOT / "journal" / "decision_log.jsonl",
        PA_TRADER_ROOT / "journal" / "execution_log.jsonl",
    ]
    dir_targets = [
        CHART_ROOT / "live-review",
        CHART_ROOT / "backtest" / "tmp",
    ]

    for src in file_targets:
        archived = archive_file(src, archive_root / src.relative_to(DATA_ROOT))
        actions.append({"type": "file", "path": str(src), "archived": archived})

    for src in dir_targets:
        archived = archive_dir(src, archive_root / src.relative_to(DATA_ROOT))
        actions.append({"type": "dir", "path": str(src), "archived": archived})

    reset_payload = {
        "reset_at": datetime.now(timezone.utc).isoformat(),
        "reason": "实盘样本归档清空",
        "archive_root": str(archive_root),
        "label": args.label,
    }
    RESET_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESET_FILE.write_text(json.dumps(reset_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                "ok": True,
                "archive_root": str(archive_root),
                "reset_file": str(RESET_FILE),
                "actions": actions,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

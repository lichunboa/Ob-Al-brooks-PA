#!/usr/bin/env python3
"""Standardized refactor helper for Telegram bot workspace."""

import argparse
import json
import subprocess
import sys
from pathlib import Path

# 直接计算路径：scripts/ai_refactor.py -> telegram-service
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
DOCS_DIR = PROJECT_ROOT / "docs"


def run_compile() -> None:
    subprocess.run([sys.executable, "-m", "compileall", str(SRC_DIR)], check=True)


def analyze() -> None:
    summary = {
        "project_root": str(PROJECT_ROOT),
        "src_modules": sorted(p.name for p in SRC_DIR.iterdir() if p.is_dir()),
        "docs_files": sorted(p.name for p in DOCS_DIR.glob("*.md")) if DOCS_DIR.exists() else [],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def refactor() -> None:
    print("当前结构已标准化，若需再次重构请更新 structure_diff.json")


def validate() -> None:
    run_compile()
    print("✅ compileall 校验通过")


def main() -> None:
    parser = argparse.ArgumentParser(description="AI refactor orchestrator")
    parser.add_argument("--analyze", action="store_true")
    parser.add_argument("--refactor", action="store_true")
    parser.add_argument("--validate", action="store_true")
    args = parser.parse_args()

    if not any((args.analyze, args.refactor, args.validate)):
        parser.error("请至少指定一个操作，如 --analyze")

    if args.analyze:
        analyze()
    if args.refactor:
        refactor()
    if args.validate:
        validate()


if __name__ == "__main__":
    main()

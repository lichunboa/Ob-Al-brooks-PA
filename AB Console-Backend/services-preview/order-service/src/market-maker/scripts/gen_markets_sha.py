#!/usr/bin/env python3
"""
生成/更新 markets.sha256 校验文件。

用法：
    python scripts/gen_markets_sha.py --json config/markets.json --out config/markets.sha256
"""
import argparse
import hashlib
from pathlib import Path


def calc_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", default="config/markets.json", help="markets.json 路径")
    parser.add_argument("--out", default="config/markets.sha256", help="输出 sha256 文件路径")
    args = parser.parse_args()

    json_path = Path(args.json)
    out_path = Path(args.out)

    if not json_path.exists():
        raise SystemExit(f"未找到 {json_path}")

    digest = calc_sha256(json_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(digest + "\n")
    print(f"写入 {out_path}，sha256={digest}")


if __name__ == "__main__":
    main()

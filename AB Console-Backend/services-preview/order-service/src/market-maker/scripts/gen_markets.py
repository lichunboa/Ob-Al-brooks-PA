#!/usr/bin/env python3
"""
拉取 Binance USDM 市场元数据并生成 markets.json + markets.sha256

用法（默认测试网）:
    python scripts/gen_markets.py --out config/markets.json

主网:
    python scripts/gen_markets.py --mainnet --out config/markets.json
"""
import argparse
import json
from pathlib import Path

import ccxt

from gen_markets_sha import calc_sha256


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="config/markets.json", help="输出 markets.json 路径")
    parser.add_argument("--sha", default="config/markets.sha256", help="输出 sha256 路径")
    parser.add_argument("--mainnet", action="store_true", help="使用主网 (默认测试网)")
    args = parser.parse_args()

    exchange = ccxt.binanceusdm({
        "enableRateLimit": True,
        "options": {"defaultType": "future"},
    })
    if not args.mainnet:
        exchange.set_sandbox_mode(True)

    print(f"Loading markets from {'mainnet' if args.mainnet else 'testnet'} ...")
    markets = exchange.load_markets()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(markets, f, indent=2, sort_keys=True)
    print(f"Saved markets -> {out_path}")

    sha = calc_sha256(out_path)
    sha_path = Path(args.sha)
    sha_path.parent.mkdir(parents=True, exist_ok=True)
    sha_path.write_text(sha + "\n")
    print(f"Saved sha256 -> {sha_path} ({sha})")


if __name__ == "__main__":
    main()

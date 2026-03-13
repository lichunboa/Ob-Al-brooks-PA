#!/usr/bin/env python3
"""把原始历史 CSV.gz 流式切成按币种和年份分区的 Parquet。"""

from __future__ import annotations

import argparse
import shutil
from collections import defaultdict
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]
KEEP_COLUMNS = ["symbol", "bucket_ts", "open", "high", "low", "close", "volume", "year"]


def parse_csv_list(raw: str) -> list[str]:
    """解析逗号分隔参数。"""
    return [item.strip() for item in str(raw or "").split(",") if item.strip()]


def resolve_default_source() -> Path:
    """返回默认原始历史文件路径。"""
    return ROOT / "data" / "history" / "hf_downloads" / "candles_1m.csv.gz"


def resolve_default_output() -> Path:
    """返回默认分片目录。"""
    return ROOT / "data" / "history" / "hf_parquet"


def validate_output_dir(output_dir: Path, symbols: list[str], overwrite: bool) -> None:
    """校验输出目录，必要时清理目标分区。"""
    output_dir.mkdir(parents=True, exist_ok=True)
    for symbol in symbols:
        symbol_dir = output_dir / f"symbol={symbol}"
        if not symbol_dir.exists():
            continue
        if overwrite:
            shutil.rmtree(symbol_dir)
            continue
        raise SystemExit(
            f"目标分区已存在: {symbol_dir}。如需重建，请追加 --overwrite。"
        )


def normalize_chunk(
    chunk: pd.DataFrame,
    symbols: set[str],
    start_year: int | None,
    end_year: int | None,
) -> pd.DataFrame:
    """筛选目标币种并标准化列类型。"""
    chunk = chunk[chunk["symbol"].isin(symbols)]
    if chunk.empty:
        return chunk

    chunk = chunk[["symbol", "bucket_ts", "open", "high", "low", "close", "volume"]].copy()
    chunk["bucket_ts"] = pd.to_datetime(chunk["bucket_ts"], utc=True).dt.tz_localize(None)
    chunk["year"] = chunk["bucket_ts"].dt.year.astype("int16")

    if start_year is not None:
        chunk = chunk[chunk["year"] >= start_year]
    if end_year is not None:
        chunk = chunk[chunk["year"] <= end_year]
    if chunk.empty:
        return chunk

    for column in ["open", "high", "low", "close", "volume"]:
        chunk[column] = pd.to_numeric(chunk[column], errors="coerce")

    chunk = chunk.dropna(subset=["bucket_ts", "open", "high", "low", "close", "volume"])
    if chunk.empty:
        return chunk

    return chunk[KEEP_COLUMNS].sort_values(["symbol", "bucket_ts"]).reset_index(drop=True)


def build_partition_path(output_dir: Path, symbol: str, year: int) -> Path:
    """构造分区文件路径。"""
    partition_dir = output_dir / f"symbol={symbol}" / f"year={year}"
    partition_dir.mkdir(parents=True, exist_ok=True)
    return partition_dir / "data.parquet"


def close_writers(writers: dict[tuple[str, int], pq.ParquetWriter]) -> None:
    """关闭所有 ParquetWriter。"""
    for writer in writers.values():
        writer.close()


def shard_history(
    source: Path,
    output_dir: Path,
    symbols: list[str],
    chunksize: int,
    overwrite: bool,
    start_year: int | None,
    end_year: int | None,
) -> dict[str, object]:
    """执行流式分片。"""
    if not source.exists():
        raise SystemExit(f"原始历史文件不存在: {source}")

    validate_output_dir(output_dir, symbols, overwrite)

    writers: dict[tuple[str, int], pq.ParquetWriter] = {}
    row_counts: dict[tuple[str, int], int] = defaultdict(int)
    chunk_count = 0
    total_rows = 0
    symbol_set = set(symbols)

    try:
        for raw_chunk in pd.read_csv(source, compression="gzip", chunksize=chunksize):
            chunk_count += 1
            chunk = normalize_chunk(raw_chunk, symbol_set, start_year, end_year)
            if chunk.empty:
                if chunk_count % 20 == 0:
                    print(f"  已扫描 {chunk_count} 个分块，当前仍无目标数据...", flush=True)
                continue

            for (symbol, year), group in chunk.groupby(["symbol", "year"], sort=True):
                partition_path = build_partition_path(output_dir, str(symbol), int(year))
                table = pa.Table.from_pandas(group[KEEP_COLUMNS], preserve_index=False)
                writer_key = (str(symbol), int(year))
                if writer_key not in writers:
                    writers[writer_key] = pq.ParquetWriter(partition_path, table.schema)
                writers[writer_key].write_table(table)
                row_counts[writer_key] += len(group)
                total_rows += len(group)

            if chunk_count % 10 == 0:
                print(
                    f"  已处理 {chunk_count} 个分块，累计写入 {total_rows:,} 行目标数据...",
                    flush=True,
                )
    finally:
        close_writers(writers)

    summary_rows = [
        {
            "symbol": symbol,
            "year": year,
            "rows": rows,
            "path": str(build_partition_path(output_dir, symbol, year)),
        }
        for (symbol, year), rows in sorted(row_counts.items())
    ]
    return {
        "source": str(source),
        "output_dir": str(output_dir),
        "symbols": symbols,
        "chunks": chunk_count,
        "rows": total_rows,
        "partitions": summary_rows,
    }


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数。"""
    parser = argparse.ArgumentParser(description="把原始历史 CSV.gz 切成按币种/年份分区的 Parquet。")
    parser.add_argument(
        "--source",
        default=str(resolve_default_source()),
        help="原始 CSV.gz 路径",
    )
    parser.add_argument(
        "--output-dir",
        default=str(resolve_default_output()),
        help="输出 Parquet 分区目录",
    )
    parser.add_argument(
        "--symbols",
        default=",".join(DEFAULT_SYMBOLS),
        help="需要保留的币种，逗号分隔",
    )
    parser.add_argument(
        "--chunksize",
        type=int,
        default=500000,
        help="CSV 流式读取分块大小",
    )
    parser.add_argument(
        "--start-year",
        type=int,
        default=None,
        help="只保留不早于该年份的数据",
    )
    parser.add_argument(
        "--end-year",
        type=int,
        default=None,
        help="只保留不晚于该年份的数据",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="若目标分区已存在则先删除再重建",
    )
    return parser


def main() -> None:
    """命令行入口。"""
    args = build_parser().parse_args()
    symbols = parse_csv_list(args.symbols)
    if not symbols:
        raise SystemExit("至少需要一个币种。")

    summary = shard_history(
        source=Path(args.source),
        output_dir=Path(args.output_dir),
        symbols=symbols,
        chunksize=max(10000, int(args.chunksize)),
        overwrite=bool(args.overwrite),
        start_year=args.start_year,
        end_year=args.end_year,
    )

    print("\n分片完成：", flush=True)
    print(f"  源文件: {summary['source']}")
    print(f"  输出目录: {summary['output_dir']}")
    print(f"  分块数: {summary['chunks']}")
    print(f"  写入总行数: {summary['rows']:,}")
    for item in summary["partitions"]:
        print(
            f"  - {item['symbol']} {item['year']}: {item['rows']:,} 行 -> {item['path']}",
            flush=True,
        )


if __name__ == "__main__":
    main()

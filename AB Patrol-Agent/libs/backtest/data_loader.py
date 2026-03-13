"""
数据加载器 — 多数据源历史 K 线数据加载

加载优先级:
  1. 本地 Parquet 缓存（最快）
  2. HF Parquet 分片本地提取（data/history/hf_parquet/）
  3. TimescaleDB 导出（Docker 运行时）
  4. 本地 CSV.gz 流式读取
  5. Binance API 下载（需 VPN）
  6. datasets 库 streaming（最慢但最可靠）
"""

import os
import re
import sys
from pathlib import Path

import pandas as pd


class DataLoader:
    """从 HuggingFace 加载历史 K 线数据"""

    SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]
    HF_DATASET = "123olp/binance-futures-ohlcv-2018-2026"
    CSV_GZ_FILE = "candles_1m.csv.gz"

    @staticmethod
    def _agent_root() -> Path:
        """返回 AB Patrol-Agent 根目录。"""
        return Path(__file__).parent.parent.parent

    @staticmethod
    def _history_root() -> Path:
        """返回统一历史行情目录。"""
        return DataLoader._agent_root() / "data" / "history"

    @staticmethod
    def _hf_parquet_root(parquet_dir: str | None = None) -> Path:
        """返回 HF Parquet 分片根目录。"""
        if parquet_dir:
            return Path(parquet_dir)
        return DataLoader._history_root() / "hf_parquet"

    @staticmethod
    def _normalize_bound_timestamp(raw: str | None) -> pd.Timestamp | None:
        """统一边界时间为无时区 UTC 时间戳。"""
        if not raw:
            return None
        ts = pd.Timestamp(raw)
        if ts.tzinfo is not None:
            ts = ts.tz_convert("UTC").tz_localize(None)
        return ts

    @staticmethod
    def _normalize_timestamp_series(series: pd.Series) -> pd.Series:
        """统一时间列为无时区 UTC 序列。"""
        return pd.to_datetime(series, utc=True).dt.tz_localize(None)

    @staticmethod
    def load(symbol: str, start_date: str = None, end_date: str = None,
             cache_dir: str = None) -> pd.DataFrame:
        """
        加载 1m K 线数据（自动选择最优方式）

        返回 DataFrame，列: timestamp, open, high, low, close, volume
        """
        # 检查 Parquet 缓存
        cache_path = None
        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)
            safe_start = start_date or "all"
            safe_end = end_date or "all"
            cache_path = Path(cache_dir) / f"{symbol}_{safe_start}_{safe_end}.parquet"
            if cache_path.exists():
                print(f"  从缓存加载: {cache_path}")
                df = pd.read_parquet(cache_path)
                # 兼容旧缓存列名 (open_time → timestamp)
                if "open_time" in df.columns and "timestamp" not in df.columns:
                    df = df.rename(columns={"open_time": "timestamp"})
                if df["timestamp"].dt.tz is not None:
                    df["timestamp"] = df["timestamp"].dt.tz_localize(None)
                print(f"  {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")
                return df
            fallback_cache = DataLoader._find_covering_parquet(Path(cache_dir), symbol, start_date, end_date)
            if fallback_cache:
                print(f"  从覆盖缓存加载: {fallback_cache}")
                df = pd.read_parquet(fallback_cache)
                if "open_time" in df.columns and "timestamp" not in df.columns:
                    df = df.rename(columns={"open_time": "timestamp"})
                df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_localize(None)
                start_ts = DataLoader._normalize_bound_timestamp(start_date)
                end_ts = DataLoader._normalize_bound_timestamp(end_date)
                if start_ts is not None:
                    df = df[df["timestamp"] >= start_ts]
                if end_ts is not None:
                    df = df[df["timestamp"] <= end_ts]
                df = df.sort_values("timestamp").reset_index(drop=True)
                print(f"  {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")
                return df

        # 方式1: HF Parquet 分片（本地已下载）
        hf_parquet_dir = DataLoader._history_root() / "hf_parquet"
        if hf_parquet_dir.exists() and any(hf_parquet_dir.rglob("*.parquet")):
            df = DataLoader.load_from_hf_parquet(
                symbol, start_date, end_date, parquet_dir=str(hf_parquet_dir),
            )
            if not df.empty:
                if cache_path:
                    df.to_parquet(cache_path)
                    print(f"  已缓存到: {cache_path}")
                return df

        # 方式2: TimescaleDB 导出（Docker 运行时）
        try:
            df = DataLoader.load_from_timescaledb(symbol, start_date, end_date)
            if not df.empty:
                if cache_path:
                    df.to_parquet(cache_path)
                    print(f"  已缓存到: {cache_path}")
                return df
        except (ImportError, Exception):
            pass

        # 方式3: 本地 CSV.gz 流式加载
        csv_gz_path = DataLoader._find_csv_gz(cache_dir)
        if csv_gz_path:
            print(f"  从本地 CSV.gz 加载: {csv_gz_path}")
            df = DataLoader._stream_csv_gz(csv_gz_path, symbol, start_date, end_date)
            if not df.empty and cache_path:
                df.to_parquet(cache_path)
                print(f"  已缓存到: {cache_path}")
            return df

        # 方式4: Binance API 下载（需 VPN）
        df = DataLoader.download_from_binance(symbol, days=90, cache_dir=cache_dir)
        if not df.empty:
            start_ts = DataLoader._normalize_bound_timestamp(start_date)
            end_ts = DataLoader._normalize_bound_timestamp(end_date)
            if start_ts is not None:
                df = df[df["timestamp"] >= start_ts]
            if end_ts is not None:
                df = df[df["timestamp"] <= end_ts]
            return df

        # 方式5: datasets 库 streaming（最慢）
        return DataLoader._load_streaming(symbol, start_date, end_date, cache_path)

    @staticmethod
    def _find_covering_parquet(
        cache_dir: Path,
        symbol: str,
        start_date: str | None,
        end_date: str | None,
    ) -> Path | None:
        """查找覆盖当前时间窗的已有 Parquet 缓存。"""
        if not cache_dir.exists():
            return None
        pattern = re.compile(rf"^{re.escape(symbol)}_(\d{{4}}-\d{{2}}-\d{{2}})_(\d{{4}}-\d{{2}}-\d{{2}})\.parquet$")
        start_ts = DataLoader._normalize_bound_timestamp(start_date)
        end_ts = DataLoader._normalize_bound_timestamp(end_date)
        candidates: list[tuple[pd.Timestamp, pd.Timestamp, Path]] = []
        for path in cache_dir.glob(f"{symbol}_*.parquet"):
            match = pattern.match(path.name)
            if not match:
                continue
            file_start = pd.Timestamp(match.group(1))
            file_end = pd.Timestamp(match.group(2))
            if start_ts is not None and file_start > start_ts:
                continue
            if end_ts is not None and file_end < end_ts:
                continue
            candidates.append((file_start, file_end, path))
        if not candidates:
            return None
        candidates.sort(key=lambda item: (item[1] - item[0], item[0]))
        return candidates[0][2]

    @staticmethod
    def _find_csv_gz(cache_dir: str = None) -> Path | None:
        """查找已下载的 CSV.gz 文件"""
        search_paths = []
        if cache_dir:
            cache_path = Path(cache_dir)
            search_paths.append(cache_path.parent / "hf_downloads" / DataLoader.CSV_GZ_FILE)
            search_paths.append(cache_path.parent.parent / "hf_downloads" / DataLoader.CSV_GZ_FILE)
        search_paths.extend([
            Path.home() / ".cache" / "backtest" / DataLoader.CSV_GZ_FILE,
            DataLoader._history_root() / "hf_downloads" / DataLoader.CSV_GZ_FILE,
            DataLoader._agent_root() / "data" / "hf_downloads" / DataLoader.CSV_GZ_FILE,
        ])
        for p in search_paths:
            if p.exists():
                return p
        return None

    @staticmethod
    def _select_hf_parquet_shards(
        parquet_dir: str | None,
        symbol: str,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[Path]:
        """按币种与年份选择需要读取的 HF Parquet 分片。"""
        parquet_root = DataLoader._hf_parquet_root(parquet_dir)
        if not parquet_root.exists():
            return []

        symbol_partition = parquet_root / f"symbol={symbol}"
        start_ts = DataLoader._normalize_bound_timestamp(start_date)
        end_ts = DataLoader._normalize_bound_timestamp(end_date)
        start_year = start_ts.year if start_ts is not None else None
        end_year = end_ts.year if end_ts is not None else None

        if symbol_partition.exists():
            selected: list[Path] = []
            for year_dir in sorted(symbol_partition.glob("year=*")):
                try:
                    year_value = int(year_dir.name.split("=", 1)[1])
                except (IndexError, ValueError):
                    continue
                if start_year is not None and year_value < start_year:
                    continue
                if end_year is not None and year_value > end_year:
                    continue
                selected.extend(sorted(year_dir.rglob("*.parquet")))
            return selected

        flat_candidates = sorted(parquet_root.glob("*.parquet"))
        if not flat_candidates:
            return []

        pattern = re.compile(rf"^{re.escape(symbol)}[_-](\d{{4}})")
        selected_flat: list[Path] = []
        for path in flat_candidates:
            match = pattern.match(path.stem)
            if match is None:
                continue
            year_value = int(match.group(1))
            if start_year is not None and year_value < start_year:
                continue
            if end_year is not None and year_value > end_year:
                continue
            selected_flat.append(path)
        return selected_flat or flat_candidates

    @staticmethod
    def _stream_csv_gz(filepath: Path, symbol: str,
                       start_date: str = None, end_date: str = None) -> pd.DataFrame:
        """从 CSV.gz 流式读取并过滤"""
        start_ts = DataLoader._normalize_bound_timestamp(start_date)
        end_ts = DataLoader._normalize_bound_timestamp(end_date)

        chunks = []
        total = 0
        for chunk in pd.read_csv(filepath, compression="gzip", chunksize=200000):
            chunk = chunk[chunk["symbol"] == symbol]
            if chunk.empty:
                continue
            chunk["timestamp"] = DataLoader._normalize_timestamp_series(chunk["bucket_ts"])
            if start_ts is not None:
                chunk = chunk[chunk["timestamp"] >= start_ts]
            if end_ts is not None:
                chunk = chunk[chunk["timestamp"] <= end_ts]
            if not chunk.empty:
                chunks.append(chunk[["timestamp", "open", "high", "low", "close", "volume"]])
                total += len(chunks[-1])
                print(f"  已读取 {total:,} 根 {symbol} K线...", end="\r")

        if not chunks:
            print(f"  警告: {symbol} 无数据")
            return pd.DataFrame()

        df = pd.concat(chunks, ignore_index=True)
        df = df.sort_values("timestamp").reset_index(drop=True)
        print(f"  加载完成: {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")
        return df

    @staticmethod
    def _load_streaming(symbol: str, start_date: str = None, end_date: str = None,
                        cache_path: Path = None) -> pd.DataFrame:
        """使用 datasets 库 streaming 模式"""
        try:
            from datasets import load_dataset
        except ImportError:
            print("请安装: pip install datasets huggingface_hub")
            sys.exit(1)

        print(f"  从 HuggingFace streaming 加载 {symbol} 数据...")

        ds = load_dataset(DataLoader.HF_DATASET, split="train", streaming=True)
        rows = []
        count = 0
        start_ts = DataLoader._normalize_bound_timestamp(start_date)
        end_ts = DataLoader._normalize_bound_timestamp(end_date)
        for row in ds:
            if row.get("symbol") != symbol:
                continue
            ts = row.get("bucket_ts")
            if ts is None:
                continue
            if isinstance(ts, str):
                ts = pd.Timestamp(ts)
            elif isinstance(ts, (int, float)):
                ts = pd.Timestamp(ts, unit="ms")
            if ts.tzinfo is not None:
                ts = ts.tz_convert("UTC").tz_localize(None)

            if start_ts is not None and ts < start_ts:
                continue
            if end_ts is not None and ts > end_ts:
                if count > 0:
                    break
                continue

            rows.append({
                "timestamp": ts,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume", 0)),
            })
            count += 1
            if count % 50000 == 0:
                print(f"  已加载 {count:,} 根K线...", end="\r")

        if not rows:
            print(f"  警告: {symbol} 无数据")
            return pd.DataFrame()

        df = pd.DataFrame(rows)
        df = df.sort_values("timestamp").reset_index(drop=True)
        print(f"  加载完成: {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")

        if cache_path:
            df.to_parquet(cache_path)
            print(f"  已缓存到: {cache_path}")
        return df

    @staticmethod
    def load_from_parquet(filepath: str, symbol: str = None,
                          start_date: str = None, end_date: str = None) -> pd.DataFrame:
        """从本地 Parquet 文件加载"""
        df = pd.read_parquet(filepath)
        if symbol and "symbol" in df.columns:
            df = df[df["symbol"] == symbol]
        if "bucket_ts" in df.columns:
            df = df.rename(columns={"bucket_ts": "timestamp"})
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_localize(None)
        start_ts = DataLoader._normalize_bound_timestamp(start_date)
        end_ts = DataLoader._normalize_bound_timestamp(end_date)
        if start_ts is not None:
            df = df[df["timestamp"] >= start_ts]
        if end_ts is not None:
            df = df[df["timestamp"] <= end_ts]
        df = df.sort_values("timestamp").reset_index(drop=True)
        return df

    @staticmethod
    def download_from_binance(symbol: str, days: int = 90,
                              cache_dir: str = None) -> pd.DataFrame:
        """
        直接从 Binance Futures API 下载 1m K 线数据

        需要网络可访问 fapi.binance.com（可能需要 VPN）
        下载后自动保存为 Parquet 缓存
        """
        import time as _time

        import requests

        interval = "1m"
        limit = 1000
        end_ms = int(_time.time() * 1000)
        start_ms = end_ms - days * 24 * 60 * 60 * 1000

        all_data = []
        current = start_ms
        batch = 0
        session = requests.Session()

        print(f"从 Binance API 获取 {symbol} {days}天 1m K线数据...")

        while current < end_ms:
            url = "https://fapi.binance.com/fapi/v1/klines"
            params = {
                "symbol": symbol, "interval": interval,
                "startTime": current, "endTime": end_ms, "limit": limit,
            }
            try:
                resp = session.get(url, params=params, timeout=15)
                if resp.status_code == 429:
                    _time.sleep(10)
                    continue
                if resp.status_code != 200:
                    break
                data = resp.json()
                if not data:
                    break
                all_data.extend(data)
                batch += 1
                current = data[-1][0] + 1
                if batch % 20 == 0:
                    print(f"  已获取 {len(all_data):,} 根K线 (batch {batch})...")
                _time.sleep(0.05)
            except Exception:
                break

        if not all_data:
            print("  下载失败（网络不通？需要 VPN？）")
            return pd.DataFrame()

        df = pd.DataFrame(all_data, columns=[
            "timestamp", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades", "taker_buy_base",
            "taker_buy_quote", "ignore",
        ])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        for c in ["open", "high", "low", "close", "volume"]:
            df[c] = df[c].astype(float)
        df = df[["timestamp", "open", "high", "low", "close", "volume"]]
        df = df.sort_values("timestamp").drop_duplicates(subset=["timestamp"]).reset_index(drop=True)

        print(f"  总计: {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")

        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)
            s = df["timestamp"].min().strftime("%Y-%m-%d")
            e = df["timestamp"].max().strftime("%Y-%m-%d")
            path = os.path.join(cache_dir, f"{symbol}_{s}_{e}.parquet")
            df.to_parquet(path)
            print(f"  已缓存到: {path}")

        return df

    @staticmethod
    def load_from_timescaledb(symbol: str, start_date: str = None,
                               end_date: str = None, cache_dir: str = None,
                               db_url: str = None) -> pd.DataFrame:
        """
        从本地 TimescaleDB (Docker) 导出 1m K 线数据

        默认连接: postgresql://postgres:postgres@localhost:5434/market_data
        导出后自动保存为 Parquet 缓存
        """
        try:
            import psycopg
        except ImportError:
            print("需要安装: pip install psycopg[binary]")
            return pd.DataFrame()

        if not db_url:
            db_url = "postgresql://postgres:postgres@localhost:5434/market_data"

        print(f"  从 TimescaleDB 导出 {symbol} 数据...")

        where_clauses = ["symbol = %s"]
        params: list = [symbol]
        if start_date:
            where_clauses.append("bucket_ts >= %s")
            params.append(start_date)
        if end_date:
            where_clauses.append("bucket_ts <= %s")
            params.append(end_date)

        query = f"""
            SELECT bucket_ts as timestamp, open, high, low, close, volume
            FROM market_data.candles_1m
            WHERE {' AND '.join(where_clauses)}
            ORDER BY bucket_ts
        """

        try:
            with psycopg.connect(db_url) as conn:
                df = pd.read_sql(query, conn, params=params)
        except Exception as e:
            print(f"  连接失败: {e}")
            return pd.DataFrame()

        if df.empty:
            print(f"  警告: TimescaleDB 中 {symbol} 无数据")
            return pd.DataFrame()

        df["timestamp"] = pd.to_datetime(df["timestamp"])
        for c in ["open", "high", "low", "close", "volume"]:
            df[c] = df[c].astype(float)
        df = df.sort_values("timestamp").reset_index(drop=True)

        print(f"  导出完成: {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")

        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)
            s = df["timestamp"].min().strftime("%Y-%m-%d")
            e = df["timestamp"].max().strftime("%Y-%m-%d")
            path = os.path.join(cache_dir, f"{symbol}_{s}_{e}.parquet")
            df.to_parquet(path)
            print(f"  已缓存到: {path}")

        return df

    @staticmethod
    def load_from_hf_parquet(symbol: str, start_date: str = None,
                              end_date: str = None,
                              cache_dir: str = None,
                              parquet_dir: str = None) -> pd.DataFrame:
        """
        从下载好的 HuggingFace Parquet 分片中提取指定币种数据

        parquet_dir: 存放 `symbol=.../year=.../data.parquet` 分区目录
        """
        import pyarrow as pa
        import pyarrow.parquet as pq

        parquet_root = DataLoader._hf_parquet_root(parquet_dir)
        shards = DataLoader._select_hf_parquet_shards(
            str(parquet_root),
            symbol,
            start_date=start_date,
            end_date=end_date,
        )
        if not shards:
            print(f"  未找到 Parquet 分片: {parquet_root}")
            return pd.DataFrame()

        print(f"  从 {len(shards)} 个 Parquet 分片提取 {symbol}...")
        tables = []
        for i, shard in enumerate(shards):
            try:
                parquet_file = pq.ParquetFile(str(shard))
                table = parquet_file.read(
                    columns=["bucket_ts", "open", "high", "low", "close", "volume"],
                )
                if len(table) > 0:
                    tables.append(table)
                    print(f"    分片 {i}: {len(table):,} 行 ({shard.name})", end="\r")
            except Exception as e:
                print(f"    分片 {i}: 错误 {e}")

        if not tables:
            print(f"  警告: {symbol} 在所有分片中无数据")
            return pd.DataFrame()

        combined = pa.concat_tables(tables)
        df = combined.to_pandas()
        df = df.rename(columns={"bucket_ts": "timestamp"})
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        for c in ["open", "high", "low", "close", "volume"]:
            df[c] = df[c].astype(float)

        if start_date:
            ts_start = DataLoader._normalize_bound_timestamp(start_date)
            df = df[df["timestamp"] >= ts_start]
        if end_date:
            ts_end = DataLoader._normalize_bound_timestamp(end_date)
            df = df[df["timestamp"] <= ts_end]

        df = df.sort_values("timestamp").drop_duplicates(subset=["timestamp"]).reset_index(drop=True)
        print(f"  提取完成: {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")

        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)
            s = df["timestamp"].min().strftime("%Y-%m-%d")
            e = df["timestamp"].max().strftime("%Y-%m-%d")
            path = os.path.join(cache_dir, f"{symbol}_{s}_{e}.parquet")
            df.to_parquet(path)
            print(f"  已缓存到: {path}")

        return df

    @staticmethod
    def resample(df_1m: pd.DataFrame, timeframe: str) -> pd.DataFrame:
        """从 1m 聚合到更高时间框架"""
        tf_map = {"5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1D"}
        rule = tf_map.get(timeframe)
        if not rule:
            raise ValueError(f"不支持的时间框架: {timeframe}")

        df = df_1m.set_index("timestamp")
        resampled = df.resample(rule).agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }).dropna()
        resampled = resampled.reset_index()
        return resampled

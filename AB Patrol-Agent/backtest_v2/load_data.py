"""
数据加载脚本 - 从 TimescaleDB 加载历史K线

保存为 parquet 格式供回测使用
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
import pandas as pd
from datetime import datetime, timedelta


def load_from_timescaledb(
    symbol: str,
    timeframe: str,
    start_date: str,
    end_date: str,
    host: str = "localhost",
    port: int = 5434,
    database: str = "trading",
    user: str = "postgres",
    password: str = "postgres"
) -> pd.DataFrame:
    """
    从 TimescaleDB 加载K线数据

    Args:
        symbol: 交易对，如 "BTCUSDT"
        timeframe: 时间周期，如 "5m", "15m", "1h"
        start_date: 开始日期，如 "2025-12-11"
        end_date: 结束日期，如 "2026-03-11"

    Returns:
        DataFrame with columns: timestamp, open, high, low, close, volume
    """
    print(f"连接 TimescaleDB: {host}:{port}/{database}")

    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password
        )

        # 构建查询
        # 假设表名为 klines_{timeframe}
        table_name = f"klines_{timeframe}"

        query = f"""
        SELECT
            time as timestamp,
            open,
            high,
            low,
            close,
            volume
        FROM {table_name}
        WHERE symbol = %s
          AND time >= %s
          AND time <= %s
        ORDER BY time ASC
        """

        print(f"查询表: {table_name}")
        print(f"时间范围: {start_date} ~ {end_date}")

        df = pd.read_sql_query(
            query,
            conn,
            params=(symbol, start_date, end_date)
        )

        conn.close()

        print(f"✅ 加载了 {len(df)} 根K线")
        return df

    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        print("\n请检查:")
        print("  1. TimescaleDB 是否运行")
        print("  2. 连接参数是否正确")
        print("  3. 表是否存在")
        return pd.DataFrame()


def save_to_parquet(df: pd.DataFrame, symbol: str, start_date: str, end_date: str):
    """保存为 parquet 格式"""
    if df.empty:
        print("❌ 数据为空，无法保存")
        return

    cache_dir = Path(__file__).parent.parent / "data" / "backtest_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{symbol}_{start_date}_{end_date}.parquet"
    filepath = cache_dir / filename

    df.to_parquet(filepath, index=False)
    print(f"✅ 保存到: {filepath}")


def main():
    """主函数"""
    print("="*60)
    print("数据加载脚本 - TimescaleDB → Parquet")
    print("="*60)
    print()

    # 配置
    symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]
    timeframe = "5m"
    start_date = "2025-12-11"
    end_date = "2026-03-11"

    # 数据库配置（根据实际情况修改）
    db_config = {
        "host": "localhost",
        "port": 5434,
        "database": "trading",
        "user": "postgres",
        "password": "postgres"
    }

    # 加载每个品种
    for symbol in symbols:
        print(f"\n{'='*60}")
        print(f"加载 {symbol}")
        print(f"{'='*60}")

        df = load_from_timescaledb(
            symbol=symbol,
            timeframe=timeframe,
            start_date=start_date,
            end_date=end_date,
            **db_config
        )

        if not df.empty:
            save_to_parquet(df, symbol, start_date, end_date)
        else:
            print(f"❌ {symbol} 数据加载失败")

    print("\n" + "="*60)
    print("数据加载完成")
    print("="*60)


if __name__ == "__main__":
    main()

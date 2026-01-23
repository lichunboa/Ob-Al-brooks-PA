"""
存储模块：结果落盘与后处理
"""
from contextlib import contextmanager
from typing import Dict
from threading import Lock

import pandas as pd
from psycopg_pool import ConnectionPool

from ..config import config


# ==================== 写入结果 ====================

def write_results(all_results: Dict[str, list]):
    """写入 market_data.db - 每个指标一张表，全量覆盖"""
    from ..db.reader import writer as sqlite_writer

    data: Dict[str, pd.DataFrame] = {}
    for indicator_name, records_list in all_results.items():
        if not records_list:
            continue
        all_records = []
        for records in records_list:
            if isinstance(records, list):
                all_records.extend(records)
            elif isinstance(records, dict):
                all_records.append(records)

        if all_records:
            data[indicator_name] = pd.DataFrame(all_records)

    if data:
        sqlite_writer.write_batch(data)

    # 全局计算：市场占比
    update_market_share()

    # 清理期货表的1m数据（期货无1m粒度）
    cleanup_futures_1m()


def write_indicator_result(indicator_name: str, result: pd.DataFrame, interval: str):
    """单指标结果写入"""
    from ..db.reader import writer as sqlite_writer
    sqlite_writer.write(indicator_name, result, interval)


# ==================== 后处理 ====================

_PG_POOL: ConnectionPool | None = None
_PG_POOL_LOCK = Lock()


def _get_pg_pool() -> ConnectionPool:
    global _PG_POOL
    if _PG_POOL is None:
        with _PG_POOL_LOCK:
            if _PG_POOL is None:
                _PG_POOL = ConnectionPool(
                    config.db_url,
                    min_size=1,
                    max_size=5,
                    timeout=30,
                )
    return _PG_POOL


@contextmanager
def _pg_conn():
    with _get_pg_pool().connection() as conn:
        yield conn

def update_market_share():
    """更新期货情绪聚合表的市场占比字段（基于全市场持仓总额）"""
    import sqlite3
    from ..db.reader import inc_sqlite_commit

    try:
        # 1. 从 PostgreSQL 获取全市场各周期持仓总额（只取最新时间点）
        totals = {}
        with _pg_conn() as conn:
            with conn.cursor() as cur:
                # 5m 从原始表（取每个币种最新一条）
                cur.execute("""
                    SELECT SUM(oiv) FROM (
                        SELECT DISTINCT ON (symbol) sum_open_interest_value as oiv
                        FROM market_data.binance_futures_metrics_5m
                        WHERE create_time > NOW() - INTERVAL '1 hour'
                        ORDER BY symbol, create_time DESC
                    ) t
                """)
                row = cur.fetchone()
                if row and row[0]:
                    totals["5m"] = float(row[0])

                # 其他周期从物化视图（取最新 bucket）
                for interval in ["15m", "1h", "4h", "1d", "1w"]:
                    cur.execute(f"""
                        SELECT SUM(sum_open_interest_value)
                        FROM market_data.binance_futures_metrics_{interval}_last
                        WHERE bucket = (SELECT MAX(bucket) FROM market_data.binance_futures_metrics_{interval}_last)
                    """)
                    row = cur.fetchone()
                    if row and row[0]:
                        totals[interval] = float(row[0])

        if not totals:
            return

        # 2. 更新 SQLite 市场占比
        sqlite_conn = sqlite3.connect(str(config.sqlite_path))
        for interval, total in totals.items():
            if total > 0:
                sqlite_conn.execute("""
                    UPDATE '期货情绪聚合表.py'
                    SET 市场占比 = ROUND(CAST(持仓金额 AS REAL) * 100.0 / ?, 4)
                    WHERE 周期 = ? AND 持仓金额 IS NOT NULL AND 持仓金额 != ''
                """, (total, interval))
        sqlite_conn.commit()
        inc_sqlite_commit()
        sqlite_conn.close()
    except Exception:
        pass  # 静默失败


def cleanup_futures_1m():
    """清理期货表的1m数据（期货无1m粒度）"""
    import sqlite3
    from ..config import config
    from ..db.reader import inc_sqlite_commit
    try:
        conn = sqlite3.connect(str(config.sqlite_path))
        conn.execute("DELETE FROM '期货情绪聚合表.py' WHERE 周期='1m'")
        conn.execute("DELETE FROM '期货情绪元数据.py' WHERE 周期='1m'")
        conn.commit()
        inc_sqlite_commit()
        conn.close()
    except Exception:
        pass

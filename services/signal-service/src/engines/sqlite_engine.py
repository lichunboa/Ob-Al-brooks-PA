"""
SQLite 信号检测引擎
基于指标数据库检测信号
"""
import sqlite3
import time
import logging
import threading
from datetime import datetime
from typing import Dict, List, Optional, Set, Callable

from .base import BaseEngine, Signal
from ..rules import ALL_RULES, RULES_BY_TABLE, SignalRule
from ..config import get_sqlite_path, DEFAULT_TIMEFRAMES, COOLDOWN_SECONDS
from ..events import SignalEvent, SignalPublisher

logger = logging.getLogger(__name__)


class SQLiteSignalEngine(BaseEngine):
    """SQLite 信号检测引擎"""

    def __init__(
        self,
        db_path: str = None,
        formatter: Callable = None,
    ):
        super().__init__()
        self.db_path = db_path or str(get_sqlite_path())
        self.formatter = formatter  # 可选的格式化器
        
        # 状态
        self.baseline: Dict[str, Dict] = {}  # {table_symbol_tf: row_data}
        self.cooldown: Dict[str, float] = {}  # {rule_symbol_tf: last_trigger_time}
        self.baseline_loaded = False
        self.enabled_rules: Set[str] = {r.name for r in ALL_RULES if r.enabled}

        # 统计
        self.stats = {
            "checks": 0,
            "signals": 0,
            "errors": 0,
        }

    def enable_rule(self, name: str) -> bool:
        """启用规则"""
        self.enabled_rules.add(name)
        return True

    def disable_rule(self, name: str) -> bool:
        """禁用规则"""
        self.enabled_rules.discard(name)
        return True

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _get_table_data(self, table: str, timeframe: str) -> Dict[str, Dict]:
        """获取表中指定周期的所有数据"""
        if table not in RULES_BY_TABLE:
            logger.warning(f"非法表名: {table}")
            return {}
        try:
            conn = self._get_conn()
            cursor = conn.cursor()
            cursor.execute(f'SELECT * FROM "{table}" WHERE "周期" = ? OR "周期" IS NULL', (timeframe,))
            rows = cursor.fetchall()
            conn.close()

            result = {}
            for row in rows:
                row_dict = dict(row)
                symbol = row_dict.get("交易对", "")
                if symbol:
                    result[symbol] = row_dict
            return result
        except Exception as e:
            logger.warning(f"读取表 {table} 失败: {e}")
            return {}

    def _get_symbol_all_tables(self, symbol: str, timeframe: str) -> Dict[str, Dict]:
        """获取单个币种所有表的数据"""
        result = {}
        for table in RULES_BY_TABLE.keys():
            data = self._get_table_data(table, timeframe)
            if symbol in data:
                result[table] = data[symbol]
        return result

    def _is_cooled_down(self, rule: SignalRule, symbol: str, timeframe: str) -> bool:
        """检查是否在冷却期"""
        key = f"{rule.name}_{symbol}_{timeframe}"
        last = self.cooldown.get(key, 0)
        return time.time() - last > rule.cooldown

    def _set_cooldown(self, rule: SignalRule, symbol: str, timeframe: str):
        """设置冷却"""
        key = f"{rule.name}_{symbol}_{timeframe}"
        self.cooldown[key] = time.time()

    def check_signals(self) -> List[Signal]:
        """检查所有规则"""
        signals = []
        self.stats["checks"] += 1

        for table, rules in RULES_BY_TABLE.items():
            active_rules = [r for r in rules if r.name in self.enabled_rules]
            if not active_rules:
                continue

            all_timeframes = set()
            for r in active_rules:
                all_timeframes.update(r.timeframes)

            for timeframe in all_timeframes:
                current_data = self._get_table_data(table, timeframe)

                for symbol, curr_row in current_data.items():
                    volume = curr_row.get("成交额") or curr_row.get("成交额（USDT）") or 0
                    cache_key = f"{table}_{symbol}_{timeframe}"
                    prev_row = self.baseline.get(cache_key)

                    if not self.baseline_loaded:
                        self.baseline[cache_key] = curr_row
                        continue

                    for rule in active_rules:
                        if timeframe not in rule.timeframes:
                            continue
                        if volume < rule.min_volume:
                            continue

                        try:
                            if rule.check_condition(prev_row, curr_row):
                                if self._is_cooled_down(rule, symbol, timeframe):
                                    price = curr_row.get("当前价格") or curr_row.get("价格") or curr_row.get("收盘价") or 0
                                    rule_msg = rule.format_message(prev_row, curr_row)

                                    # 构建信号
                                    signal = Signal(
                                        symbol=symbol,
                                        direction=rule.direction,
                                        strength=rule.strength,
                                        rule_name=rule.name,
                                        timeframe=timeframe,
                                        price=price,
                                        message=rule_msg,
                                        category=rule.category,
                                        subcategory=rule.subcategory,
                                        table=table,
                                        priority=rule.priority
                                    )

                                    # 格式化完整消息（如果有格式化器）
                                    if self.formatter:
                                        curr_all = self._get_symbol_all_tables(symbol, timeframe)
                                        prev_all = {}
                                        for t in RULES_BY_TABLE.keys():
                                            pk = f"{t}_{symbol}_{timeframe}"
                                            if pk in self.baseline:
                                                prev_all[t] = self.baseline[pk]
                                        
                                        signal.full_message = self.formatter(
                                            symbol=symbol,
                                            direction=rule.direction,
                                            rule_name=rule.name,
                                            timeframe=timeframe,
                                            strength=rule.strength,
                                            curr_data=curr_all,
                                            prev_data=prev_all,
                                            rule_message=rule_msg
                                        )

                                    signals.append(signal)
                                    self._set_cooldown(rule, symbol, timeframe)
                                    self.stats["signals"] += 1

                                    logger.info(f"信号触发: {symbol} {rule.direction} - {rule.name} ({timeframe})")

                                    # 发布事件
                                    self._publish_event(signal, rule)

                        except Exception as e:
                            self.stats["errors"] += 1
                            logger.warning(f"规则检查异常 {rule.name}: {e}")

                    self.baseline[cache_key] = curr_row

        if not self.baseline_loaded:
            self.baseline_loaded = True
            logger.info(f"基线缓存完成，共 {len(self.baseline)} 条记录")

        return signals

    def _publish_event(self, signal: Signal, rule: SignalRule):
        """发布信号事件"""
        event = SignalEvent(
            symbol=signal.symbol,
            signal_type=rule.name,
            direction=signal.direction,
            strength=signal.strength,
            message_key=f"signal.{rule.category}.{rule.subcategory}",
            message_params={
                "symbol": signal.symbol,
                "price": signal.price,
                "timeframe": signal.timeframe,
            },
            timestamp=signal.timestamp,
            timeframe=signal.timeframe,
            price=signal.price,
            source="sqlite",
            rule_name=rule.name,
            category=rule.category,
            subcategory=rule.subcategory,
            table=signal.table,
            extra={"message": signal.message},
        )
        SignalPublisher.publish(event)

    def run_loop(self, interval: int = 60):
        """持续运行"""
        self._running = True
        logger.info(f"SQLite 信号引擎启动，间隔: {interval}秒，规则数: {len(self.enabled_rules)}")

        while self._running:
            try:
                signals = self.check_signals()
                if signals:
                    for signal in signals:
                        self._emit_signal(signal)
                    logger.info(f"本轮检测到 {len(signals)} 个信号")
            except Exception as e:
                logger.error(f"检查循环异常: {e}")

            time.sleep(interval)

    def get_stats(self) -> Dict:
        """获取统计"""
        return {
            **self.stats,
            "baseline_size": len(self.baseline),
            "cooldown_size": len(self.cooldown),
            "enabled_rules": len(self.enabled_rules),
            "total_rules": len(ALL_RULES),
        }


# 单例
_engine: Optional[SQLiteSignalEngine] = None
_engine_lock = threading.Lock()


def get_sqlite_engine() -> SQLiteSignalEngine:
    """获取 SQLite 引擎单例"""
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = SQLiteSignalEngine()
    return _engine

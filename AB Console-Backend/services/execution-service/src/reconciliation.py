"""
数据对账模块 V2.6.0

功能:
- 对比 active_trades.json 和币安实际持仓
- 检测数据不一致
- 自动修正错误状态
- 生成对账报告

作者: AL Brooks Trading Console
版本: 2.6.0
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# 文件路径
WORKSPACE = Path.home() / ".openclaw" / "workspace"
SHARED_WORKSPACE = Path.home() / ".openclaw" / "workspaces" / "trading-shared"

ACTIVE_TRADES_FILES = {
    "main": WORKSPACE / "active_trades.json",
    "al-brooks": SHARED_WORKSPACE / "al_brooks_active_trades.json",
    "trader": SHARED_WORKSPACE / "quant_active_trades.json",
    "wyckoff": SHARED_WORKSPACE / "wyckoff_active_trades.json",
}


class TradeReconciliation:
    """交易对账器"""

    def __init__(self, executor):
        self.executor = executor

    async def reconcile_all(self) -> Dict:
        """
        对账所有交易记录

        Returns:
            {
                "total_checked": 总检查数,
                "discrepancies": 不一致列表,
                "fixed_count": 修复数量,
                "errors": 错误列表
            }
        """
        logger.info("开始数据对账...")

        result = {
            "total_checked": 0,
            "discrepancies": [],
            "fixed_count": 0,
            "errors": [],
        }

        # 获取币安实际持仓
        try:
            binance_positions = await self.executor.get_positions()
            binance_symbols = {p.symbol: p for p in binance_positions}
        except Exception as e:
            logger.error(f"获取币安持仓失败: {e}")
            result["errors"].append(f"获取币安持仓失败: {e}")
            return result

        # 检查所有 active_trades.json 文件
        for name, file_path in ACTIVE_TRADES_FILES.items():
            if not file_path.exists():
                continue

            try:
                discrepancies = await self._reconcile_file(
                    file_path, binance_symbols, name
                )
                result["discrepancies"].extend(discrepancies)
                result["total_checked"] += len(
                    self._read_active_trades(file_path)
                )
            except Exception as e:
                logger.error(f"对账 {name} 失败: {e}")
                result["errors"].append(f"对账 {name} 失败: {e}")

        # 统计修复数量
        result["fixed_count"] = len(
            [d for d in result["discrepancies"] if d.get("fixed")]
        )

        logger.info(
            f"对账完成: 检查 {result['total_checked']} 笔，"
            f"发现 {len(result['discrepancies'])} 处不一致，"
            f"修复 {result['fixed_count']} 笔"
        )

        return result

    async def _reconcile_file(
        self,
        file_path: Path,
        binance_symbols: Dict,
        source_name: str,
    ) -> List[Dict]:
        """对账单个文件"""
        discrepancies = []
        trades = self._read_active_trades(file_path)

        for trade in trades:
            if trade.get("status") != "active":
                continue  # 只检查 active 状态的交易

            symbol = trade.get("symbol", "").replace("/", "")
            if not symbol:
                continue

            # 检查币安是否有对应持仓
            if symbol not in binance_symbols:
                # 本地记录显示 active，但币安无持仓
                discrepancy = {
                    "source": source_name,
                    "trade_id": trade.get("trade_id"),
                    "symbol": symbol,
                    "local_status": "active",
                    "binance_status": "no_position",
                    "action": "mark_closed",
                    "fixed": False,
                }

                # 尝试自动修复
                try:
                    self._mark_trade_closed(
                        file_path,
                        trade.get("trade_id"),
                        reason="币安无持仓（对账发现）",
                    )
                    discrepancy["fixed"] = True
                    logger.info(
                        f"已修正 {source_name}/{trade.get('trade_id')}: "
                        f"{symbol} 标记为已关闭"
                    )
                except Exception as e:
                    discrepancy["error"] = str(e)
                    logger.error(f"修正失败: {e}")

                discrepancies.append(discrepancy)

        return discrepancies

    def _read_active_trades(self, file_path: Path) -> List[Dict]:
        """读取 active_trades.json"""
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            # 兼容不同格式
            if "trades" in data:
                return data["trades"]
            elif "active_trades" in data:
                return data["active_trades"]
            return []
        except Exception as e:
            logger.error(f"读取 {file_path} 失败: {e}")
            return []

    def _mark_trade_closed(
        self, file_path: Path, trade_id: str, reason: str
    ):
        """标记交易为已关闭"""
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))

            # 查找交易
            trades = data.get("trades", data.get("active_trades", []))
            for trade in trades:
                if trade.get("trade_id") == trade_id:
                    trade["status"] = "closed"
                    trade["close_time"] = datetime.now(
                        timezone.utc
                    ).isoformat()
                    trade["exit_reason"] = reason
                    break

            # 移动到历史记录
            if "active_trades" in data:
                active = [
                    t for t in trades if t.get("status") == "active"
                ]
                history = [
                    t for t in trades if t.get("status") != "active"
                ]
                data["active_trades"] = active
                if "trade_history" not in data:
                    data["trade_history"] = []
                data["trade_history"].extend(history)

            # 保存
            file_path.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

        except Exception as e:
            logger.error(f"标记交易关闭失败: {e}")
            raise

    async def check_orphaned_positions(self) -> List[Dict]:
        """
        检查孤儿持仓（币安有持仓，但本地无记录）

        Returns:
            孤儿持仓列表
        """
        orphans = []

        try:
            # 获取币安持仓
            binance_positions = await self.executor.get_positions()

            # 读取所有本地记录
            local_symbols = set()
            for file_path in ACTIVE_TRADES_FILES.values():
                if file_path.exists():
                    trades = self._read_active_trades(file_path)
                    for trade in trades:
                        if trade.get("status") == "active":
                            symbol = trade.get("symbol", "").replace(
                                "/", ""
                            )
                            local_symbols.add(symbol)

            # 检查孤儿
            for pos in binance_positions:
                if pos.symbol not in local_symbols:
                    orphans.append(
                        {
                            "symbol": pos.symbol,
                            "side": pos.side.value,
                            "quantity": pos.quantity,
                            "entry_price": pos.entry_price,
                            "unrealized_pnl": pos.unrealized_pnl,
                            "action": "create_local_record",
                        }
                    )
                    logger.warning(
                        f"发现孤儿持仓: {pos.symbol} {pos.side.value} "
                        f"{pos.quantity} (本地无记录)"
                    )

        except Exception as e:
            logger.error(f"检查孤儿持仓失败: {e}")

        return orphans

    async def get_reconciliation_report(self) -> Dict:
        """
        生成完整对账报告

        Returns:
            {
                "timestamp": 对账时间,
                "binance_positions": 币安持仓数,
                "local_active_trades": 本地活跃交易数,
                "discrepancies": 不一致列表,
                "orphaned_positions": 孤儿持仓列表,
                "summary": 摘要
            }
        """
        reconcile_result = await self.reconcile_all()
        orphans = await self.check_orphaned_positions()

        # 统计本地活跃交易
        local_active_count = 0
        for file_path in ACTIVE_TRADES_FILES.values():
            if file_path.exists():
                trades = self._read_active_trades(file_path)
                local_active_count += sum(
                    1 for t in trades if t.get("status") == "active"
                )

        # 币安持仓数
        try:
            binance_positions = await self.executor.get_positions()
            binance_count = len(binance_positions)
        except Exception:
            binance_count = 0

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "binance_positions": binance_count,
            "local_active_trades": local_active_count,
            "discrepancies": reconcile_result.get("discrepancies", []),
            "orphaned_positions": orphans,
            "summary": {
                "total_checked": reconcile_result.get("total_checked", 0),
                "issues_found": len(reconcile_result.get("discrepancies", []))
                + len(orphans),
                "auto_fixed": reconcile_result.get("fixed_count", 0),
                "requires_manual_fix": len(orphans),
            },
        }

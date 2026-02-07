"""
交易状态管理器 V2.6.0

功能:
- 交易开关控制
- 机器人资金分配
- 状态持久化
- 币安数据同步

作者: AL Brooks Trading Console
版本: 2.6.0
"""
import json
import logging
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# 状态文件路径
STATE_FILE = Path.home() / ".openclaw" / "workspace" / "trading_state.json"


@dataclass
class BotAllocation:
    """机器人资金分配"""
    bot_id: str
    name: str
    allocated_usdt: float
    max_leverage: int
    max_positions: int
    enabled: bool = True
    current_positions: int = 0
    used_margin: float = 0.0


@dataclass
class TradingState:
    """交易状态"""
    trading_enabled: bool = False
    last_sync: Optional[str] = None
    binance_balance: float = 0.0
    binance_available: float = 0.0
    total_unrealized_pnl: float = 0.0
    allocations: Dict[str, dict] = field(default_factory=dict)

    def __post_init__(self):
        if not self.allocations:
            # 默认分配
            self.allocations = {
                "al-brooks": {
                    "bot_id": "al-brooks",
                    "name": "PA交易",
                    "allocated_usdt": 2000.0,
                    "max_leverage": 5,
                    "max_positions": 3,
                    "enabled": True,
                    "current_positions": 0,
                    "used_margin": 0.0,
                },
                "trader": {
                    "bot_id": "trader",
                    "name": "量化分析师",
                    "allocated_usdt": 2000.0,
                    "max_leverage": 5,
                    "max_positions": 3,
                    "enabled": True,
                    "current_positions": 0,
                    "used_margin": 0.0,
                },
                "wyckoff": {
                    "bot_id": "wyckoff",
                    "name": "威科夫大师",
                    "allocated_usdt": 1000.0,
                    "max_leverage": 3,
                    "max_positions": 2,
                    "enabled": True,
                    "current_positions": 0,
                    "used_margin": 0.0,
                },
            }


class TradingStateManager:
    """交易状态管理器"""

    def __init__(self):
        self.state = self._load_state()
        logger.info(f"TradingStateManager 初始化完成，交易状态: {'开启' if self.state.trading_enabled else '关闭'}")

    def _load_state(self) -> TradingState:
        """加载状态"""
        try:
            if STATE_FILE.exists():
                data = json.loads(STATE_FILE.read_text(encoding='utf-8'))
                logger.info(f"从 {STATE_FILE} 加载交易状态")
                return TradingState(**data)
        except Exception as e:
            logger.warning(f"加载状态失败: {e}，使用默认状态")
        return TradingState()

    def _save_state(self):
        """保存状态"""
        try:
            STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            data = asdict(self.state)
            STATE_FILE.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding='utf-8'
            )
            logger.debug(f"状态已保存到 {STATE_FILE}")
        except Exception as e:
            logger.error(f"保存状态失败: {e}")

    def toggle_trading(self, enabled: bool) -> bool:
        """开关交易"""
        self.state.trading_enabled = enabled
        self._save_state()
        logger.info(f"交易状态已{'开启' if enabled else '关闭'}")
        return enabled

    def is_trading_enabled(self) -> bool:
        """检查交易是否开启"""
        return self.state.trading_enabled

    def sync_balance(self, balance: float, available: float = 0.0, unrealized_pnl: float = 0.0):
        """同步币安余额"""
        self.state.binance_balance = balance
        self.state.binance_available = available or balance
        self.state.total_unrealized_pnl = unrealized_pnl
        self.state.last_sync = datetime.now().isoformat()
        self._save_state()
        logger.info(f"余额已同步: ${balance:.2f} (可用: ${available:.2f})")

    def get_allocation(self, bot_id: str) -> Optional[dict]:
        """获取机器人分配"""
        return self.state.allocations.get(bot_id)

    def get_all_allocations(self) -> Dict[str, dict]:
        """获取所有分配"""
        return self.state.allocations

    def update_allocation(
        self,
        bot_id: str,
        allocated_usdt: Optional[float] = None,
        max_leverage: Optional[int] = None,
        max_positions: Optional[int] = None,
        enabled: Optional[bool] = None,
    ) -> bool:
        """更新机器人分配"""
        if bot_id not in self.state.allocations:
            logger.warning(f"未知机器人: {bot_id}")
            return False

        alloc = self.state.allocations[bot_id]

        if allocated_usdt is not None:
            alloc["allocated_usdt"] = allocated_usdt
        if max_leverage is not None:
            alloc["max_leverage"] = max_leverage
        if max_positions is not None:
            alloc["max_positions"] = max_positions
        if enabled is not None:
            alloc["enabled"] = enabled

        self._save_state()
        logger.info(f"已更新 {bot_id} 分配: {alloc}")
        return True

    def update_bot_positions(self, bot_id: str, positions: int, margin: float):
        """更新机器人持仓信息"""
        if bot_id in self.state.allocations:
            self.state.allocations[bot_id]["current_positions"] = positions
            self.state.allocations[bot_id]["used_margin"] = margin
            self._save_state()

    def can_bot_trade(self, bot_id: str) -> tuple[bool, str]:
        """检查机器人是否可以交易"""
        # 检查全局开关
        if not self.state.trading_enabled:
            return False, "交易开关未开启"

        # 检查机器人配置
        alloc = self.state.allocations.get(bot_id)
        if not alloc:
            return False, f"未知机器人: {bot_id}"

        if not alloc.get("enabled", True):
            return False, f"{alloc['name']} 已禁用"

        # 检查持仓限制
        current = alloc.get("current_positions", 0)
        max_pos = alloc.get("max_positions", 3)
        if current >= max_pos:
            return False, f"{alloc['name']} 已达最大持仓数 ({current}/{max_pos})"

        # 检查资金限制
        used = alloc.get("used_margin", 0)
        allocated = alloc.get("allocated_usdt", 0)
        if used >= allocated:
            return False, f"{alloc['name']} 已用完分配资金 (${used:.0f}/${allocated:.0f})"

        return True, "OK"

    def get_available_margin(self, bot_id: str) -> float:
        """获取机器人可用保证金"""
        alloc = self.state.allocations.get(bot_id)
        if not alloc:
            return 0.0
        return alloc.get("allocated_usdt", 0) - alloc.get("used_margin", 0)

    def calculate_position_size(
        self,
        bot_id: str,
        entry_price: float,
        stop_loss: float,
        risk_percent: float = 1.0,
    ) -> tuple[float, str]:
        """
        计算仓位大小

        Args:
            bot_id: 机器人 ID
            entry_price: 入场价格
            stop_loss: 止损价格
            risk_percent: 风险百分比 (默认 1%)

        Returns:
            (仓位大小, 说明)
        """
        alloc = self.state.allocations.get(bot_id)
        if not alloc:
            return 0.0, f"未知机器人: {bot_id}"

        available = self.get_available_margin(bot_id)
        if available <= 0:
            return 0.0, "无可用资金"

        # 计算止损距离
        stop_distance = abs(entry_price - stop_loss)
        if stop_distance == 0:
            return 0.0, "止损距离为 0"

        stop_percent = stop_distance / entry_price

        # 风险金额 = 可用资金 * 风险百分比
        risk_amount = available * (risk_percent / 100)

        # 仓位价值 = 风险金额 / 止损百分比
        position_value = risk_amount / stop_percent

        # 考虑杠杆
        leverage = alloc.get("max_leverage", 5)
        max_position = available * leverage

        # 取较小值
        final_value = min(position_value, max_position)

        # 转换为数量
        quantity = final_value / entry_price

        return quantity, f"风险 ${risk_amount:.2f}, 仓位 ${final_value:.2f}, 数量 {quantity:.6f}"

    def get_status_summary(self) -> dict:
        """获取状态摘要"""
        total_allocated = sum(
            a.get("allocated_usdt", 0) for a in self.state.allocations.values()
        )
        total_used = sum(
            a.get("used_margin", 0) for a in self.state.allocations.values()
        )
        total_positions = sum(
            a.get("current_positions", 0) for a in self.state.allocations.values()
        )

        return {
            "trading_enabled": self.state.trading_enabled,
            "last_sync": self.state.last_sync,
            "binance_balance": self.state.binance_balance,
            "binance_available": self.state.binance_available,
            "total_unrealized_pnl": self.state.total_unrealized_pnl,
            "total_allocated": total_allocated,
            "total_used": total_used,
            "total_positions": total_positions,
            "allocations": self.state.allocations,
        }


# 单例实例
_trading_state_manager: Optional[TradingStateManager] = None


def get_trading_state_manager() -> TradingStateManager:
    """获取交易状态管理器单例"""
    global _trading_state_manager
    if _trading_state_manager is None:
        _trading_state_manager = TradingStateManager()
    return _trading_state_manager

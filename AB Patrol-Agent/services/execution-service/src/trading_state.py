"""
交易状态管理器 V2.8.0

功能:
- 交易开关控制
- 机器人资金分配（含风控配置）
- 状态持久化
- 币安数据同步

作者: AL Brooks Trading Console
版本: 2.8.0
"""
import json
import logging
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Dict, Optional
from datetime import datetime

from .config import WORKSPACE

logger = logging.getLogger(__name__)

# 状态文件路径
STATE_FILE = WORKSPACE / "trading_state.json"

# V7.0: 多 Agent 模式 — 所有启用的 bot 均可交易
PA_ONLY_MODE = False
PA_ONLY_BOTS = {"al-brooks", "claude-pa"}


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
    # V2.8.0 新增风控配置
    risk_percent: float = 2.0              # 单笔风险%
    fee_rate_maker: float = 0.0002         # maker 费率
    fee_rate_taker: float = 0.0004         # taker 费率
    allowed_symbols: list = field(default_factory=lambda: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "AAVEUSDT", "ADAUSDT", "AVAXUSDT"])
    min_risk_reward: float = 1.5           # 最小盈亏比
    daily_loss_limit: float = 50.0         # per-bot 日亏损限制 USDT（兜底值）
    daily_loss_pct: float = 5.0             # 日亏损限制 = 分配资金的 %（动态）
    trailing_stop_enabled: bool = False    # 移动止损开关
    trailing_stop_trigger: float = 1.0     # 移动止损触发%
    max_hold_hours: int = 48               # 最大持仓时间
    cooldown_minutes: int = 30             # 同品种冷却期(分钟)
    allocation_pct: float = 0.0            # 占总余额的百分比（>0 时启用动态分配）


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
            defaults_new = {
                "risk_percent": 2.0,
                "fee_rate_maker": 0.0002,
                "fee_rate_taker": 0.0004,
                "allowed_symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "AAVEUSDT", "ADAUSDT", "AVAXUSDT"],
                "min_risk_reward": 1.5,
                "daily_loss_limit": 200.0,   # V5.0 模拟阶段放宽
                "daily_loss_pct": 10.0,      # V5.0 模拟阶段放宽
                "trailing_stop_enabled": False,
                "trailing_stop_trigger": 1.0,
                "max_hold_hours": 48,
                "cooldown_minutes": 30,
                "allocation_pct": 0.0,
                "max_notional_per_position": 0,
            }
            self.allocations = {
                "al-brooks": {
                    "bot_id": "al-brooks",
                    "name": "PA交易",
                    "allocated_usdt": 2000.0,
                    "max_leverage": 10,
                    "max_positions": 10,
                    "enabled": True,
                    "current_positions": 0,
                    "used_margin": 0.0,
                    **defaults_new,
                },
                "trader": {
                    "bot_id": "trader",
                    "name": "量化分析师（V5.0暂停）",
                    "allocated_usdt": 2000.0,
                    "max_leverage": 10,
                    "max_positions": 4,
                    "enabled": False,  # V5.0: 暂停，集中PA交易
                    "current_positions": 0,
                    "used_margin": 0.0,
                    **defaults_new,
                },
                "wyckoff": {
                    "bot_id": "wyckoff",
                    "name": "威科夫大师（V5.0暂停）",
                    "allocated_usdt": 1000.0,
                    "max_leverage": 3,
                    "max_positions": 3,
                    "enabled": False,  # V5.0: 暂停，集中PA交易
                    "current_positions": 0,
                    "used_margin": 0.0,
                    **defaults_new,
                    "daily_loss_limit": 30.0,  # 威科夫资金少，限额低
                },
            }
        else:
            # 迁移旧数据：为缺少新字段的 allocation 补充默认值
            new_field_defaults = {
                "risk_percent": 2.0,
                "fee_rate_maker": 0.0002,
                "fee_rate_taker": 0.0004,
                "allowed_symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "AAVEUSDT", "ADAUSDT", "AVAXUSDT"],
                "min_risk_reward": 1.5,
                "daily_loss_limit": 50.0,
                "daily_loss_pct": 5.0,
                "trailing_stop_enabled": False,
                "trailing_stop_trigger": 1.0,
                "max_hold_hours": 48,
                "cooldown_minutes": 30,
                "allocation_pct": 0.0,
                "max_notional_per_position": 0,
            }
            for bot_id, alloc in self.allocations.items():
                for key, default_val in new_field_defaults.items():
                    if key not in alloc:
                        alloc[key] = default_val


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
        """同步币安余额，并按百分比动态调整分配资金"""
        self.state.binance_balance = balance
        self.state.binance_available = available or balance
        self.state.total_unrealized_pnl = unrealized_pnl
        self.state.last_sync = datetime.now().isoformat()

        # 动态分配：allocation_pct > 0 的 bot 按余额百分比重算 allocated_usdt
        if balance > 0:
            for bot_id, alloc in self.state.allocations.items():
                pct = alloc.get("allocation_pct", 0.0)
                if pct > 0:
                    new_alloc = round(balance * pct / 100, 2)
                    old_alloc = alloc.get("allocated_usdt", 0)
                    if abs(new_alloc - old_alloc) > 1.0:  # 变化超过 $1 才更新
                        alloc["allocated_usdt"] = new_alloc
                        # 同步更新日亏限（按 daily_loss_pct 重算）
                        dlp = alloc.get("daily_loss_pct", 3.0)
                        alloc["daily_loss_limit"] = round(new_alloc * dlp / 100, 2)
                        logger.info(
                            f"动态分配 {bot_id}: ${old_alloc:.0f} → ${new_alloc:.0f} "
                            f"({pct}% of ${balance:.0f})"
                        )

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
        **kwargs,
    ) -> bool:
        """更新机器人分配（支持所有字段）"""
        if bot_id not in self.state.allocations:
            logger.warning(f"未知机器人: {bot_id}")
            return False

        alloc = self.state.allocations[bot_id]

        # 允许更新的字段白名单
        updatable = {
            "allocated_usdt", "max_leverage", "max_positions",
            "enabled", "risk_percent", "fee_rate_maker",
            "fee_rate_taker", "allowed_symbols",
            "min_risk_reward", "daily_loss_limit", "daily_loss_pct",
            "trailing_stop_enabled", "trailing_stop_trigger",
            "max_hold_hours", "cooldown_minutes", "allocation_pct",
            "max_notional_per_position",
        }

        for key, val in kwargs.items():
            if key in updatable and val is not None:
                alloc[key] = val

        self._save_state()
        logger.info(f"已更新 {bot_id} 分配: {alloc}")
        return True

    def update_bot_positions(self, bot_id: str, positions: int, margin: float):
        """更新机器人持仓信息"""
        if bot_id in self.state.allocations:
            self.state.allocations[bot_id]["current_positions"] = positions
            self.state.allocations[bot_id]["used_margin"] = margin
            self._save_state()

    def can_bot_trade(
        self,
        bot_id: str,
        live_position_count: int = -1,
        symbol: str = "",
        bot_positions: list = None,
    ) -> tuple[bool, str]:
        """检查机器人是否可以交易

        Args:
            bot_id: 机器人 ID
            live_position_count: 实时持仓数量（从币安查询）。
                如果传入 >=0 的值，使用实时数据；否则回退到本地缓存。
            symbol: 要开仓的品种（用于累积名义检查）
            bot_positions: 该 bot 的实时持仓列表（用于累积名义检查）
        """
        # V5.0: PA 聚焦模式门控
        if PA_ONLY_MODE and bot_id not in PA_ONLY_BOTS:
            return False, f"V5.0 PA聚焦模式: {bot_id} 已暂停"

        # 检查全局开关
        if not self.state.trading_enabled:
            return False, "交易开关未开启"

        # 检查机器人配置
        alloc = self.state.allocations.get(bot_id)
        if not alloc:
            return False, f"未知机器人: {bot_id}"

        if not alloc.get("enabled", True):
            return False, f"{alloc['name']} 已禁用"

        # 检查持仓限制 — 优先使用实时数据
        current = live_position_count if live_position_count >= 0 else alloc.get("current_positions", 0)
        max_pos = alloc.get("max_positions", 3)
        if current >= max_pos:
            return False, f"{alloc['name']} 已达最大持仓数 ({current}/{max_pos})"

        # 检查资金限制
        used = alloc.get("used_margin", 0)
        allocated = alloc.get("allocated_usdt", 0)
        if used >= allocated:
            return False, f"{alloc['name']} 已用完分配资金 (${used:.0f}/${allocated:.0f})"

        # V3.5: 同品种累积名义价值检查
        if symbol and bot_positions:
            max_notional = alloc.get("max_notional_per_position", 0)
            leverage = alloc.get("max_leverage", 5)
            if max_notional <= 0:
                max_notional = (allocated / max(max_pos, 1)) * leverage
            # 累积名义上限 = 单仓上限 × 2（允许一次加仓）
            max_cumulative = max_notional * 2
            # 标准化 symbol 用于匹配
            norm = symbol.replace("/", "").split(":")[0].upper()
            existing_notional = 0.0
            for p in bot_positions:
                p_norm = p.symbol.replace("/", "").split(":")[0].upper()
                if p_norm == norm:
                    existing_notional += abs(p.quantity * p.mark_price)
            if existing_notional >= max_cumulative:
                return False, f"{alloc['name']} {symbol} 累积名义 ${existing_notional:.0f} 已达上限 ${max_cumulative:.0f}"

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
        risk_percent: Optional[float] = None,
    ) -> tuple[float, str]:
        """
        计算仓位大小

        Args:
            bot_id: 机器人 ID
            entry_price: 入场价格
            stop_loss: 止损价格
            risk_percent: 风险百分比 (None 则用 bot 配置)

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

        # 使用 bot 配置的 risk_percent，或传入值
        actual_risk = risk_percent or alloc.get(
            "risk_percent", 2.0
        )

        # 风险金额 = 可用资金 * 风险百分比
        risk_amount = available * (actual_risk / 100)

        # 仓位价值 = 风险金额 / 止损百分比
        position_value = risk_amount / stop_percent

        # 考虑杠杆
        leverage = alloc.get("max_leverage", 5)
        max_position = available * leverage

        # 名义价值上限（为外汇 100x 做准备）
        max_notional = alloc.get("max_notional_per_position", 0)
        if max_notional <= 0:
            # 向后兼容：自动从分配资金计算
            max_positions = alloc.get("max_positions", 3)
            max_notional = (available / max_positions) * leverage

        # 取三者最小值
        final_value = min(position_value, max_position, max_notional)

        # 转换为数量
        quantity = final_value / entry_price

        return quantity, f"风险 ${risk_amount:.2f}, 仓位 ${final_value:.2f} (名义上限 ${max_notional:.0f}), 数量 {quantity:.6f}"

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

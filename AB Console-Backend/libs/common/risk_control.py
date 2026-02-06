"""
交易风控模块 - AB Console 专用

功能：
1. 冷却机制（基于账本计算，不消耗 AI token）
2. 高水位仓位锁定
3. 数据新鲜度检查

配置文件：~/.openclaw/workspace/stats/risk_control.json
"""
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# 配置路径
WORKSPACE_DIR = Path(os.getenv("WORKSPACE_DIR", "/Users/mitchellcb/.openclaw/workspace"))
SHARED_WORKSPACE = Path(os.getenv("SHARED_WORKSPACE", "/Users/mitchellcb/.openclaw/workspaces/trading-shared"))
RISK_CONTROL_FILE = WORKSPACE_DIR / "stats" / "risk_control.json"


@dataclass
class CooldownRule:
    """冷却规则"""
    # 连续亏损触发冷却
    consecutive_loss_threshold: int = 5
    cooldown_minutes: int = 30
    # 单日亏损触发冷却
    daily_loss_pct_threshold: float = 5.0
    daily_cooldown_minutes: int = 60


@dataclass
class PositionRule:
    """仓位规则"""
    # 基础仓位比例
    base_position_pct: float = 1.0
    # 最大仓位比例
    max_position_pct: float = 5.0
    # 高水位锁定阈值（账户跌幅超过此值才允许降低仓位）
    high_water_unlock_drawdown_pct: float = 30.0


@dataclass
class FreshnessRule:
    """数据新鲜度规则"""
    # 各周期最大数据年龄（秒）
    max_age_by_timeframe: Dict[str, int] = field(default_factory=lambda: {
        "1m": 120,    # 2 分钟
        "5m": 600,    # 10 分钟
        "15m": 1800,  # 30 分钟
        "1h": 7200,   # 2 小时
        "4h": 28800,  # 8 小时
        "1d": 86400,  # 24 小时
    })


class RiskController:
    """
    风控控制器

    使用方式：
        controller = RiskController()

        # 检查冷却
        should_cool, reason = controller.check_cooldown("al-brooks", "BTCUSDT")

        # 计算仓位
        position_size = controller.calculate_position("al-brooks", signal_score=85)

        # 检查数据新鲜度
        is_fresh = controller.check_freshness(data_timestamp, "5m")
    """

    def __init__(self):
        self.cooldown_rule = CooldownRule()
        self.position_rule = PositionRule()
        self.freshness_rule = FreshnessRule()
        self._state = self._load_state()

    def _load_state(self) -> Dict:
        """加载状态"""
        if RISK_CONTROL_FILE.exists():
            try:
                with open(RISK_CONTROL_FILE, "r") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"[RiskControl] 加载状态失败: {e}")
        return {
            "cooldowns": {},  # {agent: {symbol: cooldown_until}}
            "high_water_marks": {},  # {agent: {balance: float, position_size: float}}
            "daily_stats": {},  # {agent: {date: str, loss: float}}
        }

    def _save_state(self):
        """保存状态"""
        try:
            RISK_CONTROL_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(RISK_CONTROL_FILE, "w") as f:
                json.dump(self._state, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"[RiskControl] 保存状态失败: {e}")

    def _load_account(self, agent: str) -> Optional[Dict]:
        """加载账户数据"""
        account_files = {
            "al-brooks": SHARED_WORKSPACE / "al_brooks_account.json",
            "trader": SHARED_WORKSPACE / "quant_account.json",
            "wyckoff": SHARED_WORKSPACE / "wyckoff_account.json",
        }
        account_file = account_files.get(agent)
        if account_file and account_file.exists():
            try:
                with open(account_file, "r") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"[RiskControl] 加载账户 {agent} 失败: {e}")
        return None

    # ==================== 冷却机制 ====================

    def check_cooldown(self, agent: str, symbol: str) -> Tuple[bool, Optional[str]]:
        """
        检查是否应该冷却

        Args:
            agent: 机器人名称
            symbol: 交易品种

        Returns:
            (should_cooldown, reason)
        """
        now = time.time()

        # 1. 检查品种级冷却
        cooldowns = self._state.get("cooldowns", {}).get(agent, {})
        if symbol in cooldowns:
            cooldown_until = cooldowns[symbol]
            if now < cooldown_until:
                remaining = int((cooldown_until - now) / 60)
                return True, f"{symbol} 冷却中，剩余 {remaining} 分钟"

        # 2. 检查账户连续亏损
        account = self._load_account(agent)
        if account:
            stats = account.get("statistics", {})
            # 从 evolution_log 计算连续亏损
            consecutive_losses = self._count_consecutive_losses(account)
            if consecutive_losses >= self.cooldown_rule.consecutive_loss_threshold:
                # 触发冷却
                self._set_cooldown(agent, symbol, self.cooldown_rule.cooldown_minutes)
                return True, f"连续亏损 {consecutive_losses} 次，触发冷却"

        # 3. 检查单日亏损
        daily_loss_pct = self._get_daily_loss_pct(agent)
        if daily_loss_pct >= self.cooldown_rule.daily_loss_pct_threshold:
            self._set_cooldown(agent, symbol, self.cooldown_rule.daily_cooldown_minutes)
            return True, f"单日亏损 {daily_loss_pct:.1f}%，触发冷却"

        return False, None

    def _count_consecutive_losses(self, account: Dict) -> int:
        """计算连续亏损次数"""
        evolution_log = account.get("evolution_log", [])
        consecutive = 0
        for entry in reversed(evolution_log):
            details = entry.get("details", "").lower()
            if "亏损" in details or "止损" in details:
                consecutive += 1
            elif "盈利" in details or "止盈" in details:
                break
        return consecutive

    def _get_daily_loss_pct(self, agent: str) -> float:
        """获取单日亏损百分比"""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        daily_stats = self._state.get("daily_stats", {}).get(agent, {})
        if daily_stats.get("date") == today:
            return daily_stats.get("loss_pct", 0.0)
        return 0.0

    def _set_cooldown(self, agent: str, symbol: str, minutes: int):
        """设置冷却"""
        if agent not in self._state["cooldowns"]:
            self._state["cooldowns"][agent] = {}
        self._state["cooldowns"][agent][symbol] = time.time() + minutes * 60
        self._save_state()
        logger.info(f"[RiskControl] {agent}/{symbol} 进入冷却 {minutes} 分钟")

    def clear_cooldown(self, agent: str, symbol: str = None):
        """清除冷却"""
        if agent in self._state.get("cooldowns", {}):
            if symbol:
                self._state["cooldowns"][agent].pop(symbol, None)
            else:
                self._state["cooldowns"][agent] = {}
            self._save_state()
            logger.info(f"[RiskControl] 已清除 {agent}/{symbol or '全部'} 冷却")

    # ==================== 仓位管理 ====================

    def calculate_position(
        self,
        agent: str,
        signal_score: int = 80,
        base_position: float = None,
    ) -> float:
        """
        计算仓位大小

        高水位锁定规则：
        - 账户从 $100 涨到 $1000，仓位从 $1 涨到 $10
        - 之后 $10 成为新的基准仓位
        - 除非账户跌幅超过 30%，否则不降低仓位

        Args:
            agent: 机器人名称
            signal_score: 信号评分 (0-100)
            base_position: 基础仓位（可选，默认从账户读取）

        Returns:
            仓位大小（美元）
        """
        account = self._load_account(agent)
        if not account:
            return base_position or 1000.0

        current_balance = account.get("current_balance", 100000)
        initial_balance = account.get("initial_balance", 100000)

        # 计算当前应有仓位（账户余额 * 仓位比例）
        position_pct = self.position_rule.base_position_pct / 100
        current_position = current_balance * position_pct

        # 获取高水位记录
        high_water = self._state.get("high_water_marks", {}).get(agent, {})
        high_water_balance = high_water.get("balance", initial_balance)
        high_water_position = high_water.get("position_size", initial_balance * position_pct)

        # 更新高水位
        if current_balance > high_water_balance:
            high_water_balance = current_balance
            high_water_position = current_position
            if agent not in self._state["high_water_marks"]:
                self._state["high_water_marks"][agent] = {}
            self._state["high_water_marks"][agent] = {
                "balance": high_water_balance,
                "position_size": high_water_position,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            self._save_state()
            logger.info(f"[RiskControl] {agent} 新高水位: ${high_water_balance:.2f}, 仓位 ${high_water_position:.2f}")

        # 计算回撤
        drawdown_pct = (high_water_balance - current_balance) / high_water_balance * 100

        # 决定最终仓位
        if drawdown_pct < self.position_rule.high_water_unlock_drawdown_pct:
            # 回撤未超过阈值，使用高水位仓位
            final_position = high_water_position
        else:
            # 回撤超过阈值，允许降低仓位
            final_position = current_position
            logger.warning(f"[RiskControl] {agent} 回撤 {drawdown_pct:.1f}% 超过阈值，允许降低仓位")

        # 根据信号评分微调（80-100 分对应 0.9-1.1 倍）
        score_multiplier = 0.9 + (signal_score - 80) / 100
        final_position *= score_multiplier

        # 限制最大仓位
        max_position = current_balance * self.position_rule.max_position_pct / 100
        final_position = min(final_position, max_position)

        return round(final_position, 2)

    # ==================== 数据新鲜度 ====================

    def check_freshness(
        self,
        data_timestamp: float,
        timeframe: str = "5m",
    ) -> Tuple[bool, Optional[str]]:
        """
        检查数据新鲜度

        Args:
            data_timestamp: 数据时间戳（Unix 秒）
            timeframe: 时间周期

        Returns:
            (is_fresh, reason)
        """
        now = time.time()
        max_age = self.freshness_rule.max_age_by_timeframe.get(timeframe, 1800)
        age = now - data_timestamp

        if age > max_age:
            return False, f"数据过期 {int(age)}s > {max_age}s ({timeframe})"

        return True, None

    def get_max_age(self, timeframe: str) -> int:
        """获取指定周期的最大数据年龄"""
        return self.freshness_rule.max_age_by_timeframe.get(timeframe, 1800)

    # ==================== 统计 ====================

    def get_stats(self) -> Dict:
        """获取风控统计"""
        return {
            "cooldowns": self._state.get("cooldowns", {}),
            "high_water_marks": self._state.get("high_water_marks", {}),
            "daily_stats": self._state.get("daily_stats", {}),
            "rules": {
                "cooldown": {
                    "consecutive_loss_threshold": self.cooldown_rule.consecutive_loss_threshold,
                    "cooldown_minutes": self.cooldown_rule.cooldown_minutes,
                    "daily_loss_pct_threshold": self.cooldown_rule.daily_loss_pct_threshold,
                },
                "position": {
                    "base_position_pct": self.position_rule.base_position_pct,
                    "max_position_pct": self.position_rule.max_position_pct,
                    "high_water_unlock_drawdown_pct": self.position_rule.high_water_unlock_drawdown_pct,
                },
                "freshness": self.freshness_rule.max_age_by_timeframe,
            }
        }


# 全局实例
_controller: Optional[RiskController] = None


def get_risk_controller() -> RiskController:
    """获取全局风控控制器"""
    global _controller
    if _controller is None:
        _controller = RiskController()
    return _controller


# 便捷函数
def check_cooldown(agent: str, symbol: str) -> Tuple[bool, Optional[str]]:
    """检查冷却"""
    return get_risk_controller().check_cooldown(agent, symbol)


def calculate_position(agent: str, signal_score: int = 80) -> float:
    """计算仓位"""
    return get_risk_controller().calculate_position(agent, signal_score)


def check_freshness(data_timestamp: float, timeframe: str = "5m") -> Tuple[bool, Optional[str]]:
    """检查数据新鲜度"""
    return get_risk_controller().check_freshness(data_timestamp, timeframe)


__all__ = [
    "RiskController",
    "get_risk_controller",
    "check_cooldown",
    "calculate_position",
    "check_freshness",
]

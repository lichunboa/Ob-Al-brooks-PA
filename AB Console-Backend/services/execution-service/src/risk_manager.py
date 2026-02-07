"""
风控管理器
"""
import json
import logging
from datetime import datetime, date
from pathlib import Path
from typing import Optional

from .config import MAX_DAILY_LOSS_USDT, MAX_POSITION_SIZE_USDT, MAX_LEVERAGE, EMERGENCY_STOP
from .models import RiskStatus

logger = logging.getLogger(__name__)


class RiskManager:
    """风控管理器"""

    def __init__(self, state_file: Optional[Path] = None):
        self.state_file = state_file or Path("/tmp/execution_risk_state.json")
        self.emergency_stop = EMERGENCY_STOP
        self.max_daily_loss = MAX_DAILY_LOSS_USDT
        self.max_position_size = MAX_POSITION_SIZE_USDT
        self.max_leverage = MAX_LEVERAGE

        # 加载状态
        self._load_state()

    def _load_state(self):
        """加载风控状态"""
        self.daily_pnl = 0.0
        self.last_reset_date = date.today()

        if self.state_file.exists():
            try:
                with open(self.state_file) as f:
                    state = json.load(f)
                    saved_date = datetime.fromisoformat(state.get("last_reset_date", "")).date()
                    if saved_date == date.today():
                        self.daily_pnl = state.get("daily_pnl", 0.0)
                    self.emergency_stop = state.get("emergency_stop", EMERGENCY_STOP)
            except Exception as e:
                logger.warning(f"加载风控状态失败: {e}")

    def _save_state(self):
        """保存风控状态"""
        try:
            state = {
                "daily_pnl": self.daily_pnl,
                "last_reset_date": date.today().isoformat(),
                "emergency_stop": self.emergency_stop,
            }
            with open(self.state_file, "w") as f:
                json.dump(state, f)
        except Exception as e:
            logger.error(f"保存风控状态失败: {e}")

    def check_can_open(self, position_size_usdt: float, current_positions: int = 0) -> tuple[bool, str]:
        """检查是否可以开仓"""
        # 1. 紧急停止
        if self.emergency_stop:
            return False, "紧急停止已启用，禁止开仓"

        # 2. 每日亏损限制
        remaining = self.max_daily_loss + self.daily_pnl  # daily_pnl 为负时表示亏损
        if remaining <= 0:
            return False, f"已达每日亏损限制 ${self.max_daily_loss}"

        # 3. 单笔仓位限制
        if position_size_usdt > self.max_position_size:
            return False, f"仓位 ${position_size_usdt} 超过限制 ${self.max_position_size}"

        # 4. 最大持仓数（可选）
        max_positions = 5
        if current_positions >= max_positions:
            return False, f"已达最大持仓数 {max_positions}"

        return True, "OK"

    def check_leverage(self, leverage: int) -> tuple[bool, str]:
        """检查杠杆是否合规"""
        if leverage > self.max_leverage:
            return False, f"杠杆 {leverage}x 超过限制 {self.max_leverage}x"
        return True, "OK"

    def record_pnl(self, pnl: float):
        """记录盈亏"""
        self.daily_pnl += pnl
        self._save_state()

        # 自动触发紧急停止
        if self.daily_pnl <= -self.max_daily_loss:
            self.emergency_stop = True
            self._save_state()
            logger.warning(f"触发紧急停止: 每日亏损 ${abs(self.daily_pnl)} 达到限制")

    def set_emergency_stop(self, enabled: bool):
        """设置紧急停止"""
        self.emergency_stop = enabled
        self._save_state()
        logger.info(f"紧急停止已{'启用' if enabled else '禁用'}")

    def get_status(self, open_positions: int = 0) -> RiskStatus:
        """获取风控状态"""
        remaining = max(0, self.max_daily_loss + self.daily_pnl)
        can_open = not self.emergency_stop and remaining > 0

        return RiskStatus(
            emergency_stop=self.emergency_stop,
            daily_pnl=self.daily_pnl,
            daily_loss_limit=self.max_daily_loss,
            remaining_loss_budget=remaining,
            open_positions=open_positions,
            max_position_size=self.max_position_size,
            can_open_new_position=can_open,
        )

    def reset_daily(self):
        """重置每日统计（通常在每天开始时调用）"""
        if self.last_reset_date != date.today():
            self.daily_pnl = 0.0
            self.last_reset_date = date.today()
            # 不自动解除紧急停止，需要手动解除
            self._save_state()
            logger.info("每日风控统计已重置")

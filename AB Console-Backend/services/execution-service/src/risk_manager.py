"""
风控管理器 V2.8.0

变更:
- 状态文件迁移到持久化路径
- 新增 per-bot 日盈亏追踪
- 新增同品种冷却期检查
"""
import json
import logging
import time
from datetime import datetime, date
from pathlib import Path
from typing import Optional

from .config import (
    MAX_DAILY_LOSS_USDT, MAX_POSITION_SIZE_USDT,
    MAX_LEVERAGE, EMERGENCY_STOP,
)
from .models import RiskStatus

logger = logging.getLogger(__name__)

# 持久化路径（不再用 /tmp）
DEFAULT_STATE_FILE = (
    Path.home() / ".openclaw" / "workspace" / "risk_state.json"
)


class RiskManager:
    """风控管理器"""

    def __init__(self, state_file: Optional[Path] = None):
        self.state_file = state_file or DEFAULT_STATE_FILE
        self.emergency_stop = EMERGENCY_STOP
        self.max_daily_loss = MAX_DAILY_LOSS_USDT
        self.max_position_size = MAX_POSITION_SIZE_USDT
        self.max_leverage = MAX_LEVERAGE

        # 加载状态
        self._load_state()

    def _load_state(self):
        """加载风控状态"""
        self.daily_pnl = 0.0
        self.bot_daily_pnl: dict[str, float] = {}
        self.bot_trade_times: dict[str, dict[str, float]] = {}
        self.last_reset_date = date.today()

        if self.state_file.exists():
            try:
                with open(self.state_file) as f:
                    state = json.load(f)
                    saved = state.get("last_reset_date", "")
                    saved_date = datetime.fromisoformat(
                        saved
                    ).date()
                    if saved_date == date.today():
                        self.daily_pnl = state.get(
                            "daily_pnl", 0.0
                        )
                        self.bot_daily_pnl = state.get(
                            "bot_daily_pnl", {}
                        )
                    self.emergency_stop = state.get(
                        "emergency_stop", EMERGENCY_STOP
                    )
                    self.bot_trade_times = state.get(
                        "bot_trade_times", {}
                    )
            except Exception as e:
                logger.warning(f"加载风控状态失败: {e}")

    def _save_state(self):
        """保存风控状态"""
        try:
            self.state_file.parent.mkdir(
                parents=True, exist_ok=True
            )
            state = {
                "daily_pnl": self.daily_pnl,
                "bot_daily_pnl": self.bot_daily_pnl,
                "bot_trade_times": self.bot_trade_times,
                "last_reset_date": date.today().isoformat(),
                "emergency_stop": self.emergency_stop,
            }
            with open(self.state_file, "w") as f:
                json.dump(state, f, indent=2)
        except Exception as e:
            logger.error(f"保存风控状态失败: {e}")

    def check_can_open(
        self,
        position_size_usdt: float,
        current_positions: int = 0,
        max_positions: int = 10,
        daily_loss_limit: float = 0,
        bot_id: str = "",
    ) -> tuple[bool, str]:
        """检查是否可以开仓

        Args:
            daily_loss_limit: per-bot 动态日亏限（已由调用方计算好）
        """
        if self.emergency_stop:
            return False, "紧急停止已启用，禁止开仓"

        # 全局日亏损检查
        remaining = self.max_daily_loss + self.daily_pnl
        if remaining <= 0:
            return (
                False,
                f"已达全局每日亏损限制 ${self.max_daily_loss}",
            )

        # per-bot 日亏损检查
        if daily_loss_limit > 0 and bot_id:
            bot_pnl = self.bot_daily_pnl.get(bot_id, 0.0)
            if bot_pnl <= -daily_loss_limit:
                return (
                    False,
                    f"Bot {bot_id} 已达日亏限 ${daily_loss_limit:.0f} (当前 ${bot_pnl:.2f})",
                )

        if position_size_usdt > self.max_position_size:
            return (
                False,
                f"仓位 ${position_size_usdt} "
                f"超过限制 ${self.max_position_size}",
            )

        if current_positions >= max_positions:
            return (
                False,
                f"已达最大持仓数 {max_positions}",
            )

        return True, "OK"

    def check_leverage(
        self, leverage: int
    ) -> tuple[bool, str]:
        """检查杠杆是否合规"""
        if leverage > self.max_leverage:
            return (
                False,
                f"杠杆 {leverage}x 超过限制 "
                f"{self.max_leverage}x",
            )
        return True, "OK"

    def record_pnl(self, pnl: float):
        """记录全局盈亏"""
        self.daily_pnl += pnl
        self._save_state()

        if self.daily_pnl <= -self.max_daily_loss:
            self.emergency_stop = True
            self._save_state()
            logger.warning(
                f"触发紧急停止: 每日亏损 "
                f"${abs(self.daily_pnl)} 达到限制"
            )

    # ===== V2.8.0 per-bot 盈亏追踪 =====

    def record_bot_pnl(self, bot_id: str, pnl: float):
        """记录 per-bot 盈亏"""
        current = self.bot_daily_pnl.get(bot_id, 0.0)
        self.bot_daily_pnl[bot_id] = current + pnl
        # 同时更新全局
        self.record_pnl(pnl)

    def get_bot_daily_pnl(self, bot_id: str) -> float:
        """获取 bot 今日盈亏"""
        return self.bot_daily_pnl.get(bot_id, 0.0)

    def check_bot_daily_limit(
        self, bot_id: str, limit: float
    ) -> tuple[bool, float]:
        """检查 bot 是否超过日亏损限额"""
        pnl = self.get_bot_daily_pnl(bot_id)
        remaining = limit + pnl  # pnl 为负时表示亏损
        return remaining > 0, remaining

    # ===== V2.8.0 同品种冷却期 =====

    def record_trade_time(
        self, bot_id: str, symbol: str
    ):
        """记录交易时间（用于冷却期检查）"""
        if bot_id not in self.bot_trade_times:
            self.bot_trade_times[bot_id] = {}
        self.bot_trade_times[bot_id][symbol] = time.time()
        self._save_state()

    def check_cooldown(
        self,
        bot_id: str,
        symbol: str,
        cooldown_minutes: int,
    ) -> tuple[bool, int]:
        """
        检查同品种冷却期

        Returns:
            (is_cooled, remaining_seconds)
            is_cooled=True 表示冷却完毕可交易
        """
        bot_times = self.bot_trade_times.get(bot_id, {})
        last_trade = bot_times.get(symbol, 0)
        if last_trade == 0:
            return True, 0

        elapsed = time.time() - last_trade
        cooldown_sec = cooldown_minutes * 60
        if elapsed >= cooldown_sec:
            return True, 0
        return False, int(cooldown_sec - elapsed)

    def set_emergency_stop(self, enabled: bool):
        """设置紧急停止"""
        self.emergency_stop = enabled
        self._save_state()
        logger.info(
            f"紧急停止已{'启用' if enabled else '禁用'}"
        )

    def get_status(
        self, open_positions: int = 0
    ) -> RiskStatus:
        """获取风控状态"""
        remaining = max(
            0, self.max_daily_loss + self.daily_pnl
        )
        can_open = (
            not self.emergency_stop and remaining > 0
        )

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
        """重置每日统计"""
        if self.last_reset_date != date.today():
            self.daily_pnl = 0.0
            self.bot_daily_pnl = {}
            self.last_reset_date = date.today()
            self._save_state()
            logger.info("每日风控统计已重置")

    def check_correlation(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
        existing_positions: list,
        total_balance: float,
    ) -> tuple[bool, str]:
        """检查跨品种相关性暴露 (BTC/ETH/SOL/BNB)"""
        # 相关资产定义
        CORRELATED_ASSETS = {'BTC', 'ETH', 'SOL', 'BNB'}

        # 提取基础资产名 (SOL/USDT:USDT -> SOL)
        base_asset = symbol.split('/')[0] if '/' in symbol else symbol.replace('USDT', '')
        if ':' in base_asset:
            base_asset = base_asset.split(':')[0]

        if base_asset not in CORRELATED_ASSETS:
            return True, "Not correlated asset"

        # 计算拟开仓位价值和方向
        new_value = quantity * price
        # Normalize side to 1 (Long) or -1 (Short)
        # OrderSide / PositionSide could be Enum or str
        side_str = str(side).upper()
        if hasattr(side, 'value'):
            side_str = side.value.upper()

        new_dir = 1 if side_str in ['BUY', 'LONG'] else -1

        # 累加现有相关持仓的带方向价值
        total_exposure_value = new_value * new_dir

        for pos in existing_positions:
            p_raw = pos.symbol
            p_base = p_raw.split('/')[0] if '/' in p_raw else p_raw.replace('USDT', '')
            if ':' in p_base:
                p_base = p_base.split(':')[0]

            if p_base in CORRELATED_ASSETS:
                p_val = pos.quantity * pos.mark_price
                # PositionSide.LONG / SHORT
                p_side_str = str(pos.side).upper()
                if hasattr(pos.side, 'value'):
                    p_side_str = pos.side.value.upper()

                p_dir = 1 if p_side_str in ['LONG', 'BUY'] else -1
                total_exposure_value += p_val * p_dir

        # 计算净暴露占余额比例
        net_exposure = abs(total_exposure_value)
        if total_balance > 0:
            ratio = net_exposure / total_balance
            if ratio > 0.55:  # 55% 阈值（V3.9: 与 signal-router 对齐）
                return False, f"相关性暴露过高: {base_asset}系列净暴露 ${net_exposure:.0f} ({ratio*100:.1f}%) > 55%"

        return True, "OK"


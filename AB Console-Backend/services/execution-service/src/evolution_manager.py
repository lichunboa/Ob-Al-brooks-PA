"""
进化系统管理器 V2.8.0

功能:
- 读取/更新 bot 进化配置
- 记录交易结果 → 自动更新策略权重
- 冷却期保护：权重 < 50 时冻结 10 笔观察
- Agent 只读，后端自动更新

作者: AL Brooks Trading Console
版本: 2.8.0
"""
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

SHARED_WORKSPACE = (
    Path.home() / ".openclaw" / "workspaces"
    / "trading-shared"
)

# bot_id → evolution 文件名映射
EVOLUTION_FILES = {
    "al-brooks": "al_brooks_evolution.json",
    "trader": "quant_evolution.json",
    "wyckoff": "wyckoff_evolution.json",
}

# 权重调整参数
WIN_BONUS = 2       # 赢 +2
LOSS_PENALTY = -3   # 输 -3
WEIGHT_MIN = 30     # 最低权重
WEIGHT_MAX = 100    # 最高权重
COOLDOWN_THRESHOLD = 50   # 低于此值进入冷却
COOLDOWN_TRADES = 10      # 冷却观察笔数


class EvolutionManager:
    """进化系统管理器"""

    def _get_path(self, bot_id: str) -> Optional[Path]:
        """获取进化文件路径"""
        filename = EVOLUTION_FILES.get(bot_id)
        if not filename:
            return None
        return SHARED_WORKSPACE / filename

    def load_evolution(
        self, bot_id: str
    ) -> Optional[dict]:
        """读取进化配置"""
        path = self._get_path(bot_id)
        if not path or not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(
                f"读取 {bot_id} 进化配置失败: {e}"
            )
            return None

    def _save_evolution(
        self, bot_id: str, data: dict
    ) -> bool:
        """保存进化配置"""
        path = self._get_path(bot_id)
        if not path:
            return False
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(
                    data, f, indent=2,
                    ensure_ascii=False,
                )
            return True
        except Exception as e:
            logger.error(
                f"保存 {bot_id} 进化配置失败: {e}"
            )
            return False

    def record_trade_result(
        self,
        bot_id: str,
        strategy: str,
        symbol: str,
        pnl: float,
        is_win: bool,
    ) -> dict:
        """
        记录交易结果并自动更新权重

        Returns:
            {"updated": bool, "strategy": str,
             "old_weight": int, "new_weight": int,
             "cooldown": bool}
        """
        data = self.load_evolution(bot_id)
        if not data:
            return {"updated": False, "error": "无进化配置"}

        weights = data.get("strategy_weights", {})
        result = {
            "updated": False,
            "strategy": strategy,
            "old_weight": 0,
            "new_weight": 0,
            "cooldown": False,
        }

        if strategy not in weights:
            # 新策略，初始化
            weights[strategy] = {
                "weight": 70,
                "trades": 0,
                "wins": 0,
                "losses": 0,
                "scratches": 0,
                "net_profit": 0.0,
                "trend": "neutral",
                "notes": "",
            }

        sw = weights[strategy]
        result["old_weight"] = sw["weight"]

        # 更新统计
        sw["trades"] = sw.get("trades", 0) + 1
        if is_win:
            sw["wins"] = sw.get("wins", 0) + 1
        else:
            sw["losses"] = sw.get("losses", 0) + 1
        sw["net_profit"] = (
            sw.get("net_profit", 0.0) + pnl
        )

        # 冷却期检查
        cooldown_since = sw.get("_cooldown_since", 0)
        if cooldown_since > 0:
            remaining = (
                cooldown_since + COOLDOWN_TRADES
                - sw["trades"]
            )
            if remaining > 0:
                # 仍在冷却期，不调整权重
                result["new_weight"] = sw["weight"]
                result["cooldown"] = True
                sw["_cooldown_remaining"] = remaining
            else:
                # 冷却期结束
                del sw["_cooldown_since"]
                sw.pop("_cooldown_remaining", None)

        if not result["cooldown"]:
            # 调整权重
            delta = WIN_BONUS if is_win else LOSS_PENALTY
            new_w = sw["weight"] + delta
            new_w = max(WEIGHT_MIN, min(WEIGHT_MAX, new_w))
            sw["weight"] = new_w
            result["new_weight"] = new_w

            # 检查是否需要进入冷却
            if new_w < COOLDOWN_THRESHOLD:
                sw["_cooldown_since"] = sw["trades"]
                sw["_cooldown_remaining"] = COOLDOWN_TRADES
                result["cooldown"] = True
                logger.info(
                    f"[{bot_id}] 策略 '{strategy}' "
                    f"权重 {new_w} < {COOLDOWN_THRESHOLD}，"
                    f"进入冷却期 ({COOLDOWN_TRADES} 笔)"
                )

        # 更新趋势
        if sw["trades"] >= 3:
            recent_wr = (
                sw["wins"] / sw["trades"]
                if sw["trades"] > 0 else 0
            )
            if recent_wr >= 0.6:
                sw["trend"] = "up"
            elif recent_wr <= 0.3:
                sw["trend"] = "down"
            else:
                sw["trend"] = "neutral"

        # 更新品种偏好
        sym_prefs = data.get("symbol_preferences", {})
        if symbol not in sym_prefs:
            sym_prefs[symbol] = {
                "enabled": True,
                "weight": 70,
                "trades": 0,
                "net_profit": 0.0,
                "trend": "neutral",
            }
        sp = sym_prefs[symbol]
        sp["trades"] = sp.get("trades", 0) + 1
        sp["net_profit"] = (
            sp.get("net_profit", 0.0) + pnl
        )

        data["strategy_weights"] = weights
        data["symbol_preferences"] = sym_prefs
        result["updated"] = self._save_evolution(
            bot_id, data
        )
        return result

    def get_evolution_summary(
        self, bot_id: str
    ) -> Optional[dict]:
        """
        返回只读摘要给 agent / Web

        Returns:
            {
                "growth_stage": str,
                "total_trades": int,
                "top_strategies": [...],
                "cooldown_strategies": [...],
                "symbol_stats": {...},
            }
        """
        data = self.load_evolution(bot_id)
        if not data:
            return None

        weights = data.get("strategy_weights", {})
        sym_prefs = data.get("symbol_preferences", {})
        growth = data.get("growth_stage", {})

        # 按权重排序策略
        sorted_strats = sorted(
            weights.items(),
            key=lambda x: x[1].get("weight", 0),
            reverse=True,
        )

        total_trades = sum(
            s.get("trades", 0)
            for s in weights.values()
        )

        top = [
            {
                "name": name,
                "weight": s["weight"],
                "trades": s.get("trades", 0),
                "wins": s.get("wins", 0),
                "trend": s.get("trend", "neutral"),
            }
            for name, s in sorted_strats[:5]
        ]

        cooldowns = [
            {
                "name": name,
                "weight": s["weight"],
                "remaining": s.get(
                    "_cooldown_remaining", 0
                ),
            }
            for name, s in weights.items()
            if s.get("_cooldown_since", 0) > 0
        ]

        return {
            "growth_stage": growth.get(
                "current", "unknown"
            ),
            "total_trades": total_trades,
            "top_strategies": top,
            "cooldown_strategies": cooldowns,
            "symbol_stats": {
                sym: {
                    "trades": sp.get("trades", 0),
                    "net_profit": sp.get(
                        "net_profit", 0.0
                    ),
                    "weight": sp.get("weight", 70),
                }
                for sym, sp in sym_prefs.items()
            },
        }


# 单例
_evolution_manager: Optional[EvolutionManager] = None


def get_evolution_manager() -> EvolutionManager:
    """获取进化系统管理器单例"""
    global _evolution_manager
    if _evolution_manager is None:
        _evolution_manager = EvolutionManager()
    return _evolution_manager

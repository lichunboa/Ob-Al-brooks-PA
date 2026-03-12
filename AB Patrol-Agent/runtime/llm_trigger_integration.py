"""LLM 触发判定入口。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from llm_trigger_manager import get_trigger_manager


def _load_bool_flag(env_file: Path, key: str, default: bool = False) -> bool:
    """从本地 `.env` 中读取布尔开关。"""
    if not env_file.exists():
        return default

    prefix = f"{key}="
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or not line.startswith(prefix):
            continue
        return line.split("=", 1)[1].strip().lower() in {"1", "true", "yes", "on"}
    return default


def should_use_llm(
    phase_plan: dict[str, Any],
    execution: dict[str, Any],
    market_cache: dict[str, Any],
    runtime: dict[str, Any],
) -> tuple[bool, str]:
    """判断当前这轮是否应当调用 LLM。"""
    env_file = Path(__file__).parent.parent / "config" / ".env"
    force_llm = _load_bool_flag(env_file, "AB_PATROL_FORCE_LLM")
    rule_engine_priority = _load_bool_flag(env_file, "AB_PATROL_RULE_ENGINE_PRIORITY")
    trigger_optimization = _load_bool_flag(env_file, "AB_PATROL_LLM_TRIGGER_OPTIMIZATION")

    if force_llm:
        return True, "强制 LLM 模式"

    if rule_engine_priority:
        return False, "规则引擎优先模式"

    if trigger_optimization:
        trigger_manager = get_trigger_manager()
        should_trigger, reason = trigger_manager.should_trigger_llm(
            phase=phase_plan.get("phase", ""),
            execution=execution,
            market_cache=market_cache,
            runtime=runtime,
        )
        if should_trigger:
            trigger_manager.record_llm_call()
            return True, f"智能触发: {reason}"
        trigger_manager.record_rule_engine_call()
        return False, f"规则引擎: {reason}"

    return True, "默认 LLM 模式"


def get_trigger_statistics() -> dict[str, Any]:
    """获取触发统计"""
    trigger_manager = get_trigger_manager()
    return trigger_manager.get_statistics()

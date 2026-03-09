"""
LLM 触发集成补丁

将 LLMTriggerManager 集成到 pa_runtime.py 的 run_cycle 方法中。

使用方法：
1. 在 pa_runtime.py 的 run_cycle 方法开始处导入
2. 替换现有的规则引擎优先逻辑
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from llm_trigger_manager import get_trigger_manager


def should_use_llm(
    phase_plan: dict[str, Any],
    execution: dict[str, Any],
    market_cache: dict[str, Any],
    runtime: dict[str, Any],
) -> tuple[bool, str]:
    """
    判断是否应该使用 LLM
    
    集成了三种模式：
    1. 强制 LLM 模式（AB_PATROL_FORCE_LLM=1）
    2. 规则引擎优先模式（AB_PATROL_RULE_ENGINE_PRIORITY=1）
    3. 智能触发模式（AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1）
    
    Returns:
        (should_use_llm, reason)
    """
    # 读取配置
    env_file = Path(__file__).parent.parent / "config" / ".env"
    force_llm = False
    rule_engine_priority = False
    trigger_optimization = False
    
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("AB_PATROL_FORCE_LLM="):
                force_llm = line.split("=", 1)[1].strip() in {"1", "true", "TRUE", "yes"}
            elif line.startswith("AB_PATROL_RULE_ENGINE_PRIORITY="):
                rule_engine_priority = line.split("=", 1)[1].strip() in {"1", "true", "TRUE", "yes"}
            elif line.startswith("AB_PATROL_LLM_TRIGGER_OPTIMIZATION="):
                trigger_optimization = line.split("=", 1)[1].strip() in {"1", "true", "TRUE", "yes"}
    
    # 模式 1：强制 LLM（调试用）
    if force_llm:
        return True, "强制 LLM 模式"
    
    # 模式 2：规则引擎优先（完全跳过 LLM）
    if rule_engine_priority:
        return False, "规则引擎优先模式"
    
    # 模式 3：智能触发（默认）
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
        else:
            trigger_manager.record_rule_engine_call()
            return False, f"规则引擎: {reason}"
    
    # 默认：使用 LLM（兼容旧行为）
    return True, "默认 LLM 模式"


def get_trigger_statistics() -> dict[str, Any]:
    """获取触发统计"""
    trigger_manager = get_trigger_manager()
    return trigger_manager.get_statistics()


# 集成示例代码（在 pa_runtime.py 的 run_cycle 方法中使用）
INTEGRATION_EXAMPLE = """
# 在 run_cycle 方法的 line 5683 附近，替换现有逻辑：

if not decision:
    # 导入触发集成
    from llm_trigger_integration import should_use_llm
    
    # 判断是否使用 LLM
    use_llm, trigger_reason = should_use_llm(
        phase_plan=phase_plan,
        execution=execution,
        market_cache=market_cache,
        runtime=runtime,
    )
    
    if use_llm:
        # 使用 LLM
        LOG.info(f"[LLM_TRIGGER] {trigger_reason}")
        system_text, user_text, ref_names, analysis_board, quick_scan_events, knowledge_meta = self.build_prompt_from_context(
            runtime,
            market_cache,
            execution,
            trigger,
            phase_plan,
            prepared,
        )
        try:
            payload, response_text, provider_meta = self.invoke_decision_provider(
                system_text,
                user_text,
            )
            try:
                decision = self.extract_decision(response_text)
            except json.JSONDecodeError as exc:
                LOG.warning("decision json malformed, attempting repair: %s", exc)
                decision = self.repair_decision_json(response_text, exc)
        except RuntimeError as exc:
            if "timeout" not in str(exc).lower():
                raise
            LOG.warning("decision provider timed out, using fallback decision: %s", exc)
            decision = self.timeout_fallback_decision(
                runtime,
                market_cache,
                execution,
                phase_plan,
                analysis_board,
                quick_scan_events,
                exc,
            )
    else:
        # 使用规则引擎
        LOG.info(f"[RULE_ENGINE] {trigger_reason}")
        decision = self.rule_engine_decision(
            runtime,
            market_cache,
            execution,
            phase_plan,
            analysis_board,
            quick_scan_events,
        )
"""

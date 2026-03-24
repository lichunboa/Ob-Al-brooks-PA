export type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function profileStageLabel(key: string): string {
  const mapping: Record<string, string> = {
    load_runtime_market_cache_ms: '加载运行态/市场缓存',
    execution_snapshot_ms: '拉取执行快照',
    sync_followup_phase_plan_ms: '同步持仓管理/选择阶段',
    prepare_prompt_context_ms: '准备上下文',
    prepare_fetch_base_market_ms: '快扫-基础行情',
    prepare_quick_scan_ms: '快扫-事件构建',
    prepare_deep_context_ms: '深挖-AB上下文',
    prepare_chart_context_ms: '深挖-图表上下文',
    prepare_build_board_ms: '组装分析面板',
    decision_pipeline_ms: '决策链路',
    hydrate_scope_actions_ms: '动作标准化/策略过滤',
    execute_actions_ms: '执行动作',
    post_execution_state_sync_ms: '执行后同步状态',
    write_runtime_state_ms: '回写运行态',
    notifications_ms: '通知/TG',
  };
  return mapping[key] || key;
}

export function normalizeProfiling(latestCycle: UnknownRecord, runtime: UnknownRecord) {
  const profile = asRecord(latestCycle.profile);
  const runtimeProfile = asRecord(runtime.last_cycle_profile);
  const activeProfile = Object.keys(profile).length > 0 ? profile : runtimeProfile;
  const stages = Object.entries(asRecord(activeProfile.stages_ms))
    .map(([key, value]) => ({
      key,
      label: profileStageLabel(key),
      ms: asNumber(value) ?? 0,
    }))
    .filter((item) => item.ms > 0)
    .sort((left, right) => right.ms - left.ms);
  return {
    totalMs: asNumber(activeProfile.total_ms),
    stages,
  };
}

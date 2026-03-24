export function formatTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatMoney(value: number | null, asset = 'USD'): string {
  if (value === null || Number.isNaN(value)) return '-';
  return `${asset} ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return '-';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return '未记录';
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  if (minutes > 0) return `${minutes}分钟 ${secs}秒`;
  return `${secs}秒`;
}

function translateWithCode(label: string, code?: string | null): string {
  if (!code) return label;
  return `${label} / ${code}`;
}

function prettifyCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function translateHealthLabel(value: string): string {
  const code = value?.trim().toUpperCase();
  const mapping: Record<string, string> = {
    HEALTHY: '健康',
    DEGRADED: '降级',
    DOWN: '离线',
    UNKNOWN: '未知',
  };
  return translateWithCode(mapping[code] || prettifyCode(code || '-'), code || undefined);
}

export function translatePhaseLabel(value: string): string {
  const code = value?.trim().toUpperCase();
  const mapping: Record<string, string> = {
    BOOTSTRAP: '初始化扫描',
    SCAN: '全市场扫描',
    FOLLOWUP: '持仓跟踪',
    MANAGE: '持仓管理',
    EXECUTE: '执行链',
  };
  return translateWithCode(mapping[code] || prettifyCode(code || '-'), code || undefined);
}

export function translateTradeReadiness(value: string): string {
  const code = value?.trim();
  const mapping: Record<string, string> = {
    can_trade_true: '可交易',
    can_trade_false: '不可交易',
    waiting: '等待中',
    blocked: '阻塞',
  };
  return translateWithCode(mapping[code] || prettifyCode(code || '-'), code || undefined);
}

export function translateStatusLabel(value: string): string {
  const code = value?.trim();
  const lowered = code.toLowerCase();
  const mapping: Record<string, string> = {
    watching: '观察中',
    candidate: '候选中',
    entry_ready: '候选就绪',
    entry_ready_blocked: '候选阻塞',
    executable: '可执行',
    log_only: '仅记录',
    no_action: '无动作',
    skipped: '已跳过',
    pass: '通过等待',
    blocked: '阻塞',
    manage: '持仓管理',
    manage_position: '持仓管理',
    open_order: '已发委托',
    open: '挂单中',
    placed: '已提交',
    new: '新委托',
    closed: '已成交',
    modified: '已修改',
    cancelled: '已撤销',
    validation_rejected: '校验拒绝',
    size_failed: '仓位失败',
    failed: '执行失败',
    rejected: '已拒绝',
    unsupported: '不支持',
    dry_run_validated: '纸面通过',
  };
  return translateWithCode(mapping[lowered] || prettifyCode(code || '-'), code || undefined);
}

export function translateMarketStateLabel(value: string): string {
  const code = value?.trim().toUpperCase();
  const mapping: Record<string, string> = {
    TR: '区间',
    BO: '突破',
    TC: '紧密通道',
    BC: '宽通道',
    SC: '高潮',
  };
  if (!code) return '-';
  return translateWithCode(mapping[code] || prettifyCode(code), code);
}

export function translateSourceLabel(value: string): string {
  const code = value?.trim();
  const mapping: Record<string, string> = {
    fallback: '回退聚合',
    query: '查询聚合',
    runtime: '运行时直读',
  };
  return translateWithCode(mapping[code] || prettifyCode(code || '-'), code || undefined);
}

export function translateStrategyFamilyLabel(value: string): string {
  const raw = value?.trim();
  const upper = raw.toUpperCase();
  if (!raw) return '未识别';
  if (upper === 'H1' || upper === 'L1' || upper.includes('H1/L1')) return 'T1 · H1/L1';
  if (upper === 'H2' || upper === 'L2' || upper.includes('H2/L2')) return 'T2 · H2/L2';
  if (upper === 'MAG' || upper.includes('MAG')) return 'T3 · MAG';
  if (raw.includes('第一均线缺口')) return 'T3 · 第一均线缺口';
  if (raw.includes('20EMA') || raw.includes('均线缺口')) return 'T3 · 20EMA 缺口';
  return raw;
}

export function translateHealthStatusLabel(value: string): string {
  const code = value?.trim();
  const lowered = code.toLowerCase();
  const mapping: Record<string, string> = {
    healthy: '正常',
    ok: '正常',
    degraded: '降级',
    down: '离线',
    service_unavailable: '服务不可用',
  };
  return translateWithCode(mapping[lowered] || prettifyCode(code || '-'), code || undefined);
}

export function marketBucket(symbol: string): string {
  if (symbol.endsWith('USDT')) return '加密';
  if (symbol.includes('US 500') || symbol.includes('US TECH')) return '指数';
  if (symbol === 'XAUUSD' || symbol === 'XAGUSD') return '贵金属';
  return '外汇';
}

export function accountRoleLabel(role?: string): string {
  return role === 'primary' ? '主路由账户' : '辅助路由账户';
}

export function bucketCountsForSymbols(symbols: string[]): Array<{ label: string; count: number }> {
  const counter = new Map<string, number>();
  for (const symbol of symbols) {
    const bucket = marketBucket(symbol);
    counter.set(bucket, (counter.get(bucket) || 0) + 1);
  }
  return Array.from(counter.entries()).map(([label, count]) => ({ label, count }));
}

export function groupSymbolsByBucket(symbols: string[]): Array<{ label: string; symbols: string[] }> {
  const groups = new Map<string, string[]>();
  for (const symbol of symbols) {
    const bucket = marketBucket(symbol);
    const current = groups.get(bucket) || [];
    current.push(symbol);
    groups.set(bucket, current);
  }
  return Array.from(groups.entries()).map(([label, bucketSymbols]) => ({ label, symbols: bucketSymbols }));
}

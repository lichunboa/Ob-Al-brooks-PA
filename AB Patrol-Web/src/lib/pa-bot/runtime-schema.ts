export type StrategyCatalogEntry = {
  key: string;
  label: string;
  family: string;
  aliases: string[];
  active: boolean;
  liveEnabled: boolean;
  stageStatus: string;
  deployedVersion: string;
  baselineVersion: string;
};

const STRATEGY_CATALOG: StrategyCatalogEntry[] = [
  {
    key: 'T1_H1_AFTER_BO',
    label: 'T1: H1/L1 after BO',
    family: 'H1/L1',
    aliases: ['T1: H1/L1 after BO', 'H1/L1 首次入场', 'T1_H1_AFTER_BO'],
    active: true,
    liveEnabled: true,
    stageStatus: '正式运行',
    deployedVersion: 'live',
    baselineVersion: 'live',
  },
  {
    key: 'T2_TREND_H2',
    label: 'T2: H2/L2 trend second entry',
    family: 'H2/L2',
    aliases: ['T2: H2/L2 trend second entry', 'H2/L2 二次入场', 'TREND SECOND ENTRY', 'T2_TREND_H2'],
    active: true,
    liveEnabled: true,
    stageStatus: '正式运行',
    deployedVersion: 'live',
    baselineVersion: 'live',
  },
  {
    key: 'T2_BROAD_CHANNEL_RECOVERY',
    label: 'T2: H2/L2 broad channel recovery',
    family: 'H2/L2',
    aliases: ['T2: H2/L2 broad channel recovery', 'H2/L2 宽通道恢复', 'BROAD CHANNEL RECOVERY', 'T2_BROAD_CHANNEL_RECOVERY'],
    active: true,
    liveEnabled: true,
    stageStatus: '正式运行',
    deployedVersion: 'live',
    baselineVersion: 'live',
  },
  {
    key: 'T3_MAG_2020_SETUP',
    label: 'T3: MAG 20/20 setup',
    family: 'MAG',
    aliases: ['T3: MAG 20/20 setup', 'MAG 20/20 SETUP', 'EMA_GAP_MAG_FINAL_LEG', 'EMA_GAP_MAG_LEG_BASE', 'EMA_GAP_MAG_WAIT_LL_LH', 'MAG'],
    active: true,
    liveEnabled: true,
    stageStatus: '阶段可用',
    deployedVersion: 'v50',
    baselineVersion: 'v57',
  },
  {
    key: 'T3_EMA_GAP_CONTINUATION',
    label: 'T3: 20EMA gap continuation',
    family: '20EMA 缺口',
    aliases: ['T3: 20EMA gap continuation', '20EMA GAP CONTINUATION', 'EMA_GAP_CONTINUATION', '20均线缺口', '均线缺口'],
    active: false,
    liveEnabled: false,
    stageStatus: '阶段暂停',
    deployedVersion: 'v38',
    baselineVersion: '暂停',
  },
  {
    key: 'T3_FIRST_EMA_GAP_REENTRY',
    label: 'T3: first EMA gap reentry',
    family: '第一均线缺口',
    aliases: ['T3: first EMA gap reentry', 'FIRST EMA GAP REENTRY', 'FIRST_EMA_GAP_REENTRY', '第一均线缺口'],
    active: false,
    liveEnabled: false,
    stageStatus: '已打通未部署',
    deployedVersion: '当前代码版',
    baselineVersion: '当前代码版',
  },
];

export const ACTIVE_RUNTIME_STRATEGIES = STRATEGY_CATALOG.filter((item) => item.active);
export const REGISTERED_RUNTIME_STRATEGIES = STRATEGY_CATALOG;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function upperText(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function matchCatalogItem(values: unknown[]): StrategyCatalogEntry | null {
  const texts = values.map((item) => normalizeText(item)).filter(Boolean);
  const upperTexts = texts.map((item) => item.toUpperCase());
  for (const item of STRATEGY_CATALOG) {
    if (item.aliases.some((alias) => upperTexts.some((text) => text.includes(alias.toUpperCase())))) {
      return item;
    }
  }
  return null;
}

export function familyLabelFromText(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) return '';
  const upper = raw.toUpperCase();

  if (upper.includes('H1/L1') || upper === 'H1' || upper === 'L1') return 'H1/L1';
  if (upper.includes('H2/L2') || upper === 'H2' || upper === 'L2') return 'H2/L2';
  if (upper.includes('MAG')) return 'MAG';
  if (upper.includes('FIRST_EMA_GAP') || raw.includes('第一均线缺口')) return '第一均线缺口';
  if (upper.includes('EMA_GAP') || upper.includes('20EMA') || raw.includes('20均线缺口') || raw.includes('均线缺口')) return '20EMA 缺口';
  return '';
}

export function inferFamilyFromSignals(values: unknown[]): string {
  const matched = matchCatalogItem(values);
  if (matched) return matched.family;
  for (const value of values) {
    const family = familyLabelFromText(value);
    if (family) return family;
  }
  return '';
}

export function detectStrategyFamily(input: {
  signalType?: unknown;
  brooksLabel?: unknown;
  managementTemplate?: unknown;
  playbookFamily?: unknown;
  playbookId?: unknown;
  strategyHint?: unknown;
  rawSignals?: string[];
}): string {
  return inferFamilyFromSignals([
    input.managementTemplate,
    input.playbookFamily,
    input.playbookId,
    input.strategyHint,
    input.signalType,
    input.brooksLabel,
    ...(input.rawSignals || []),
  ]);
}

function isExecutionSemanticText(value: unknown): boolean {
  const raw = normalizeText(value);
  if (!raw) return false;
  const upper = raw.toUpperCase();
  return (
    upper === 'WAIT' ||
    upper === 'WATCH' ||
    upper === 'HOLD' ||
    raw.includes('反转试探') ||
    raw.includes('观察') ||
    raw.includes('等待') ||
    raw.includes('候选')
  );
}

export function looksLikeStrategyText(value: unknown): boolean {
  const raw = normalizeText(value);
  if (!raw || isExecutionSemanticText(raw)) return false;
  const upper = upperText(raw);
  const invalidHints = [
    'BLOCKED',
    'FAILED',
    'REFUSED',
    'TIMEOUT',
    'TIMED OUT',
    'TRIGGER_IMMEDIATELY',
    'LIVE_ENTRY_CONFLICT',
    'VALIDATION_REJECTED',
    'SIZE_FAILED',
    'CAN_TRADE',
    'PARTIAL_CLOSED',
    'PARTIAL_CLOSE',
    'MODIFIED',
    'PROTECTION',
    '当前已有',
    '保护单已',
    '部分平仓成功',
    '超时',
    '生成持仓',
    '持仓管理链',
    '规则引擎:',
    '连接被拒绝',
    '不可达',
    '拒绝',
    '失败',
    '重建',
    'EXISTING_',
  ];
  if (raw.length > 120 || invalidHints.some((hint) => upper.includes(hint))) return false;
  if (/^T\d+\s*:/i.test(raw)) return true;
  if (familyLabelFromText(raw)) return true;
  if (upper.includes('SETUP') || upper.includes('RECOVERY') || raw.includes('均线缺口')) return true;
  return false;
}

export function canonicalStrategyLabel(input: {
  strategy?: unknown;
  signalType?: unknown;
  brooksLabel?: unknown;
  managementTemplate?: unknown;
  playbookFamily?: unknown;
  playbookId?: unknown;
  rawSignals?: string[];
}): string {
  const matched = matchCatalogItem([
    input.strategy,
    input.playbookId,
    input.playbookFamily,
    input.managementTemplate,
    input.signalType,
    input.brooksLabel,
    ...(input.rawSignals || []),
  ]);
  if (matched) return matched.label;

  const family = detectStrategyFamily(input);
  if (family === 'H1/L1') return 'T1: H1/L1';
  if (family === 'H2/L2') return 'T2: H2/L2';
  if (family === 'MAG') return 'T3: MAG';
  if (family === '第一均线缺口') return 'T3: 第一均线缺口';
  if (family === '20EMA 缺口') return 'T3: 20EMA 缺口';

  const raw = normalizeText(input.strategy);
  if (!looksLikeStrategyText(raw)) return '';
  return raw;
}

export function normalizeStrategyLabel(value: string): string {
  return canonicalStrategyLabel({
    strategy: value,
    playbookId: value,
    playbookFamily: value,
    signalType: value,
    rawSignals: value ? [value] : [],
  });
}

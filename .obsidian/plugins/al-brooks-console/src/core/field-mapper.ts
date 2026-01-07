import type { AccountType, NormalizedTag, TradeOutcome } from "./contracts";

export const FIELD_ALIASES = {
  pnl: ["pnl", "net_profit", "净利润/net_profit", "净利润", "盈亏", "收益"],
  r: ["r", "R", "r_value", "r值", "R值"],
  ticker: ["ticker", "symbol", "品种/ticker", "品种", "标的", "代码", "合约"],
  outcome: ["outcome", "result", "结果/outcome", "结果"],
  date: ["date", "日期"],
  accountType: [
    "account_type",
    "accountType",
    "账户类型/account_type",
    "账户类型",
    "账户/account_type",
    "账户",
  ],
  marketCycle: [
    "marketCycleKey",
    "market_cycle_key",
    "cycle",
    "market_cycle",
    "marketCycle",
    "市场周期/market_cycle",
    "市场周期",
  ],
  setupKey: [
    "setup",
    "setupKey",
    "setup_key",
    "设置/setup",
    "设置",
    "形态/setup",
    "形态",
  ],
  setupCategory: [
    "setup_category",
    "setupCategory",
    "设置类别/setup_category",
    "设置类别",
  ],
  patternsObserved: [
    "patterns_observed",
    "patterns",
    "pattern",
    "观察到的形态/patterns_observed",
    "形态/patterns",
    "形态",
  ],
  signalBarQuality: [
    "signal_bar_quality",
    "signal",
    "signalBarQuality",
    "信号K/signal_bar_quality",
    "信号K",
    "信号K质量",
  ],
  timeframe: [
    "tf",
    "timeframe",
    "时间周期/timeframe",
    "时间周期",
    "周期/tf",
    "周期",
  ],
  direction: ["dir", "direction", "方向/direction", "方向/dir", "方向"],
  strategyName: [
    "strategy_name",
    "strategyName",
    "策略名称/strategy_name",
    "策略名称/strategyName",
    "策略名称",
    "策略/strategyName",
    "策略",
  ],
  managementPlan: [
    "management_plan",
    "managementPlan",
    "管理计划/management_plan",
    "管理计划",
  ],
  executionQuality: [
    "execution_quality",
    "executionQuality",
    "执行评价/execution_quality",
    "执行评价",
    "管理错误/management_error",
    "management_error",
    "managementError",
    "管理错误",
  ],
  cover: ["cover", "封面/cover", "封面", "banner"],
  tags: ["tags"],
  fileClass: ["fileClass", "FileClass"],
  initialRisk: ["initial_risk", "initialRisk", "初始风险/initial_risk", "初始风险"],
  entry: ["entry", "entry_price", "入场/entry_price", "入场"],
  exit: ["exit", "exit_price", "离场/exit_price", "离场"],
  stop: ["stop", "stop_loss", "止损/stop_loss", "止损"],
} as const;

export const TRADE_TAG = "PA/Trade" as const;

export function getFirstFieldValue(
  frontmatter: Record<string, any>,
  keys: readonly string[]
) {
  for (const key of keys) {
    const value = frontmatter?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

export function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .trim()
    .replace(/[，,]/g, "")
    .replace(/[＋﹢]/g, "+")
    .replace(/[－–—−]/g, "-");
  const match = cleaned.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const n = Number.parseFloat(match[0]);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeTag(tag: string): NormalizedTag {
  // 统一：去掉开头 #，并使用 vault 里常见的路径式标签格式
  return tag.trim().replace(/^#/, "");
}

export function isTradeTag(tag: string): boolean {
  return normalizeTag(tag).toLowerCase() === TRADE_TAG.toLowerCase();
}

export function normalizeTicker(value: unknown): string | undefined {
  if (typeof value === "string") {
    const v = value.trim();
    return v.length > 0 ? v : undefined;
  }
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === "string");
    return typeof first === "string" ? normalizeTicker(first) : undefined;
  }
  return undefined;
}

export function normalizeString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const v = value.trim();
    return v.length ? v : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    const first = value.find(
      (v) => typeof v === "string" || typeof v === "number"
    );
    return normalizeString(first);
  }
  return undefined;
}

export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,，;；/|]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function normalizeAccountType(value: unknown): AccountType | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (v.includes("live") || v.includes("实盘")) return "Live";
  if (v.includes("demo") || v.includes("模拟")) return "Demo";
  if (v.includes("backtest") || v.includes("回测")) return "Backtest";
  return undefined;
}

export function normalizeOutcome(value: unknown): TradeOutcome | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (
    v === "win" ||
    v === "w" ||
    v === "止盈" ||
    v.includes("win") ||
    v.includes("止盈") ||
    v.includes("赢")
  )
    return "win";
  if (
    v === "loss" ||
    v === "l" ||
    v === "止损" ||
    v.includes("loss") ||
    v.includes("止损") ||
    v.includes("亏")
  )
    return "loss";
  if (
    v === "scratch" ||
    v === "be" ||
    v === "保本" ||
    v.includes("scratch") ||
    v.includes("保本") ||
    v.includes("平手") ||
    v.includes("breakeven")
  ) {
    return "scratch";
  }
  if (
    v === "open" ||
    v === "ongoing" ||
    v === "进行中" ||
    v.includes("open") ||
    v.includes("进行中")
  )
    return "open";
  return "unknown";
}

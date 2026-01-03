import type { StatsByAccountType } from "./stats";
import type { TradeRecord } from "./contracts";
import type { StrategyCard } from "./strategy-index";
import { getFirstFieldValue, parseNumber } from "./field-mapper";
import type { TodaySnapshot } from "./console-state";

export type ConsoleExportMeta = {
  /** Schema version for forward compatibility. */
  schemaVersion: 3;
  /** ISO timestamp of export. */
  exportedAt: string;
  /** Plugin version at time of export. */
  pluginVersion: string;
};

export type ExportTradeCompat = {
  /** Legacy R-multiple (if present in frontmatter). */
  r?: number;
  /** Legacy setup label (if present). */
  setup?: string;
  /** Legacy execution/management error label (if present). */
  error?: string;
  /** Direction. */
  dir?: string;
  /** Timeframe. */
  tf?: string;
  /** Order type. */
  order?: string;
  /** Signal label. */
  signal?: string;
  /** Plan label. */
  plan?: string;
};

export type ExportTradeRecord = TradeRecord & ExportTradeCompat;

export type ConsoleExportSnapshot = {
  meta: ConsoleExportMeta;
  trades: ExportTradeRecord[];
  statsByAccountType: StatsByAccountType;
  today?: TodaySnapshot;
  strategyIndex?: {
    count: number;
    cards: StrategyCard[];
  };
};

const TRADE_COMPAT_FIELD_ALIASES = {
  r: ["r", "R", "r_value", "r值", "R值"],
  setup: [
    "setup",
    "setupKey",
    "setup_key",
    "设置/setup",
    "设置",
    "形态/setup",
    "形态",
  ],
  error: [
    "执行评价/execution_quality",
    "execution_quality",
    "管理错误/management_error",
    "management_error",
    "error",
  ],
  dir: ["dir", "direction", "方向/dir", "方向"],
  tf: ["tf", "timeframe", "周期/tf", "周期", "时间周期"],
  order: ["order", "order_type", "订单/order", "订单"],
  signal: ["signal", "signal_bar", "信号K/signal", "信号"],
  plan: ["plan", "trade_plan", "计划/plan", "计划"],
} as const;

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function extractCompatFields(trade: TradeRecord): ExportTradeCompat {
  const fm = (trade.rawFrontmatter ?? {}) as Record<string, unknown>;
  const r = parseNumber(
    getFirstFieldValue(fm as any, TRADE_COMPAT_FIELD_ALIASES.r)
  );

  // Compat 字段优先使用索引层规范字段（SSOT），保持与 legacy 导出一致。
  // rawFrontmatter 仅用于回退/历史数据。
  const setup =
    asNonEmptyString(trade.setupCategory) ??
    asNonEmptyString(getFirstFieldValue(fm as any, TRADE_COMPAT_FIELD_ALIASES.setup));
  const error =
    asNonEmptyString(trade.executionQuality) ??
    asNonEmptyString(getFirstFieldValue(fm as any, TRADE_COMPAT_FIELD_ALIASES.error));
  const dir =
    asNonEmptyString(trade.direction) ??
    asNonEmptyString(getFirstFieldValue(fm as any, TRADE_COMPAT_FIELD_ALIASES.dir));
  const tf =
    asNonEmptyString(trade.timeframe) ??
    asNonEmptyString(getFirstFieldValue(fm as any, TRADE_COMPAT_FIELD_ALIASES.tf));
  const order = asNonEmptyString(
    getFirstFieldValue(fm as any, TRADE_COMPAT_FIELD_ALIASES.order)
  );
  const signal = asNonEmptyString(
    getFirstFieldValue(fm as any, TRADE_COMPAT_FIELD_ALIASES.signal)
  );
  const plan = asNonEmptyString(
    getFirstFieldValue(fm as any, TRADE_COMPAT_FIELD_ALIASES.plan)
  );

  return {
    r: typeof r === "number" && !Number.isNaN(r) ? r : undefined,
    setup,
    error,
    dir,
    tf,
    order,
    signal,
    plan,
  };
}

export function buildConsoleExportSnapshot(args: {
  exportedAt: string;
  pluginVersion: string;
  trades: TradeRecord[];
  statsByAccountType: StatsByAccountType;
  strategyCards?: StrategyCard[];
  today?: TodaySnapshot;
}): ConsoleExportSnapshot {
  const trades = args.trades ?? [];
  const statsByAccountType = args.statsByAccountType;
  const cards = args.strategyCards;
  const exportTrades: ExportTradeRecord[] = trades.map((t) => ({
    ...t,
    ...extractCompatFields(t),
  }));

  return {
    meta: {
      schemaVersion: 3,
      exportedAt: args.exportedAt,
      pluginVersion: args.pluginVersion,
    },
    trades: exportTrades,
    statsByAccountType,
    today: args.today,
    strategyIndex: cards
      ? {
          count: cards.length,
          cards,
        }
      : undefined,
  };
}

import type { AccountType, TradeRecord } from "./contracts";
import type { StrategyIndex } from "./strategy-index";

export type AnalyticsScope = AccountType | "All";

export interface DailyAgg {
  dateIso: string;
  netR: number;
  count: number;
}

export interface EquityPoint {
  dateIso: string;
  equityR: number;
}

export interface StrategyAttributionRow {
  strategyName: string;
  strategyPath?: string;
  count: number;
  netR: number;
}

const STRATEGY_FIELD_ALIASES = [
  "策略名称/strategy_name",
  "strategy_name",
  "strategyName",
  "strategy",
] as const;

function toString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

export function filterTradesByScope(
  trades: TradeRecord[],
  scope: AnalyticsScope
): TradeRecord[] {
  if (scope === "All") return trades;
  return trades.filter((t) => t.accountType === scope);
}

export function computeDailyAgg(
  trades: TradeRecord[],
  days: number
): DailyAgg[] {
  const byDate = new Map<string, { netR: number; count: number }>();
  for (const t of trades) {
    const dateIso = t.dateIso;
    if (!dateIso) continue;
    const prev = byDate.get(dateIso) ?? { netR: 0, count: 0 };
    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
    prev.netR += pnl;
    prev.count += 1;
    byDate.set(dateIso, prev);
  }

  const keys = Array.from(byDate.keys()).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0
  );
  return keys.slice(0, Math.max(1, days)).map((k) => {
    const v = byDate.get(k)!;
    return { dateIso: k, netR: v.netR, count: v.count };
  });
}

export function computeEquityCurve(dailyDesc: DailyAgg[]): EquityPoint[] {
  const asc = [...dailyDesc].sort((a, b) =>
    a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0
  );
  let equity = 0;
  return asc.map((d) => {
    equity += d.netR;
    return { dateIso: d.dateIso, equityR: equity };
  });
}

export function computeStrategyAttribution(
  trades: TradeRecord[],
  strategyIndex: StrategyIndex,
  limit: number
): StrategyAttributionRow[] {
  const by = new Map<string, { netR: number; count: number }>();

  for (const t of trades) {
    let name: string | undefined = toString(t.strategyName);
    if (!name) {
      const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
      for (const key of STRATEGY_FIELD_ALIASES) {
        name = toString((fm as any)[key]);
        if (name) break;
      }
    }
    if (!name) continue;

    const prev = by.get(name) ?? { netR: 0, count: 0 };
    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
    prev.netR += pnl;
    prev.count += 1;
    by.set(name, prev);
  }

  const rows: StrategyAttributionRow[] = [];
  for (const [strategyName, v] of by.entries()) {
    const card =
      strategyIndex.lookup(strategyName) ?? strategyIndex.byName(strategyName);
    rows.push({
      strategyName,
      strategyPath: card?.path,
      netR: v.netR,
      count: v.count,
    });
  }

  rows.sort((a, b) => Math.abs(b.netR) - Math.abs(a.netR));
  return rows.slice(0, Math.min(20, Math.max(1, limit)));
}

// --- New Analytics for Gap Restoration ---

export interface ContextAnalysisRow {
  context: string;
  count: number;
  netR: number;
  winRate: number;
}

export interface ErrorAnalysisRow {
  errorTag: string;
  count: number;
  netR: number;
}

const CONTEXT_FIELD_ALIASES = [
  "market_cycle",
  "市场周期/market_cycle",
  "daily_market_cycle",
  "context",
] as const;

const ERROR_FIELD_ALIASES = [
  "mistake_tags",
  "错误/mistake_tags",
  "mistakes",
  "errors",
] as const;

export function computeContextAnalysis(trades: TradeRecord[]): ContextAnalysisRow[] {
  const by = new Map<string, { netR: number; count: number; wins: number }>();

  for (const t of trades) {
    // 优先使用索引层规范字段（SSOT），rawFrontmatter 仅作回退。
    let ctx: string | undefined = toString(t.marketCycle);
    if (!ctx) {
      const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
      for (const key of CONTEXT_FIELD_ALIASES) {
        const v = (fm as any)[key];
        if (typeof v === "string" && v.trim()) {
          ctx = v.trim();
          break;
        }
      }
    }
    if (!ctx) continue;

    const prev = by.get(ctx) ?? { netR: 0, count: 0, wins: 0 };
    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
    prev.netR += pnl;
    prev.count += 1;
    if (pnl > 0) prev.wins += 1;
    by.set(ctx, prev);
  }

  const rows: ContextAnalysisRow[] = [];
  for (const [context, v] of by.entries()) {
    rows.push({
      context,
      count: v.count,
      netR: v.netR,
      winRate: v.count > 0 ? (v.wins / v.count) * 100 : 0,
    });
  }
  // Sort by count desc
  return rows.sort((a, b) => b.count - a.count);
}

export function computeErrorAnalysis(trades: TradeRecord[]): ErrorAnalysisRow[] {
  const by = new Map<string, { netR: number; count: number }>();

  for (const t of trades) {
    const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
    let tags: string[] = [];

    for (const key of ERROR_FIELD_ALIASES) {
      const v = (fm as any)[key];
      if (Array.isArray(v)) {
        tags = v.filter(x => typeof x === 'string').map(x => x.trim());
        if (tags.length > 0) break;
      } else if (typeof v === 'string' && v.trim()) {
        tags = [v.trim()];
        break;
      }
    }

    if (tags.length === 0) continue;

    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

    for (const tag of tags) {
      const prev = by.get(tag) ?? { netR: 0, count: 0 };
      prev.netR += pnl;
      prev.count += 1;
      by.set(tag, prev);
    }
  }

  const rows: ErrorAnalysisRow[] = [];
  for (const [errorTag, v] of by.entries()) {
    rows.push({
      errorTag,
      count: v.count,
      netR: v.netR,
    });
  }
  // Sort by netR ascending (biggest losses first)
  return rows.sort((a, b) => a.netR - b.netR);
}

import type { AccountType, TradeRecord } from "./contracts";
import type { StrategyIndex } from "./strategy-index";

export type AnalyticsScope = AccountType | "All";

export interface DailyAgg {
  dateIso: string;
  netR: number;
  netMoney: number;
  count: number;
}

export interface EquityPoint {
  dateIso: string;
  equityR: number;
  equityMoney: number;
}

export interface StrategyAttributionRow {
  strategyName: string;
  strategyPath?: string;
  count: number;
  netR: number;
  netMoney: number;
}

const STRATEGY_FIELD_ALIASES = [
  "策略名称/strategy_name",
  "strategy_name",
  "strategyName",
  "strategy",
] as const;

const PATTERNS_FIELD_ALIASES = [
  "patterns_observed",
  "patterns",
  "pattern",
  "观察到的形态/patterns_observed",
  "形态/patterns",
  "形态",
] as const;

const SETUP_KEY_FIELD_ALIASES = ["setupKey", "setup_key"] as const;

const SETUP_CATEGORY_FALLBACK_MAP: Record<string, string> = {
  "Trend Pullback": "趋势回调",
  "Trend Breakout": "趋势突破",
  Reversal: "反转",
  Wedge: "楔形",
  "Double Top/Bottom": "双顶/底",
  MTR: "主要趋势反转",
  "Final Flag": "末端旗形",
  "Opening Reversal": "开盘反转",
};

function toString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function isUnknownName(name: string | undefined): boolean {
  const s = String(name ?? "").trim();
  if (!s) return true;
  return s.toLowerCase() === "unknown";
}

function getStrings(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .filter((x) => typeof x === "string")
      .map((x) => (x as string).trim())
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

export function identifyStrategyForAnalytics(
  trade: TradeRecord,
  strategyIndex?: StrategyIndex
): { name?: string; path?: string } {
  // v5 对齐：策略识别优先级
  // 0) strategyName (explicit)
  const direct = toString(trade.strategyName);
  if (!isUnknownName(direct)) {
    const card =
      strategyIndex?.lookup(direct!) ?? strategyIndex?.byName(direct!);
    return { name: card?.canonicalName ?? direct!, path: card?.path };
  }

  const fm = (trade.rawFrontmatter ?? {}) as Record<string, unknown>;

  // 0.5) strategyName from frontmatter aliases
  for (const key of STRATEGY_FIELD_ALIASES) {
    const v = toString((fm as any)[key]);
    if (!isUnknownName(v)) {
      const card = strategyIndex?.lookup(v!) ?? strategyIndex?.byName(v!);
      return { name: card?.canonicalName ?? v!, path: card?.path };
    }
  }

  // 1) patternsObserved -> pattern mapping
  const patsDirect = (trade.patternsObserved ?? [])
    .map((p) => String(p).trim())
    .filter(Boolean);
  const pats = patsDirect.length
    ? patsDirect
    : (() => {
      for (const key of PATTERNS_FIELD_ALIASES) {
        const got = getStrings((fm as any)[key]);
        if (got.length) return got;
      }
      return [] as string[];
    })();

  for (const p of pats) {
    const card = strategyIndex?.byPattern(p);
    if (card) return { name: card.canonicalName, path: card.path };
  }

  // 2) setupKey / setupCategory fallback (display mapping aligned to v5)
  let cat: string | undefined;
  for (const key of SETUP_KEY_FIELD_ALIASES) {
    cat = toString((fm as any)[key]);
    if (cat) break;
  }
  if (!cat) cat = toString(trade.setupKey);
  if (!cat) cat = toString(trade.setupCategory);
  if (!cat) {
    const v =
      toString((fm as any)["setup_category"]) ??
      toString((fm as any)["setup"]) ??
      toString((fm as any)["setupCategory"]);
    cat = v;
  }

  if (cat) {
    const base = cat.includes("(") ? cat.split("(")[0].trim() : cat;
    const mapped = SETUP_CATEGORY_FALLBACK_MAP[base] ?? base;
    const card = strategyIndex?.lookup(mapped) ?? strategyIndex?.byName(mapped);
    return { name: card?.canonicalName ?? mapped, path: card?.path };
  }

  return {};
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
  const byDate = new Map<string, { netR: number; netMoney: number; count: number }>();
  for (const t of trades) {
    const dateIso = t.dateIso;
    if (!dateIso) continue;
    const prev = byDate.get(dateIso) ?? { netR: 0, netMoney: 0, count: 0 };

    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

    // R值优先取 explicit r，否则尝试从 pnl/risk 推算
    let r = 0;
    if (typeof t.r === "number" && Number.isFinite(t.r)) {
      r = t.r;
    } else if (pnl !== 0 && t.initialRisk && t.initialRisk > 0) {
      r = pnl / t.initialRisk;
    }

    prev.netR += r;
    prev.netMoney += pnl;
    prev.count += 1;
    byDate.set(dateIso, prev);
  }

  const keys = Array.from(byDate.keys()).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return keys.slice(0, Math.max(1, days)).map((k) => {
    const v = byDate.get(k)!;
    return { dateIso: k, netR: v.netR, netMoney: v.netMoney, count: v.count };
  });
}

export function computeEquityCurve(dailyDesc: DailyAgg[]): EquityPoint[] {
  const asc = [...dailyDesc].sort((a, b) =>
    a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0
  );
  let equity = 0;
  let equityMoney = 0;
  return asc.map((d) => {
    equity += d.netR;
    equityMoney += d.netMoney;
    return { dateIso: d.dateIso, equityR: equity, equityMoney };
  });
}

export function computeStrategyAttribution(
  trades: TradeRecord[],
  strategyIndex: StrategyIndex,
  limit: number
): StrategyAttributionRow[] {
  const by = new Map<string, { netR: number; netMoney: number; count: number }>();

  for (const t of trades) {
    const ident = identifyStrategyForAnalytics(t, strategyIndex);
    const name = ident.name;
    if (!name) continue;

    const prev = by.get(name) ?? { netR: 0, netMoney: 0, count: 0 };
    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

    let r = 0;
    if (typeof t.r === "number" && Number.isFinite(t.r)) {
      r = t.r;
    } else if (pnl !== 0 && t.initialRisk && t.initialRisk > 0) {
      r = pnl / t.initialRisk;
    }

    prev.netR += r;
    prev.netMoney += pnl;
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
      netMoney: v.netMoney,
      count: v.count,
    });
  }

  rows.sort((a, b) => Math.abs(b.netMoney) - Math.abs(a.netMoney)); // Sort by Money
  return rows.slice(0, Math.min(20, Math.max(1, limit)));
}

// --- New Analytics for Gap Restoration ---

export interface ContextAnalysisRow {
  context: string;
  count: number;
  netR: number;
  netMoney: number;
  winRate: number;
}

export interface ErrorAnalysisRow {
  errorTag: string;
  count: number;
  netR: number;
  netMoney: number; // Cost in money (negative)
}

const CONTEXT_FIELD_ALIASES = [
  "marketCycleKey",
  "market_cycle_key",
  "cycle",
  "market_cycle",
  "marketCycle",
  "市场周期/market_cycle",
  "市场周期",
  "daily_market_cycle",
  "context",
] as const;

const MARKET_CYCLE_MAP: Record<string, string> = {
  "Strong Trend": "强趋势",
  "Weak Trend": "弱趋势",
  "Trading Range": "交易区间",
  "Breakout Mode": "突破模式",
  Breakout: "突破",
  Channel: "通道",
  "Broad Channel": "宽通道",
  "Tight Channel": "窄通道",
};

function toFirstString(v: unknown): string | undefined {
  if (Array.isArray(v)) {
    for (const it of v) {
      const s = toString(it);
      if (s) return s;
    }
    return undefined;
  }
  return toString(v);
}

export function normalizeMarketCycleForAnalytics(
  raw: unknown
): string | undefined {
  const s0 = toFirstString(raw);
  if (!s0) return undefined;
  if (s0.toLowerCase() === "unknown") return undefined;

  const base = s0.includes("(") ? s0.split("(")[0].trim() : s0.trim();
  if (!base) return undefined;
  if (base.toLowerCase() === "unknown") return undefined;

  return MARKET_CYCLE_MAP[base] ?? base;
}

export function computeContextAnalysis(
  trades: TradeRecord[]
): ContextAnalysisRow[] {
  const by = new Map<string, { netR: number; netMoney: number; count: number; wins: number }>();

  for (const t of trades) {
    // 优先使用索引层规范字段（SSOT），rawFrontmatter 仅作回退。
    let ctx: string | undefined = normalizeMarketCycleForAnalytics(
      (t as any).marketCycle
    );
    if (!ctx) {
      const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
      for (const key of CONTEXT_FIELD_ALIASES) {
        const v = (fm as any)[key];
        ctx = normalizeMarketCycleForAnalytics(v);
        if (ctx) break;
      }
    }
    if (!ctx) continue;

    const prev = by.get(ctx) ?? { netR: 0, netMoney: 0, count: 0, wins: 0 };
    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

    let r = 0;
    if (typeof t.r === "number" && Number.isFinite(t.r)) {
      r = t.r;
    } else if (pnl !== 0 && t.initialRisk && t.initialRisk > 0) {
      r = pnl / t.initialRisk;
    }

    prev.netR += r;
    prev.netMoney += pnl;
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
      netMoney: v.netMoney,
      winRate: v.count > 0 ? (v.wins / v.count) * 100 : 0,
    });
  }
  // Sort by count desc
  return rows.sort((a, b) => b.count - a.count);
}

export function computeErrorAnalysis(
  trades: TradeRecord[]
): ErrorAnalysisRow[] {
  // v5 对齐：错误分布与“学费统计”同一口径（Live + 亏损 + 执行评价非 Perfect/Valid/None/完美/主动）
  // 这里 netR 表示错误造成的亏损（负值），用于与现有 UI 兼容。
  const by = new Map<string, { costR: number; costMoney: number; count: number }>();

  for (const t of trades) {
    if (t.accountType !== "Live") continue;

    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
    if (pnl >= 0) continue;

    const errStr = getExecutionQualityFromTrade(t);
    if (!isBadExecutionQuality(errStr)) continue;

    const keyRaw = errStr.includes("(")
      ? errStr.split("(")[0].trim()
      : errStr.trim();
    const key = keyRaw.length ? keyRaw : "Unknown";

    const cost = Math.abs(pnl);
    let rCost = 0;
    if (typeof t.r === "number" && Number.isFinite(t.r)) {
      rCost = Math.abs(t.r);
    } else if (t.initialRisk && t.initialRisk > 0) {
      rCost = cost / t.initialRisk;
    }

    const prev = by.get(key) ?? { costR: 0, costMoney: 0, count: 0 };
    prev.costR += rCost;
    prev.costMoney += cost;
    prev.count += 1;
    by.set(key, prev);
  }

  const rows: ErrorAnalysisRow[] = [...by.entries()].map(([errorTag, v]) => ({
    errorTag,
    count: v.count,
    netR: -v.costR,
    netMoney: -v.costMoney,
  }));

  // Sort by netR ascending (biggest losses first)
  return rows.sort((a, b) => a.netMoney - b.netMoney);
}

export interface TuitionAnalysisRow {
  error: string;
  costR: number;
  costMoney: number;
}

export interface TuitionAnalysis {
  tuitionR: number;
  tuitionMoney: number;
  rows: TuitionAnalysisRow[];
}

const EXECUTION_QUALITY_FIELD_ALIASES = [
  "execution_quality",
  "执行评价/execution_quality",
  "执行评价",
  "management_error",
  "管理错误/management_error",
  "管理错误",
] as const;

function getExecutionQualityFromTrade(t: TradeRecord): string {
  const direct =
    typeof t.executionQuality === "string" ? t.executionQuality : "";
  if (direct.trim()) return direct.trim();

  const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
  for (const key of EXECUTION_QUALITY_FIELD_ALIASES) {
    const v = (fm as any)[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  return "None";
}

function isBadExecutionQuality(errStr: string): boolean {
  const s = String(errStr ?? "");
  return !(
    s.includes("Perfect") ||
    s.includes("Valid") ||
    s.includes("None") ||
    s.includes("完美") ||
    s.includes("主动")
  );
}

/**
 * v5.0 对齐：学费(错误的代价)
 * - 仅统计 Live
 * - 仅统计亏损 (pnl < 0)
 * - executionQuality/management_error 非 Perfect/Valid/None/完美/主动 时计入
 * - key 使用括号前文本："XXX (.. )" -> "XXX"
 * - tuitionR = abs(pnl) 累加；errors 按 key 聚合 abs(pnl)
 */
export function computeTuitionAnalysis(trades: TradeRecord[]): TuitionAnalysis {
  let tuitionR = 0;
  let tuitionMoney = 0;
  const by = new Map<string, { costR: number; costMoney: number }>();

  for (const t of trades) {
    if (t.accountType !== "Live") continue;

    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
    if (pnl >= 0) continue;

    const errStr = getExecutionQualityFromTrade(t);
    if (!isBadExecutionQuality(errStr)) continue;

    const keyRaw = errStr.includes("(")
      ? errStr.split("(")[0].trim()
      : errStr.trim();
    const key = keyRaw.length ? keyRaw : "Unknown";

    const costMoney = Math.abs(pnl);
    let rCost = 0;
    if (typeof t.r === "number" && Number.isFinite(t.r)) {
      rCost = Math.abs(t.r);
    } else if (t.initialRisk && t.initialRisk > 0) {
      rCost = costMoney / t.initialRisk;
    }

    tuitionR += rCost;
    tuitionMoney += costMoney;

    const prev = by.get(key) ?? { costR: 0, costMoney: 0 };
    prev.costR += rCost;
    prev.costMoney += costMoney;
    by.set(key, prev);
  }

  const rows = [...by.entries()]
    .map(([error, v]) => ({ error, costR: v.costR, costMoney: v.costMoney }))
    .sort((a, b) => b.costMoney - a.costMoney); // Sort by Money cost

  return { tuitionR, tuitionMoney, rows };
}

// --- Multi-dimensional Analysis (Phase 3.2) ---

export interface AnalyticsBucket {
  label: string;
  count: number;
  winRate: number;
  netR: number;
  netMoney: number;
}

export type BreakdownDimension = "setup" | "day" | "direction";

export function aggregateTrades(
  trades: TradeRecord[],
  dimension: BreakdownDimension
): AnalyticsBucket[] {
  const map = new Map<
    string,
    { count: number; wins: number; netR: number; netMoney: number }
  >();

  for (const t of trades) {
    if (t.accountType !== "Live") continue; // Default to Live for analysis? Or should we let caller filter? 
    // Usually analytics functions operate on the passed trades array. 
    // `computeDailyAgg` does NOT filter by account type inside, it expects caller to filter.
    // `computeStrategyAttribution` does NOT filter.
    // `computeErrorAnalysis` DOES filter for Live.
    // Let's NOT filter here, assuming caller filters `trades` before passing.
  }

  // Re-loop without filter
  for (const t of trades) {
    let key = "Unknown";

    if (dimension === "direction") {
      key = t.direction || (t.rawFrontmatter as any)?.direction || "Unknown";
    } else if (dimension === "day") {
      if (t.dateIso) {
        const date = new Date(t.dateIso);
        // 0=Sun, 1=Mon ...
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        key = days[date.getDay()];
      } else {
        key = "Unknown";
      }
    } else if (dimension === "setup") {
      // Try standard field first
      let cat = t.setupCategory;
      // Fallback aliases if not normalized
      if (!cat) {
        const fm = (t.rawFrontmatter ?? {}) as any;
        cat = fm["setup_category"] || fm["setup"] || fm["setupCategory"];
      }
      key = cat ? (cat.split("(")[0].trim() || "Unknown") : "Unknown";
    } else if (dimension === "timeframe" as any) {
      key = t.timeframe || (t.rawFrontmatter as any)?.timeframe || "Unknown";
    }

    const prev = map.get(key) ?? { count: 0, wins: 0, netR: 0, netMoney: 0 };

    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
    let r = 0;
    if (typeof t.r === "number" && Number.isFinite(t.r)) {
      r = t.r;
    } else if (pnl !== 0 && t.initialRisk && t.initialRisk > 0) {
      r = pnl / t.initialRisk;
    }

    prev.count++;
    prev.netMoney += pnl;
    prev.netR += r;
    if ((t.netProfit || pnl) > 0) prev.wins++; // Simple win check

    map.set(key, prev);
  }

  const buckets: AnalyticsBucket[] = [];
  for (const [label, data] of map.entries()) {
    buckets.push({
      label,
      count: data.count,
      netR: data.netR,
      netMoney: data.netMoney,
      winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0
    });
  }

  // Sort logic:
  // Day: Sort by Day order? Or value? Usually value is more interesting for "Analysis".
  // But Day of Week usually expected in order.
  if (dimension === "day") {
    const dayOrder = { "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6 };
    buckets.sort((a, b) => (dayOrder[a.label as keyof typeof dayOrder] ?? 99) - (dayOrder[b.label as keyof typeof dayOrder] ?? 99));
  } else {
    // Sort by Net Money desc
    buckets.sort((a, b) => b.netMoney - a.netMoney);
  }

  return buckets;
}


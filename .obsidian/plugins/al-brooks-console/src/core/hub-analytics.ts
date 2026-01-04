import type { AccountType, TradeRecord, TradeStats } from "./contracts";

export type DayAggWithAccounts = {
  total: number;
  types: Set<AccountType>;
};

const MISTAKE_TAG_FIELD_ALIASES = [
  "mistake_tags",
  "错误/mistake_tags",
  "mistakes",
  "errors",
] as const;

export function getMistakeTagsFromTrade(trade: TradeRecord): string[] {
  const fm = (trade.rawFrontmatter ?? {}) as Record<string, unknown>;
  for (const key of MISTAKE_TAG_FIELD_ALIASES) {
    const v = (fm as any)[key];
    if (Array.isArray(v)) {
      const tags = v
        .filter((x) => typeof x === "string")
        .map((x) => (x as string).trim())
        .filter(Boolean);
      if (tags.length > 0) return tags;
    } else if (typeof v === "string" && v.trim()) {
      return [v.trim()];
    }
  }
  return [];
}

export function computeMonthDailyAggAllAccounts(args: {
  trades: TradeRecord[];
  yearMonth: string;
}): Map<number, DayAggWithAccounts> {
  const byDay = new Map<number, DayAggWithAccounts>();
  const target = String(args.yearMonth ?? "").trim();
  if (!target) return byDay;

  for (const t of args.trades ?? []) {
    const dateIso = t.dateIso;
    if (!dateIso || dateIso.length < 7) continue;
    if (dateIso.slice(0, 7) !== target) continue;

    const dayStr = dateIso.split("-")[2] ?? "";
    const day = dayStr ? Number(dayStr) : NaN;
    if (!Number.isFinite(day)) continue;

    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
    const acct = (t.accountType ?? "Live") as AccountType;

    const prev = byDay.get(day) ?? { total: 0, types: new Set<AccountType>() };
    prev.total += pnl;
    prev.types.add(acct);
    byDay.set(day, prev);
  }

  return byDay;
}

export function computeRecentLiveTradesAsc(
  trades: TradeRecord[],
  n: number
): TradeRecord[] {
  const windowSize = Math.max(1, n);
  const tradesAsc = [...(trades ?? [])].sort((a, b) =>
    a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0
  );
  return tradesAsc
    .filter((t) => (t.accountType ?? "Live") === "Live")
    .slice(-windowSize);
}

export function computeRMultiplesFromPnl(tradesAsc: TradeRecord[]) {
  const rs = (tradesAsc ?? []).map((t) =>
    typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0
  );
  const maxAbs = Math.max(1, ...rs.map((r) => Math.abs(r)));
  const avg = rs.length
    ? rs.reduce((acc, r) => acc + r, 0) / Math.max(1, rs.length)
    : 0;
  return { rs, maxAbs, avg };
}

export function computeMindsetFromRecentLive(
  tradesAsc: TradeRecord[],
  windowSize: number
) {
  const recent = [...(tradesAsc ?? [])].slice(-Math.max(1, windowSize));

  let tilt = 0;
  let fomo = 0;
  let hesitation = 0;

  for (const t of recent) {
    const tags = getMistakeTagsFromTrade(t);
    const s = tags.join(" ");
    if (s.includes("Tilt") || s.includes("上头")) tilt += 1;
    if (s.includes("FOMO") || s.includes("追单")) fomo += 1;
    if (s.includes("Hesitation") || s.includes("犹豫")) hesitation += 1;
  }

  let status = "🛡️ 状态极佳";
  let color = "var(--text-success)";
  if (tilt > 0 || fomo > 1) {
    status = "🔥 极度危险";
    color = "var(--text-error)";
  } else if (fomo > 0 || hesitation > 0) {
    status = "⚠️ 有点起伏";
    color = "var(--text-warning)";
  }

  return { tilt, fomo, hesitation, status, color };
}

export function computeTopStrategiesFromTrades(
  trades: TradeRecord[],
  limit: number
) {
  const tradesAsc = [...(trades ?? [])].sort((a, b) =>
    a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0
  );

  const stats = new Map<string, { win: number; total: number }>();

  for (const t of tradesAsc) {
    const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

    let key = (t.strategyName ?? "").toString().trim();
    if (!key || key.toLowerCase() === "unknown") {
      const rawSetup = (t.setupCategory ?? "").toString().trim();
      key = rawSetup ? rawSetup.split("(")[0].trim() : "Unknown";
    }
    if (!key) key = "Unknown";

    const prev = stats.get(key) ?? { win: 0, total: 0 };
    prev.total += 1;
    if (pnl > 0) prev.win += 1;
    stats.set(key, prev);
  }

  return [...stats.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total,
      wr: v.total > 0 ? Math.round((v.win / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, Math.max(1, limit));
}

export function computeHubSuggestion(args: {
  topStrategies: Array<{ name: string }>;
  mindset: { tilt: number };
  live: TradeStats;
  backtest: TradeStats;
}): { tone: "danger" | "warn" | "ok"; text: string } {
  const bestStrat = args.topStrategies[0]?.name ?? "无";
  const liveWr = args.live.winRatePct;
  const cumLive = args.live.netProfit;
  const cumBack = args.backtest.netProfit;

  if (args.mindset.tilt > 0) {
    return {
      tone: "danger",
      text: "检测到情绪化交易 (Tilt) 迹象。建议立即停止实盘，强制休息 24 小时。",
    };
  }

  if (liveWr < 40 && args.live.countTotal > 5) {
    return {
      tone: "warn",
      text: `实盘胜率偏低 (${liveWr}%)。建议暂停实盘，回到模拟盘练习 ${bestStrat}，直到连续盈利。`,
    };
  }

  if (cumLive < 0 && cumBack > 0) {
    return {
      tone: "warn",
      text: `回测表现良好但实盘亏损。可能是执行力问题。建议降低仓位，专注于 ${bestStrat}。`,
    };
  }

  return {
    tone: "ok",
    text: `当前状态良好。表现最好的策略是 ${bestStrat}。建议继续保持一致性。`,
  };
}

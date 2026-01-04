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

  // v5 对齐：心态分析来自执行评价字段（error/execution_quality/management_error），而不是 mistake_tags。
  const EXECUTION_TEXT_FIELD_ALIASES = [
    "execution_quality",
    "执行评价/execution_quality",
    "执行评价",
    "management_error",
    "管理错误/management_error",
    "管理错误",
  ] as const;

  const getExecutionText = (t: TradeRecord): string => {
    const direct = typeof t.executionQuality === "string" ? t.executionQuality : "";
    if (direct.trim()) return direct.trim();

    const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
    for (const key of EXECUTION_TEXT_FIELD_ALIASES) {
      const v = (fm as any)[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }

    return "";
  };

  for (const t of recent) {
    const err = getExecutionText(t).toLowerCase();
    if (err.includes("tilt") || err.includes("上头")) tilt += 1;
    if (err.includes("fomo") || err.includes("追单")) fomo += 1;
    if (err.includes("hesitation") || err.includes("犹豫")) hesitation += 1;
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
  mindset: { tilt: number; fomo?: number; hesitation?: number };
  live: TradeStats;
  backtest: TradeStats;
  topTuitionError?: { name: string; costR: number; pct?: number };
}): { tone: "danger" | "warn" | "ok"; text: string } {
  const bestStrat = args.topStrategies[0]?.name ?? "无";
  const liveWr = args.live.winRatePct;
  const cumLive = args.live.netProfit;
  const cumBack = args.backtest.netProfit;

  const fomo = typeof args.mindset.fomo === "number" ? args.mindset.fomo : 0;
  const hesitation =
    typeof args.mindset.hesitation === "number" ? args.mindset.hesitation : 0;

  const topErrName = args.topTuitionError?.name;
  const topErrCost =
    typeof args.topTuitionError?.costR === "number"
      ? args.topTuitionError?.costR
      : undefined;
  const topErrPct =
    typeof args.topTuitionError?.pct === "number"
      ? args.topTuitionError?.pct
      : undefined;

  const deriveActionRule = (name: string | undefined): string => {
    const raw = String(name ?? "").trim();
    const s = raw.toLowerCase();
    if (!raw) return "行动规则：下一笔只允许 A+ 级别机会，严格按计划执行。";

    // <= 8 条：用“包含匹配”覆盖中英文常见写法。
    if (s.includes("tilt") || raw.includes("上头") || s.includes("revenge") || raw.includes("报复")) {
      return "行动规则：出现情绪波动/报复倾向时立刻停止交易（至少 24 小时），并写复盘结论再恢复实盘。";
    }
    if (s.includes("fomo") || raw.includes("追单") || raw.includes("追涨") || raw.includes("冲动")) {
      return "行动规则：只在信号K收盘确认后下单；错过就错过，不追单。";
    }
    if (s.includes("hesitation") || raw.includes("犹豫") || raw.includes("不敢") || raw.includes("拖延")) {
      return "行动规则：满足入场条件就执行；若不能执行则视为计划不清，回到模拟盘重练规则。";
    }
    if (raw.includes("过早") || raw.includes("早退") || s.includes("early") || raw.includes("提前止盈")) {
      return "行动规则：按计划持仓管理（至少到下一个关键位/二次入场失败/明确反向信号），不要因为波动提前退出。";
    }
    if (raw.includes("无止损") || raw.includes("不设止损") || s.includes("no stop") || s.includes("nostop")) {
      return "行动规则：下单前必须先放好止损并确认初始风险；任何不设止损的交易一律禁止。";
    }
    if (raw.includes("加仓") || raw.includes("过度") || raw.includes("频繁") || s.includes("overtrade") || s.includes("over trade")) {
      return "行动规则：限制当日交易次数与加仓次数；不在波动中加仓，只在计划点位加仓。";
    }

    return "行动规则：把这类错误写成 1 条禁止/必须规则，下次交易前先检查。";
  };
  const topErrHint = topErrName
    ? `最贵错误：${topErrName}${
        typeof topErrPct === "number"
          ? `（${topErrPct}%）`
          : topErrCost
          ? `（-${topErrCost.toFixed(1)}R）`
          : ""
      }。`
    : "";

  const topErrRule = deriveActionRule(topErrName);

  // v5 主规则：Tilt 一票否决；增强：若 FOMO 过高/出现犹豫，也优先给出风控建议。
  if (args.mindset.tilt > 0 || fomo > 1) {
    return {
      tone: "danger",
      text:
        `检测到情绪化交易风险（Tilt/FOMO）。${topErrHint}${topErrRule}建议立即停止实盘，强制休息 24 小时。`,
    };
  }

  if (fomo > 0 || hesitation > 0) {
    return {
      tone: "warn",
      text:
        `检测到冲动/犹豫迹象（FOMO/犹豫）。${topErrHint}${topErrRule}建议降低仓位、严格等待信号，优先在模拟盘恢复稳定执行。`,
    };
  }

  if (liveWr < 40 && args.live.countTotal > 5) {
    return {
      tone: "warn",
      text: `实盘胜率偏低 (${liveWr}%)。${topErrHint}${topErrRule}建议暂停实盘，回到模拟盘练习 ${bestStrat} 策略，直到连续盈利。`,
    };
  }

  if (cumLive < 0 && cumBack > 0) {
    return {
      tone: "warn",
      text: `回测表现良好但实盘亏损。可能是执行力问题。${topErrHint}${topErrRule}建议降低仓位，专注于 ${bestStrat}。`,
    };
  }

  return {
    tone: "ok",
    text: `当前状态良好。表现最好的策略是 ${bestStrat}。建议继续保持一致性。`,
  };
}

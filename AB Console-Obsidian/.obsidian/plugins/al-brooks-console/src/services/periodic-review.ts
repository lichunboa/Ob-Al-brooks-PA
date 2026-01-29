/**
 * Periodic Review Service
 *
 * 周期性复盘系统：每周、每月、每季度自动生成复盘报告
 * 参考 Journalit 设计理念，整合 Al Brooks PA 方法论
 */

import type { App } from "obsidian";
import type { TradeRecord, TradeStats } from "../core/contracts";
import { computeTradeStats } from "../core/stats";

// ============================================================
// Types
// ============================================================

export type ReviewPeriod = "weekly" | "monthly" | "quarterly" | "yearly";

export interface ReviewConfig {
  period: ReviewPeriod;
  targetFolder: string;
  templatePath?: string;
  autoGenerate: boolean;
  includeCharts: boolean;
  includeDetailedTrades: boolean;
}

export interface ReviewData {
  period: ReviewPeriod;
  startDate: string;
  endDate: string;
  title: string;

  // Statistics
  stats: TradeStats;

  // Breakdowns
  byTicker: Record<string, TradeStats>;
  bySetup: Record<string, TradeStats>;
  byDirection: Record<string, TradeStats>;
  byMarketCycle: Record<string, TradeStats>;
  byDayOfWeek: Record<string, TradeStats>;

  // Analysis
  bestTrades: TradeRecord[];
  worstTrades: TradeRecord[];
  commonMistakes: Array<{ mistake: string; count: number }>;
  strengthPatterns: Array<{ pattern: string; winRate: number; count: number }>;

  // Trades for detailed view
  trades: TradeRecord[];
}

export interface ReviewGenerationResult {
  success: boolean;
  filepath: string;
  content: string;
  errors: string[];
}

// ============================================================
// Date Helpers
// ============================================================

/**
 * Get start and end dates for a period
 */
export function getPeriodDates(
  period: ReviewPeriod,
  referenceDate: Date = new Date()
): { start: Date; end: Date; title: string } {
  const ref = new Date(referenceDate);

  switch (period) {
    case "weekly": {
      // Get Monday of the previous week
      const dayOfWeek = ref.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(ref);
      monday.setDate(ref.getDate() - diff - 7);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const weekNum = getWeekNumber(monday);
      const title = `${monday.getFullYear()}年第${weekNum}周`;

      return { start: monday, end: sunday, title };
    }

    case "monthly": {
      // Previous month
      const start = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      const end = new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59, 999);

      const monthNames = [
        "一月", "二月", "三月", "四月", "五月", "六月",
        "七月", "八月", "九月", "十月", "十一月", "十二月",
      ];
      const title = `${start.getFullYear()}年${monthNames[start.getMonth()]}`;

      return { start, end, title };
    }

    case "quarterly": {
      // Previous quarter
      const currentQuarter = Math.floor(ref.getMonth() / 3);
      const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
      const year = currentQuarter === 0 ? ref.getFullYear() - 1 : ref.getFullYear();

      const start = new Date(year, prevQuarter * 3, 1);
      const end = new Date(year, prevQuarter * 3 + 3, 0, 23, 59, 59, 999);

      const title = `${year}年Q${prevQuarter + 1}`;

      return { start, end, title };
    }

    case "yearly": {
      // Previous year
      const year = ref.getFullYear() - 1;
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);

      const title = `${year}年`;

      return { start, end, title };
    }
  }
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Format date to ISO string (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ============================================================
// Analysis Functions
// ============================================================

/**
 * Compute review data from trades
 */
export function computeReviewData(
  trades: TradeRecord[],
  period: ReviewPeriod,
  startDate: Date,
  endDate: Date,
  title: string
): ReviewData {
  // Filter trades within period
  const periodTrades = trades.filter((t) => {
    const tradeDate = new Date(t.dateIso);
    return tradeDate >= startDate && tradeDate <= endDate;
  });

  // Overall stats
  const stats = computeTradeStats(periodTrades);

  // Group by ticker
  const byTicker: Record<string, TradeStats> = {};
  const tickerGroups = groupBy(periodTrades, (t) => t.ticker || "Unknown");
  for (const [ticker, group] of Object.entries(tickerGroups)) {
    byTicker[ticker] = computeTradeStats(group);
  }

  // Group by setup
  const bySetup: Record<string, TradeStats> = {};
  const setupGroups = groupBy(periodTrades, (t) => t.setupKey || t.strategyName || "Unknown");
  for (const [setup, group] of Object.entries(setupGroups)) {
    bySetup[setup] = computeTradeStats(group);
  }

  // Group by direction
  const byDirection: Record<string, TradeStats> = {};
  const directionGroups = groupBy(periodTrades, (t) => t.direction || "Unknown");
  for (const [direction, group] of Object.entries(directionGroups)) {
    byDirection[direction] = computeTradeStats(group);
  }

  // Group by market cycle
  const byMarketCycle: Record<string, TradeStats> = {};
  const cycleGroups = groupBy(periodTrades, (t) => t.marketCycle || "Unknown");
  for (const [cycle, group] of Object.entries(cycleGroups)) {
    byMarketCycle[cycle] = computeTradeStats(group);
  }

  // Group by day of week
  const byDayOfWeek: Record<string, TradeStats> = {};
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const dayGroups = groupBy(periodTrades, (t) => {
    const date = new Date(t.dateIso);
    return dayNames[date.getDay()];
  });
  for (const [day, group] of Object.entries(dayGroups)) {
    byDayOfWeek[day] = computeTradeStats(group);
  }

  // Best and worst trades
  const completedTrades = periodTrades.filter((t) => t.pnl !== undefined);
  const sortedByPnl = [...completedTrades].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  const bestTrades = sortedByPnl.slice(0, 5);
  const worstTrades = sortedByPnl.slice(-5).reverse();

  // Common mistakes (from execution quality)
  const mistakeMap: Record<string, number> = {};
  periodTrades.forEach((t) => {
    if (t.executionQuality && t.executionQuality.includes("🔴")) {
      const mistake = t.executionQuality.replace(/^🔴\s*/, "").split("(")[0].trim();
      mistakeMap[mistake] = (mistakeMap[mistake] || 0) + 1;
    }
  });
  const commonMistakes = Object.entries(mistakeMap)
    .map(([mistake, count]) => ({ mistake, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Strength patterns
  const patternStats: Record<string, { wins: number; total: number }> = {};
  periodTrades.forEach((t) => {
    const patterns = t.patternsObserved || [];
    patterns.forEach((pattern) => {
      if (!patternStats[pattern]) {
        patternStats[pattern] = { wins: 0, total: 0 };
      }
      patternStats[pattern].total++;
      if (t.outcome === "win") {
        patternStats[pattern].wins++;
      }
    });
  });

  const strengthPatterns = Object.entries(patternStats)
    .filter(([, stats]) => stats.total >= 3)
    .map(([pattern, stats]) => ({
      pattern,
      winRate: Math.round((stats.wins / stats.total) * 100),
      count: stats.total,
    }))
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 5);

  return {
    period,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    title,
    stats,
    byTicker,
    bySetup,
    byDirection,
    byMarketCycle,
    byDayOfWeek,
    bestTrades,
    worstTrades,
    commonMistakes,
    strengthPatterns,
    trades: periodTrades,
  };
}

/**
 * Group array by key function
 */
function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

// ============================================================
// Report Generation
// ============================================================

/**
 * Generate review report content
 */
export function generateReviewContent(data: ReviewData, config: ReviewConfig): string {
  const periodLabel = {
    weekly: "周",
    monthly: "月",
    quarterly: "季",
    yearly: "年",
  }[data.period];

  let content = `---
date: ${new Date().toISOString().split("T")[0]}
period: ${data.period}
start_date: ${data.startDate}
end_date: ${data.endDate}
total_trades: ${data.stats.countTotal}
win_rate: ${data.stats.winRatePct}
net_pnl: ${data.stats.netMoney}
tags:
  - PA/Review
  - review/${data.period}
---

# ${data.title} 复盘报告

## 概览

| 指标 | 数值 |
|------|------|
| 总交易数 | ${data.stats.countTotal} |
| 胜率 | ${data.stats.winRatePct}% |
| 盈利 | ${data.stats.countWins} |
| 亏损 | ${data.stats.countLosses} |
| 平局 | ${data.stats.countScratch} |
| 净盈亏 | ${data.stats.netMoney.toFixed(2)} |
| 净R | ${data.stats.netR.toFixed(2)}R |

---

## 按品种分析

| 品种 | 交易数 | 胜率 | 净盈亏 |
|------|--------|------|--------|
${Object.entries(data.byTicker)
  .sort((a, b) => b[1].countTotal - a[1].countTotal)
  .map(([ticker, stats]) => `| ${ticker} | ${stats.countTotal} | ${stats.winRatePct}% | ${stats.netMoney.toFixed(2)} |`)
  .join("\n")}

---

## 按策略分析

| 策略 | 交易数 | 胜率 | 净盈亏 |
|------|--------|------|--------|
${Object.entries(data.bySetup)
  .sort((a, b) => b[1].countTotal - a[1].countTotal)
  .map(([setup, stats]) => `| ${setup} | ${stats.countTotal} | ${stats.winRatePct}% | ${stats.netMoney.toFixed(2)} |`)
  .join("\n")}

---

## 按方向分析

| 方向 | 交易数 | 胜率 | 净盈亏 |
|------|--------|------|--------|
${Object.entries(data.byDirection)
  .map(([direction, stats]) => `| ${direction} | ${stats.countTotal} | ${stats.winRatePct}% | ${stats.netMoney.toFixed(2)} |`)
  .join("\n")}

---

## 按市场周期分析

| 周期 | 交易数 | 胜率 | 净盈亏 |
|------|--------|------|--------|
${Object.entries(data.byMarketCycle)
  .sort((a, b) => b[1].countTotal - a[1].countTotal)
  .map(([cycle, stats]) => `| ${cycle} | ${stats.countTotal} | ${stats.winRatePct}% | ${stats.netMoney.toFixed(2)} |`)
  .join("\n")}

---

## 按星期分析

| 星期 | 交易数 | 胜率 | 净盈亏 |
|------|--------|------|--------|
${["周一", "周二", "周三", "周四", "周五"]
  .filter((day) => data.byDayOfWeek[day])
  .map((day) => {
    const stats = data.byDayOfWeek[day];
    return `| ${day} | ${stats.countTotal} | ${stats.winRatePct}% | ${stats.netMoney.toFixed(2)} |`;
  })
  .join("\n")}

---

## 最佳交易 Top 5

${data.bestTrades.length > 0
  ? data.bestTrades
      .map((t, i) => `${i + 1}. **${t.ticker || "Unknown"}** (${t.dateIso}) - +${t.pnl?.toFixed(2)} [[${t.name}]]`)
      .join("\n")
  : "_无数据_"}

---

## 最差交易 Top 5

${data.worstTrades.length > 0
  ? data.worstTrades
      .map((t, i) => `${i + 1}. **${t.ticker || "Unknown"}** (${t.dateIso}) - ${t.pnl?.toFixed(2)} [[${t.name}]]`)
      .join("\n")
  : "_无数据_"}

---

## 常见错误

${data.commonMistakes.length > 0
  ? data.commonMistakes.map((m) => `- **${m.mistake}**: ${m.count}次`).join("\n")
  : "_无明显错误模式_"}

---

## 优势形态

${data.strengthPatterns.length > 0
  ? data.strengthPatterns
      .map((p) => `- **${p.pattern}**: 胜率 ${p.winRate}% (${p.count}次)`)
      .join("\n")
  : "_数据不足_"}

---

## 本${periodLabel}反思

### 做得好的方面
> 待填写

### 需要改进的方面
> 待填写

### 下${periodLabel}目标
> 待填写

---

*生成时间: ${new Date().toISOString()}*
`;

  if (config.includeDetailedTrades && data.trades.length > 0) {
    content += `

---

## 详细交易记录

| 日期 | 品种 | 方向 | 策略 | 盈亏 | 结果 |
|------|------|------|------|------|------|
${data.trades
  .map(
    (t) =>
      `| ${t.dateIso} | ${t.ticker || "-"} | ${t.direction || "-"} | ${t.setupKey || t.strategyName || "-"} | ${t.pnl?.toFixed(2) || "-"} | ${t.outcome || "-"} |`
  )
  .join("\n")}
`;
  }

  return content;
}

/**
 * Generate review report to vault
 */
export async function generateReviewToVault(
  app: App,
  trades: TradeRecord[],
  config: ReviewConfig,
  referenceDate: Date = new Date()
): Promise<ReviewGenerationResult> {
  const result: ReviewGenerationResult = {
    success: true,
    filepath: "",
    content: "",
    errors: [],
  };

  try {
    // Get period dates
    const { start, end, title } = getPeriodDates(config.period, referenceDate);

    // Compute review data
    const reviewData = computeReviewData(trades, config.period, start, end, title);

    // Generate content
    const content = generateReviewContent(reviewData, config);
    result.content = content;

    // Ensure target folder exists
    const targetFolder = config.targetFolder || "Daily/Reviews";
    let folder = app.vault.getAbstractFileByPath(targetFolder);

    if (!folder) {
      await app.vault.createFolder(targetFolder);
    }

    // Generate filename
    const periodSuffix = {
      weekly: `W${getWeekNumber(start)}`,
      monthly: `M${(start.getMonth() + 1).toString().padStart(2, "0")}`,
      quarterly: `Q${Math.floor(start.getMonth() / 3) + 1}`,
      yearly: "Year",
    }[config.period];

    const filename = `${start.getFullYear()}_${periodSuffix}_复盘.md`;
    const filepath = `${targetFolder}/${filename}`;
    result.filepath = filepath;

    // Check if file exists
    const existingFile = app.vault.getAbstractFileByPath(filepath);
    if (existingFile) {
      result.errors.push(`文件已存在: ${filepath}`);
      result.success = false;
      return result;
    }

    // Create file
    await app.vault.create(filepath, content);
  } catch (err) {
    result.errors.push(`生成失败: ${(err as Error).message}`);
    result.success = false;
  }

  return result;
}

/**
 * Check if review needs to be generated
 */
export function shouldGenerateReview(
  app: App,
  config: ReviewConfig,
  referenceDate: Date = new Date()
): { shouldGenerate: boolean; reason: string } {
  const { start, end, title } = getPeriodDates(config.period, referenceDate);

  // Check if current date is past the review period
  const now = new Date();
  if (now <= end) {
    return { shouldGenerate: false, reason: "复盘周期尚未结束" };
  }

  // Check if file already exists
  const targetFolder = config.targetFolder || "Daily/Reviews";
  const periodSuffix = {
    weekly: `W${getWeekNumber(start)}`,
    monthly: `M${(start.getMonth() + 1).toString().padStart(2, "0")}`,
    quarterly: `Q${Math.floor(start.getMonth() / 3) + 1}`,
    yearly: "Year",
  }[config.period];

  const filename = `${start.getFullYear()}_${periodSuffix}_复盘.md`;
  const filepath = `${targetFolder}/${filename}`;

  const existingFile = app.vault.getAbstractFileByPath(filepath);
  if (existingFile) {
    return { shouldGenerate: false, reason: "复盘报告已存在" };
  }

  return { shouldGenerate: true, reason: `${title} 复盘待生成` };
}

/**
 * Get default review config
 */
export function getDefaultReviewConfig(period: ReviewPeriod): ReviewConfig {
  return {
    period,
    targetFolder: "Daily/Reviews",
    autoGenerate: false,
    includeCharts: false,
    includeDetailedTrades: true,
  };
}

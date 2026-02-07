import * as React from "react";
import { moment } from "obsidian";
import { useConsoleContext } from "../../context/ConsoleContext";
import {
  computeDailyAgg,
  computeStrategyAttribution,
  computeContextAnalysis,
  computeTuitionAnalysis,
} from "../../core/analytics";
import {
  computeHubSuggestion,
  computeMindsetFromRecentLive,
  computeRMultiplesFromPnl,
  computeRecentLiveTradesAsc,
  computeTopStrategiesFromTrades,
  computeReviewSuggestion,
} from "../../core/hub-analytics";
import { computeTradeStatsByAccountType } from "../../core/stats";
import { computeStrategyLab } from "../../utils/strategy-performance-utils";
import { calculateLiveCyclePerformance } from "../../utils/performance-utils";
import {
  calculateAllTradesDateRange,
} from "../../utils/data-calculation-utils";
import {
  generateCalendarCells,
  calculateCalendarMaxAbs
} from "../../utils/calendar-utils";
import { resolveCanonicalStrategy } from "../../utils/strategy-utils";
import { buildGalleryItems } from "../../utils/gallery-utils";
import { getDayOfMonth } from "../../utils/date-utils";
import { getRColorByAccountType } from "../../utils/color-utils";
import { CYCLE_MAP } from "../../utils/constants";
import {
  SPACE,
  textButtonStyle,
  selectStyle,
} from "../../ui/styles/dashboardPrimitives";

import { V5_COLORS } from "../../ui/tokens";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { Button } from "../../ui/components/Button";
import { AccountSummaryCards } from "../components/analytics/AccountSummaryCards";
import { TuitionCostPanel } from "../components/analytics/TuitionCostPanel";
import { AnalyticsSuggestion } from "../components/analytics/AnalyticsSuggestion";
import { DataAnalysisPanel } from "../components/analytics/DataAnalysisPanel";
import { DrawdownChart } from "../components/analytics/DrawdownChart";
import { AnalyticsConfigModal } from "../components/analytics/AnalyticsConfigModal";
import { AnalyticsInsightPanel } from "../components/analytics/AnalyticsInsightPanel";
import { WinLossAnalysisPanel } from "../components/analytics/WinLossAnalysisPanel";
import { CapitalGrowthChart } from "../components/analytics/CapitalGrowthChart";
import { AnalyticsGallery } from "../components/analytics/AnalyticsGallery";
import { computeStrategyRAnalysis } from "../components/analytics/StrategyRPerformancePanel";
import { ReviewSuggestionPanel } from "../components/analytics/ReviewSuggestionPanel";
import { CompactCalendarHeatmap } from "../components/analytics/CompactCalendarHeatmap";
import { StrategySelector } from "../components/analytics/StrategySelector";
import { StrategyDetailPanel } from "../components/analytics/StrategyDetailPanel";
import { TradeHistoryList } from "../components/analytics/TradeHistoryList";
import { StrategyComparisonPanel } from "../components/analytics/StrategyComparisonPanel";
import { Card } from "../../ui/components/Card";

export const AnalyticsTab: React.FC = () => {
  const {
    trades,
    strategyIndex,
    analyticsScope,
    setAnalyticsScope,
    galleryScope,
    setGalleryScope,
    openFile,
    getResourceUrl,
    resolveLink,
    currencyMode,
    displayUnit,
    setDisplayUnit
  } = useConsoleContext();

  // Widget visibility state
  const [visibleWidgets, setVisibleWidgets] = React.useState({
    accountSummary: true,
    capitalGrowth: true,
    drawdownAnalysis: true,  // 启用回撤分析
    marketCycle: true,
    tuitionCost: true,
    analyticsSuggestion: true,
    dataAnalysis: true,
    winLossAnalysis: true,
  });

  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [showConfig, setShowConfig] = React.useState(false);

  // 日期范围筛选
  type DateRange = 'week' | 'month' | '30d' | '90d' | 'year' | 'all';
  const [dateRange, setDateRange] = React.useState<DateRange>('all');

  // 账户类型筛选（支持多选）
  type AccountType = 'Live' | 'Demo' | 'Backtest';
  const [selectedAccounts, setSelectedAccounts] = React.useState<AccountType[]>([]);

  // 机器人筛选（支持多选）
  type BotType = 'PA交易' | '量化分析师' | '威科夫大师';
  const [selectedBots, setSelectedBots] = React.useState<BotType[]>([]);

  // 策略筛选（支持多选）
  const [selectedStrategies, setSelectedStrategies] = React.useState<string[]>([]);

  // 可见账户类型（从 selectedAccounts 派生）
  const visibleAccounts: AccountType[] =
    selectedAccounts.length === 0
      ? ['Live', 'Demo', 'Backtest']
      : selectedAccounts;

  // 账户类型切换
  const toggleAccount = (acct: AccountType) => {
    setSelectedAccounts(prev =>
      prev.includes(acct)
        ? prev.filter(a => a !== acct)
        : [...prev, acct]
    );
  };

  // 机器人切换
  const toggleBot = (bot: BotType) => {
    setSelectedBots(prev =>
      prev.includes(bot)
        ? prev.filter(b => b !== bot)
        : [...prev, bot]
    );
  };

  // 策略切换
  const toggleStrategy = (strategy: string) => {
    setSelectedStrategies(prev =>
      prev.includes(strategy)
        ? prev.filter(s => s !== strategy)
        : [...prev, strategy]
    );
  };


  // 根据日期范围、账户类型、策略筛选交易
  const filteredTrades = React.useMemo(() => {
    let result = trades;

    // 账户类型过滤（支持多选）
    if (selectedAccounts.length > 0) {
      result = result.filter(t => {
        const acct = t.accountType ?? "";
        return selectedAccounts.some(selected =>
          acct === selected ||
          acct.includes(selected) ||
          (selected === "Live" && (acct.includes("实盘") || acct.includes("Live"))) ||
          (selected === "Demo" && (acct.includes("模拟") || acct.includes("Demo"))) ||
          (selected === "Backtest" && (acct.includes("回测") || acct.includes("Backtest")))
        );
      });
    }

    // 策略筛选（支持多选）
    if (selectedStrategies.length > 0) {
      result = result.filter(t => selectedStrategies.includes(t.strategyName || 'Unknown'));
    }

    // 机器人筛选（支持多选）
    if (selectedBots.length > 0) {
      result = result.filter(t => {
        const bot = t.bot ?? "PA交易"; // 默认为PA交易（兼容旧笔记）
        return selectedBots.some(selected =>
          bot === selected ||
          bot.includes(selected) ||
          (selected === "PA交易" && (bot.includes("PA") || bot.includes("小明") || bot.includes("xiaoming"))) ||
          (selected === "量化分析师" && (bot.includes("量化") || bot.includes("trader"))) ||
          (selected === "威科夫大师" && (bot.includes("威科夫") || bot.includes("wyckoff")))
        );
      });
    }

    // 日期范围过滤
    if (dateRange === 'all') return result;

    const now = new Date();
    let cutoff: Date;

    switch (dateRange) {
      case 'week':
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case '30d':
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        cutoff = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        return result;
    }

    const cutoffIso = cutoff.toISOString().split('T')[0];
    return result.filter(t => t.dateIso && t.dateIso >= cutoffIso);
  }, [trades, dateRange, selectedAccounts, selectedStrategies, selectedBots]);

  // 计算所有策略名称（用于全局分析，即未选策略时视为全选所有策略）
  const allStrategyNames = React.useMemo(() => {
    const names = new Set<string>();
    for (const t of filteredTrades) {
      names.add(t.strategyName || 'Unknown');
    }
    return Array.from(names);
  }, [filteredTrades]);

  // 实际用于分析的策略列表（未选时=全选）
  const effectiveStrategies = selectedStrategies.length > 0 ? selectedStrategies : allStrategyNames;

  const dateRangeLabels: Record<DateRange, string> = {
    week: '本周',
    month: '本月',
    '30d': '30天',
    '90d': '90天',
    year: '本年',
    all: '全部',
  };

  const accountTypeLabels: Record<AccountType, string> = {
    Live: '实盘',
    Demo: '模拟',
    Backtest: '回测',
  };

  type WidgetKey = keyof typeof visibleWidgets;

  const toggleWidget = (key: string) => {
    setVisibleWidgets((prev) => {
      const k = key as WidgetKey;
      return { ...prev, [k]: !prev[k] };
    });
  };

  // Derived Data - 响应日期选择
  const tradesForAnalysis = React.useMemo(() => {
    if (!selectedDate) return filteredTrades;
    return filteredTrades.filter(t => t.dateIso === selectedDate);
  }, [filteredTrades, selectedDate]);

  const summary = React.useMemo(
    () => computeTradeStatsByAccountType(tradesForAnalysis),
    [tradesForAnalysis]
  );

  // 用于账户概览的统计 - 始终基于 filteredTrades，与日历保持一致
  const filteredSummary = React.useMemo(
    () => computeTradeStatsByAccountType(filteredTrades),
    [filteredTrades]
  );

  const strategyLab = React.useMemo(
    () =>
      computeStrategyLab(tradesForAnalysis, (t) => ({
        name: resolveCanonicalStrategy(t, strategyIndex),
      })),
    [tradesForAnalysis, strategyIndex]
  );

  const contextAnalysis = React.useMemo(
    () => computeContextAnalysis(filteredTrades),
    [filteredTrades]
  );

  const analyticsRecentLiveTradesAsc = React.useMemo(
    () => computeRecentLiveTradesAsc(filteredTrades, 30),
    [filteredTrades]
  );

  const analyticsRMultiples = React.useMemo(
    () => computeRMultiplesFromPnl(analyticsRecentLiveTradesAsc),
    [analyticsRecentLiveTradesAsc]
  );

  const analyticsMind = React.useMemo(
    () => computeMindsetFromRecentLive(analyticsRecentLiveTradesAsc, 20),
    [analyticsRecentLiveTradesAsc]
  );

  const analyticsTopStrats = React.useMemo(
    () => computeTopStrategiesFromTrades(filteredTrades, 5, strategyIndex),
    [filteredTrades, strategyIndex]
  );

  const liveCyclePerf = React.useMemo(
    () => calculateLiveCyclePerformance(filteredTrades, visibleAccounts),
    [filteredTrades, visibleAccounts]
  );

  const tuition = React.useMemo(
    () => computeTuitionAnalysis(filteredTrades),
    [filteredTrades]
  );

  const analyticsSuggestion = React.useMemo(
    () =>
      computeHubSuggestion({
        topStrategies: analyticsTopStrats,
        mindset: analyticsMind,
        live: summary.Live,
        backtest: summary.Backtest,
        topTuitionError: tuition.rows[0]
          ? { name: tuition.rows[0].error, costR: tuition.rows[0].costR }
          : undefined,
      }),
    [analyticsTopStrats, analyticsMind, summary, tuition]
  );

  const strategyAttribution = React.useMemo(
    () => computeStrategyAttribution(filteredTrades, strategyIndex, 20),
    [filteredTrades, strategyIndex]
  );

  // R值执行分析数据（用于策略仪表盘）
  const strategyRAnalysis = React.useMemo(
    () => computeStrategyRAnalysis(tradesForAnalysis, strategyIndex),
    [tradesForAnalysis, strategyIndex]
  );

  const allTradesDateRange = React.useMemo(
    () => calculateAllTradesDateRange(filteredTrades),
    [filteredTrades]
  );


  // 基于筛选范围内的交易计算心态分析（支持所有账户类型）
  const filteredMindset = React.useMemo(
    () => computeMindsetFromRecentLive(filteredTrades, filteredTrades.length),
    [filteredTrades]
  );

  // 历史回顾建议（基于筛选范围内的交易数据）
  const reviewSuggestions = React.useMemo(
    () => computeReviewSuggestion({
      trades: filteredTrades,
      strategyAttribution: strategyAttribution,
      tuitionAnalysis: tuition,
      mindset: filteredMindset,
    }),
    [filteredTrades, strategyAttribution, tuition, filteredMindset]
  );

  // Calendar Data
  const { calendarCells, maxAbs: calendarMaxAbs } = React.useMemo(() => {
    // Generate last 365 days dates
    const dates = [];
    const today = moment();
    for (let i = 0; i < 365; i++) {
      dates.push(today.clone().subtract(i, 'days').format('YYYY-MM-DD'));
    }
    dates.reverse(); // Ascending

    // Compute aggregation map
    const dailyAggArray = computeDailyAgg(filteredTrades, 365);
    const dailyMap = new Map<string, { dateIso: string; netR: number; count: number }>();
    dailyAggArray.forEach(d => {
      dailyMap.set(d.dateIso, d);
    });

    const cells = generateCalendarCells(dates, dailyMap);
    const maxAbs = calculateCalendarMaxAbs(cells);
    return { calendarCells: cells, maxAbs };
  }, [filteredTrades]);

  const calendarDays = calendarCells.length;

  // Gallery Data - 响应日期选择
  const gallery = React.useMemo(() => {
    // 如果选中了日期，只显示该日期的交易；否则显示全部
    const tradesForGallery = selectedDate
      ? filteredTrades.filter(t => t.dateIso === selectedDate)
      : filteredTrades;
    return buildGalleryItems(tradesForGallery, 'All', resolveLink, getResourceUrl);
  }, [filteredTrades, selectedDate, resolveLink, getResourceUrl]);

  // Calculate drawdown data from Live equity curve
  const drawdownData = React.useMemo(() => {
    if (!strategyLab?.curves?.Live) return [];

    const curve = strategyLab.curves.Live;
    let highWaterMark = -Infinity;
    const data = [];

    for (let i = 0; i < curve.length; i++) {
      const eq = curve[i];
      if (eq > highWaterMark) highWaterMark = eq;
      const dd = eq - highWaterMark;
      data.push({ date: `T${i}`, drawdown: dd });
    }
    return data;
  }, [strategyLab]);

  return (
    <>
      <SectionHeader
        title="数据中心"
        subtitle="Analytics Hub"
        icon="📊"
        style={{
          margin: `${SPACE.xxl} 0 ${SPACE.sm}`,
          paddingBottom: SPACE.xs,
          gap: SPACE.sm,
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: SPACE.sm,
        }}
      >
        {/* 日期范围选择 + 账户类型 + 单位切换 */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* 日期范围 */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>📅</span>
            <div style={{ display: "flex", gap: "2px", background: "var(--background-primary)", padding: "2px", borderRadius: "6px", border: "1px solid var(--background-modifier-border)" }}>
              {(['week', 'month', '30d', '90d', 'year', 'all'] as DateRange[]).map(range => (
                <div
                  key={range}
                  onClick={() => setDateRange(range)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    background: dateRange === range ? "#60A5FA" : "transparent",
                    color: dateRange === range ? "white" : "var(--text-muted)",
                    fontSize: "0.75em",
                    fontWeight: 600,
                    transition: "all 0.15s"
                  }}
                >
                  {dateRangeLabels[range]}
                </div>
              ))}
            </div>
          </div>

          {/* 账户类型（多选） */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>💼</span>
            <div style={{ display: "flex", gap: "4px", background: "var(--background-primary)", padding: "2px", borderRadius: "6px", border: "1px solid var(--background-modifier-border)" }}>
              {/* 全部按钮 */}
              <div
                onClick={() => setSelectedAccounts([])}
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  background: selectedAccounts.length === 0 ? "#60A5FA" : "transparent",
                  color: selectedAccounts.length === 0 ? "white" : "var(--text-muted)",
                  fontSize: "0.75em",
                  fontWeight: 600,
                  transition: "all 0.15s"
                }}
              >
                全部
              </div>
              {/* 各账户类型复选框 */}
              {(['Live', 'Demo', 'Backtest'] as AccountType[]).map(acct => {
                const isSelected = selectedAccounts.includes(acct);
                return (
                  <div
                    key={acct}
                    onClick={() => toggleAccount(acct)}
                    style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      background: isSelected ? "#60A5FA" : "transparent",
                      color: isSelected ? "white" : "var(--text-muted)",
                      fontSize: "0.75em",
                      fontWeight: 600,
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px"
                    }}
                  >
                    <span style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "2px",
                      border: `1px solid ${isSelected ? "white" : "var(--text-muted)"}`,
                      background: isSelected ? "white" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "7px",
                      color: "#60A5FA"
                    }}>
                      {isSelected && '✓'}
                    </span>
                    {accountTypeLabels[acct]}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 机器人筛选（多选） */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>🤖</span>
            <div style={{ display: "flex", gap: "4px", background: "var(--background-primary)", padding: "2px", borderRadius: "6px", border: "1px solid var(--background-modifier-border)" }}>
              {/* 全部按钮 */}
              <div
                onClick={() => setSelectedBots([])}
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  background: selectedBots.length === 0 ? "#60A5FA" : "transparent",
                  color: selectedBots.length === 0 ? "white" : "var(--text-muted)",
                  fontSize: "0.75em",
                  fontWeight: 600,
                  transition: "all 0.15s"
                }}
              >
                全部
              </div>
              {/* 各机器人复选框 */}
              {(['PA交易', '量化分析师', '威科夫大师'] as BotType[]).map(bot => {
                const isSelected = selectedBots.includes(bot);
                const botLabels: Record<BotType, string> = {
                  'PA交易': 'PA',
                  '量化分析师': '量化',
                  '威科夫大师': '威科夫'
                };
                return (
                  <div
                    key={bot}
                    onClick={() => toggleBot(bot)}
                    style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      background: isSelected ? "#60A5FA" : "transparent",
                      color: isSelected ? "white" : "var(--text-muted)",
                      fontSize: "0.75em",
                      fontWeight: 600,
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px"
                    }}
                  >
                    <span style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "2px",
                      border: `1px solid ${isSelected ? "white" : "var(--text-muted)"}`,
                      background: isSelected ? "white" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "7px",
                      color: "#60A5FA"
                    }}>
                      {isSelected && '✓'}
                    </span>
                    {botLabels[bot]}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 单位切换 */}
          <div style={{ display: "flex", gap: "2px", background: "var(--background-primary)", padding: "2px", borderRadius: "6px", border: "1px solid var(--background-modifier-border)" }}>
            {(['money', 'r'] as const).map(unit => (
              <div
                key={unit}
                onClick={() => setDisplayUnit(unit)}
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  background: displayUnit === unit ? "#60A5FA" : "transparent",
                  color: displayUnit === unit ? "white" : "var(--text-muted)",
                  fontSize: "0.75em",
                  fontWeight: 600,
                  transition: "all 0.15s"
                }}
              >
                {unit === 'money' ? '$' : 'R'}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 日历热图 - 顶部过滤区域 */}
      <Card variant="tight" style={{ marginBottom: '8px' }}>
        <CompactCalendarHeatmap
          trades={filteredTrades}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          currencyMode={currencyMode}
        />
        {selectedDate && (
          <div style={{
            marginTop: '6px',
            padding: '4px 8px',
            background: 'var(--background-modifier-hover)',
            borderRadius: '4px',
            fontSize: '0.8em'
          }}>
            📅 已选择: <strong>{selectedDate}</strong> — 下方数据已过滤为当日记录
          </div>
        )}
      </Card>

      {/* 策略筛选器 - 核心筛选层（支持多选） */}
      <StrategySelector
        trades={trades.filter(t => {
          // 只按日期和账户过滤，不按策略筛选（否则选择器会被清空）
          if (selectedAccounts.length > 0) {
            const acct = t.accountType ?? "";
            if (!selectedAccounts.some(selected =>
              acct === selected ||
              acct.includes(selected) ||
              (selected === "Live" && (acct.includes("实盘") || acct.includes("Live"))) ||
              (selected === "Demo" && (acct.includes("模拟") || acct.includes("Demo"))) ||
              (selected === "Backtest" && (acct.includes("回测") || acct.includes("Backtest")))
            )) {
              return false;
            }
          }
          if (dateRange !== 'all') {
            const now = new Date();
            let cutoff: Date;
            switch (dateRange) {
              case 'week': cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
              case 'month': cutoff = new Date(now.getFullYear(), now.getMonth(), 1); break;
              case '30d': cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
              case '90d': cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
              case 'year': cutoff = new Date(now.getFullYear(), 0, 1); break;
              default: return true;
            }
            const cutoffIso = cutoff.toISOString().split('T')[0];
            return t.dateIso && t.dateIso >= cutoffIso;
          }
          return true;
        })}
        selectedStrategies={selectedStrategies}
        onToggleStrategy={toggleStrategy}
        onSelectAll={() => setSelectedStrategies([])}
        currencyMode={currencyMode}
        SPACE={SPACE}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: SPACE.md,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: SPACE.md,
            minWidth: 0,
          }}
        >
          {visibleWidgets.accountSummary && (
            <Card variant="tight">
              <div
                style={{
                  fontWeight: 700,
                  opacity: 0.75,
                  marginBottom: SPACE.md,
                }}
              >
                💼 账户资金概览 <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>(Account)</span>
              </div>
              <AccountSummaryCards
                summary={filteredSummary}
                SPACE={SPACE}
                currencyMode={currencyMode}
                displayUnit={displayUnit}
                visibleAccounts={visibleAccounts}
              />
            </Card>
          )}

          {visibleWidgets.capitalGrowth && (
            <CapitalGrowthChart
              strategyLab={strategyLab}
              allTradesDateRange={allTradesDateRange}
              getRColorByAccountType={getRColorByAccountType}
              SPACE={SPACE}
              currencyMode={currencyMode}
              displayUnit={displayUnit}
              visibleAccounts={visibleAccounts}
            />
          )}

          {visibleWidgets.drawdownAnalysis && (
            <DrawdownChart data={drawdownData} />
          )}

          {/* 已删除冗余面板：市场环境表现、策略仪表盘 - 信息已整合到策略详情和对比面板 */}

          {/* 多策略对比面板 - 2+策略时显示 */}
          {effectiveStrategies.length >= 2 && (
            <StrategyComparisonPanel
              trades={filteredTrades}
              selectedStrategies={effectiveStrategies}
              currencyMode={currencyMode}
              displayUnit={displayUnit}
              SPACE={SPACE}
            />
          )}

          {/* 策略详情面板 - 始终显示（全局视图=全选所有策略） */}
          <StrategyDetailPanel
            trades={filteredTrades}
            selectedStrategies={effectiveStrategies}
            currencyMode={currencyMode}
            displayUnit={displayUnit}
            SPACE={SPACE}
          />

          {/* 交易明细列表 - 始终显示 */}
          <TradeHistoryList
            trades={filteredTrades}
            openFile={openFile}
            currencyMode={currencyMode}
            displayUnit={displayUnit}
            SPACE={SPACE}
          />

          {/* 历史回顾建议（与交易中心的即时建议区分） */}
          <ReviewSuggestionPanel
            suggestions={reviewSuggestions}
            SPACE={SPACE}
          />

          {/* 以下面板已整合到「策略详情」：
              - 策略归因 (Top)
              - 策略R值执行分析
              - 交易维度分析 (方向分布/周期分析)
          */}

        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: SPACE.md,
            minWidth: 0,
          }}
        >
          <AnalyticsGallery
            gallery={gallery}
            openFile={openFile}
            getResourceUrl={getResourceUrl}
            SPACE={SPACE}
          />
        </div>
      </div>

      {showConfig && (
        <AnalyticsConfigModal
          visibleWidgets={visibleWidgets}
          onToggle={toggleWidget}
          onClose={() => setShowConfig(false)}
          style={{ zIndex: 100 }}
        />
      )}
    </>
  );
};

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
import { MarketCyclePerformance } from "../components/analytics/MarketCyclePerformance";
import { TuitionCostPanel } from "../components/analytics/TuitionCostPanel";
import { AnalyticsSuggestion } from "../components/analytics/AnalyticsSuggestion";
import { DataAnalysisPanel } from "../components/analytics/DataAnalysisPanel";
import { DrawdownChart } from "../components/analytics/DrawdownChart";
import { AnalyticsConfigModal } from "../components/analytics/AnalyticsConfigModal";
import { AnalyticsInsightPanel } from "../components/analytics/AnalyticsInsightPanel";
import { WinLossAnalysisPanel } from "../components/analytics/WinLossAnalysisPanel";
import { CapitalGrowthChart } from "../components/analytics/CapitalGrowthChart";
import { AnalyticsGallery } from "../components/analytics/AnalyticsGallery";
import { StrategyAttributionPanel } from "../components/analytics/StrategyAttributionPanel";
import { StrategyRPerformancePanel } from "../components/analytics/StrategyRPerformancePanel";
import { CompactCalendarHeatmap } from "../components/analytics/CompactCalendarHeatmap";
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
    drawdownAnalysis: false,
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

  // 账户类型筛选
  type AccountFilter = 'all' | 'Live' | 'Demo' | 'Backtest';
  const [accountFilter, setAccountFilter] = React.useState<AccountFilter>('all');

  // 可见账户类型（用于热力图等图表筛选）
  const [visibleAccounts, setVisibleAccounts] = React.useState<('Live' | 'Demo' | 'Backtest')[]>(['Live', 'Demo', 'Backtest']);

  // 根据日期范围和账户类型筛选交易
  const filteredTrades = React.useMemo(() => {
    let result = trades;

    // 账户类型过滤
    if (accountFilter !== 'all') {
      result = result.filter(t => {
        const acct = t.accountType ?? "";
        return acct === accountFilter ||
          acct.includes(accountFilter) ||
          (accountFilter === "Live" && (acct.includes("实盘") || acct.includes("Live"))) ||
          (accountFilter === "Demo" && (acct.includes("模拟") || acct.includes("Demo"))) ||
          (accountFilter === "Backtest" && (acct.includes("回测") || acct.includes("Backtest")));
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
  }, [trades, dateRange, accountFilter]);

  const dateRangeLabels: Record<DateRange, string> = {
    week: '本周',
    month: '本月',
    '30d': '30天',
    '90d': '90天',
    year: '本年',
    all: '全部',
  };

  const accountFilterLabels: Record<AccountFilter, string> = {
    all: '全部',
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
    () => calculateLiveCyclePerformance(filteredTrades),
    [filteredTrades]
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

  const allTradesDateRange = React.useMemo(
    () => calculateAllTradesDateRange(filteredTrades),
    [filteredTrades]
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

          {/* 账户类型 */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>💼</span>
            <div style={{ display: "flex", gap: "2px", background: "var(--background-primary)", padding: "2px", borderRadius: "6px", border: "1px solid var(--background-modifier-border)" }}>
              {(['all', 'Live', 'Demo', 'Backtest'] as AccountFilter[]).map(acct => (
                <div
                  key={acct}
                  onClick={() => setAccountFilter(acct)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    background: accountFilter === acct ? "#60A5FA" : "transparent",
                    color: accountFilter === acct ? "white" : "var(--text-muted)",
                    fontSize: "0.75em",
                    fontWeight: 600,
                    transition: "all 0.15s"
                  }}
                >
                  {accountFilterLabels[acct]}
                </div>
              ))}
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

          {/* 可见账户控制 checkboxes */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "8px", borderLeft: "1px solid var(--background-modifier-border)", paddingLeft: "8px" }}>
            <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>👁️ 显示:</span>
            {['Live', 'Demo', 'Backtest'].map(acct => {
              const isVisible = visibleAccounts.includes(acct as any);
              return (
                <label key={acct} style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "0.75em", color: "var(--text-muted)" }}>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setVisibleAccounts(prev => {
                        if (checked) return [...prev, acct as any];
                        return prev.filter(a => a !== acct);
                      });
                    }}
                    style={{ margin: 0 }}
                  />
                  {acct === 'Live' ? '实盘' : acct === 'Demo' ? '模拟' : '回测'}
                </label>
              );
            })}
          </div>
        </div>

        <Button
          variant="small"
          onClick={() => setShowConfig(true)}
          style={{
            color: "var(--text-muted)",
            fontSize: "0.85em",
            padding: "4px 8px",
          }}
        >
          ⚙️ Configure View
        </Button>
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
                summary={summary}
                SPACE={SPACE}
                currencyMode={currencyMode}
                displayUnit={displayUnit}
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
            />
          )}

          {visibleWidgets.drawdownAnalysis && (
            <DrawdownChart data={drawdownData} />
          )}

          {visibleWidgets.marketCycle && (
            <MarketCyclePerformance
              liveCyclePerf={liveCyclePerf}
              SPACE={SPACE}
              CYCLE_MAP={CYCLE_MAP}
              currencyMode={currencyMode}
            />
          )}

          {visibleWidgets.tuitionCost && (
            <TuitionCostPanel tuition={tuition} SPACE={SPACE} />
          )}

          {/* 系统建议已移至交易中心，避免重复 */}

          {visibleWidgets.dataAnalysis && (
            <StrategyAttributionPanel
              trades={filteredTrades}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              strategyAttribution={strategyAttribution}
              openFile={openFile}
              textButtonStyle={textButtonStyle}
              SPACE={SPACE}
              currencyMode={currencyMode}
            />
          )}

          {/* 策略R值执行分析 */}
          <StrategyRPerformancePanel
            trades={tradesForAnalysis}
            strategyIndex={strategyIndex}
            currencyMode={currencyMode}
            SPACE={SPACE}
          />

          <AnalyticsInsightPanel
            analyticsMind={analyticsMind}
            analyticsTopStrats={analyticsTopStrats}
            SPACE={SPACE}
          />

          {visibleWidgets.winLossAnalysis && (
            <WinLossAnalysisPanel
              trades={filteredTrades}
              currencyMode={currencyMode}
              displayUnit={displayUnit}
            />
          )}

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

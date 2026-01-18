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
import { JournalGallery } from "../components/analytics/JournalGallery";
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

  // 根据日期范围筛选交易
  const filteredTrades = React.useMemo(() => {
    if (dateRange === 'all') return trades;

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
        return trades;
    }

    const cutoffIso = cutoff.toISOString().split('T')[0];
    return trades.filter(t => t.dateIso && t.dateIso >= cutoffIso);
  }, [trades, dateRange]);

  const dateRangeLabels: Record<DateRange, string> = {
    week: '本周',
    month: '本月',
    '30d': '30天',
    '90d': '90天',
    year: '本年',
    all: '全部',
  };

  type WidgetKey = keyof typeof visibleWidgets;

  const toggleWidget = (key: string) => {
    setVisibleWidgets((prev) => {
      const k = key as WidgetKey;
      return { ...prev, [k]: !prev[k] };
    });
  };

  // Derived Data - 使用筛选后的数据
  const summary = React.useMemo(
    () => computeTradeStatsByAccountType(filteredTrades),
    [filteredTrades]
  );

  const strategyLab = React.useMemo(
    () =>
      computeStrategyLab(filteredTrades, (t) => ({
        name: resolveCanonicalStrategy(t, strategyIndex),
      })),
    [filteredTrades, strategyIndex]
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

  // Gallery Data
  const gallery = React.useMemo(
    () =>
      buildGalleryItems(filteredTrades, galleryScope, resolveLink, getResourceUrl),
    [filteredTrades, galleryScope, resolveLink, getResourceUrl]
  );

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
        {/* 日期范围选择 + 单位切换 */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {/* 日期范围 */}
          <div style={{ display: "flex", gap: "2px", background: "var(--background-modifier-form-field)", padding: "2px", borderRadius: "6px" }}>
            {(['week', 'month', '30d', '90d', 'year', 'all'] as DateRange[]).map(range => (
              <div
                key={range}
                onClick={() => setDateRange(range)}
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  background: dateRange === range ? "var(--interactive-accent)" : "transparent",
                  color: dateRange === range ? "var(--text-on-accent)" : "var(--text-muted)",
                  fontSize: "0.75em",
                  fontWeight: 600,
                  transition: "all 0.15s"
                }}
              >
                {dateRangeLabels[range]}
              </div>
            ))}
          </div>

          {/* 单位切换 */}
          <div style={{ display: "flex", gap: "2px", background: "var(--background-modifier-form-field)", padding: "2px", borderRadius: "6px" }}>
            {(['money', 'r'] as const).map(unit => (
              <div
                key={unit}
                onClick={() => setDisplayUnit(unit)}
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  background: displayUnit === unit ? "var(--interactive-accent)" : "transparent",
                  color: displayUnit === unit ? "var(--text-on-accent)" : "var(--text-muted)",
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

          {visibleWidgets.analyticsSuggestion && (
            <AnalyticsSuggestion
              analyticsSuggestion={analyticsSuggestion}
              SPACE={SPACE}
            />
          )}

          {visibleWidgets.dataAnalysis && (
            <JournalGallery
              trades={filteredTrades}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              calendarCells={calendarCells}
              calendarDays={calendarDays}
              calendarMaxAbs={calendarMaxAbs}
              strategyAttribution={strategyAttribution}
              analyticsScope={analyticsScope}
              setAnalyticsScope={setAnalyticsScope}
              openFile={openFile}
              getDayOfMonth={getDayOfMonth}
              textButtonStyle={textButtonStyle}
              selectStyle={selectStyle}
              SPACE={SPACE}
              currencyMode={currencyMode}
            />
          )}

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
            galleryScope={galleryScope}
            setGalleryScope={setGalleryScope}
            openFile={openFile}
            getResourceUrl={getResourceUrl}
            selectStyle={selectStyle}
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

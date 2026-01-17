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

  type WidgetKey = keyof typeof visibleWidgets;

  const toggleWidget = (key: string) => {
    setVisibleWidgets((prev) => {
      const k = key as WidgetKey;
      return { ...prev, [k]: !prev[k] };
    });
  };

  // Derived Data
  const summary = React.useMemo(
    () => computeTradeStatsByAccountType(trades),
    [trades]
  );

  const strategyLab = React.useMemo(
    () =>
      computeStrategyLab(trades, (t) => ({
        name: resolveCanonicalStrategy(t, strategyIndex),
      })),
    [trades, strategyIndex]
  );

  const contextAnalysis = React.useMemo(
    () => computeContextAnalysis(trades),
    [trades]
  );

  const analyticsRecentLiveTradesAsc = React.useMemo(
    () => computeRecentLiveTradesAsc(trades, 30),
    [trades]
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
    () => computeTopStrategiesFromTrades(trades, 5, strategyIndex),
    [trades, strategyIndex]
  );

  const liveCyclePerf = React.useMemo(
    () => calculateLiveCyclePerformance(trades),
    [trades]
  );

  const tuition = React.useMemo(
    () => computeTuitionAnalysis(trades),
    [trades]
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
    () => computeStrategyAttribution(trades, strategyIndex, 20),
    [trades, strategyIndex]
  );

  const allTradesDateRange = React.useMemo(
    () => calculateAllTradesDateRange(trades),
    [trades]
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
    const dailyAggArray = computeDailyAgg(trades, 365);
    const dailyMap = new Map<string, { dateIso: string; netR: number; count: number }>();
    dailyAggArray.forEach(d => {
      dailyMap.set(d.dateIso, d);
    });

    const cells = generateCalendarCells(dates, dailyMap);
    const maxAbs = calculateCalendarMaxAbs(cells);
    return { calendarCells: cells, maxAbs };
  }, [trades]);

  const calendarDays = calendarCells.length;

  // Gallery Data
  const gallery = React.useMemo(
    () =>
      buildGalleryItems(trades, galleryScope, resolveLink, getResourceUrl),
    [trades, galleryScope, resolveLink, getResourceUrl]
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
        {/* Unit Toggle */}
        <div style={{ display: "flex", gap: "2px", background: "var(--background-modifier-form-field)", padding: "2px", borderRadius: "6px" }}>
          <div
            onClick={() => setDisplayUnit('money')}
            style={{
              padding: "2px 10px",
              borderRadius: "4px",
              cursor: "pointer",
              background: displayUnit === 'money' ? "var(--interactive-accent)" : "transparent",
              color: displayUnit === 'money' ? "var(--text-on-accent)" : "var(--text-muted)",
              fontSize: "0.85em",
              fontWeight: 600,
              transition: "all 0.2s"
            }}
          >
            $
          </div>
          <div
            onClick={() => setDisplayUnit('r')}
            style={{
              padding: "2px 10px",
              borderRadius: "4px",
              cursor: "pointer",
              background: displayUnit === 'r' ? "var(--interactive-accent)" : "transparent",
              color: displayUnit === 'r' ? "var(--text-on-accent)" : "var(--text-muted)",
              fontSize: "0.85em",
              fontWeight: 600,
              transition: "all 0.2s"
            }}
          >
            R
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
              trades={trades}
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
              trades={trades}
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

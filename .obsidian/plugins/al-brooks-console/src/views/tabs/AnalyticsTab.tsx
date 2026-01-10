import * as React from "react";
import type { AccountType, TradeRecord } from "../../core/contracts";
import type { AnalyticsScope } from "../../core/analytics";
import { V5_COLORS, withHexAlpha } from "../../ui/tokens";
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
// 新增组件
import { CapitalGrowthChart } from "../components/analytics/CapitalGrowthChart";
import { AnalyticsGallery } from "../components/analytics/AnalyticsGallery";
import { Card } from "../../ui/components/Card";

// 样式常量通过Props传递

// Props接口
export interface AnalyticsTabProps {
  summary: {
    Live: any;
    Demo: any;
    Backtest: any;
  };
  strategyLab: any;
  contextAnalysis: any;
  analyticsSuggestion: {
    text: string;
    tone: "success" | "warn" | "danger" | "ok";
  };

  analyticsRecentLiveTradesAsc: TradeRecord[];
  analyticsRMultiples: {
    avg: number;
    maxAbs: number;
    rs?: number[];
  };
  analyticsMind: any;
  analyticsTopStrats: any[];
  liveCyclePerf: any;
  tuition: any;
  calendarCells: any[];
  calendarMaxAbs: number;
  calendarDays: number;
  strategyAttribution: any;
  analyticsScope: AnalyticsScope;
  gallery: {
    scopeTotal: number;
    candidateCount: number;
    items: any[];
  };
  galleryScope: AnalyticsScope;
  gallerySearchHref: string;
  allTradesDateRange: { min: string; max: string };
  // 状态设置函数
  setAnalyticsScope: (scope: AnalyticsScope) => void;
  setGalleryScope: (scope: AnalyticsScope) => void;
  // 辅助函数
  openFile: (path: string) => void;
  getResourceUrl?: (path: string) => string;
  // 样式
  textButtonStyle: React.CSSProperties;
  selectStyle: React.CSSProperties;
  SPACE: any; // 空间常量
  // 计算函数
  getDayOfMonth: (dateIso: string) => string;
  getRColorByAccountType: (accountType: AccountType) => string;
  CYCLE_MAP: Record<string, string>;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  summary,
  strategyLab,
  contextAnalysis,
  analyticsSuggestion,
  analyticsRecentLiveTradesAsc,
  analyticsRMultiples,
  analyticsMind,
  analyticsTopStrats,
  liveCyclePerf,
  tuition,
  calendarCells,
  calendarMaxAbs,
  calendarDays,
  strategyAttribution,
  analyticsScope,
  gallery,
  galleryScope,
  gallerySearchHref,
  allTradesDateRange,
  setAnalyticsScope,
  setGalleryScope,
  openFile,
  getResourceUrl,
  textButtonStyle,
  selectStyle,
  SPACE,
  getDayOfMonth,
  getRColorByAccountType,
  CYCLE_MAP,
}) => {
  // Widget visibility state (local for now, could be persisted)
  const [visibleWidgets, setVisibleWidgets] = React.useState({
    accountSummary: true,
    capitalGrowth: true,
    drawdownAnalysis: false, // User requested to hide "second curve", default off
    marketCycle: true,
    tuitionCost: true,
    analyticsSuggestion: true,
    dataAnalysis: true,
  });

  type WidgetKey = keyof typeof visibleWidgets;

  const [showConfig, setShowConfig] = React.useState(false);

  const toggleWidget = (key: string) => {
    setVisibleWidgets(prev => {
      const k = key as WidgetKey;
      return { ...prev, [k]: !prev[k] };
    });
  };

  // Calculate drawdown data from Live equity curve
  const drawdownData = React.useMemo(() => {
    if (!strategyLab?.curves?.Live) return [];

    const curve = strategyLab.curves.Live;
    let highWaterMark = -Infinity;
    const data = [];

    // Assuming curve starts from 0 or initial balance, let's just track relative R
    // We need dates. Using index for now as we don't have precise dates for each trade point in this view easily
    // In a real app we'd map trades to dates.
    // For visualization, we'll just plot the sequence.

    let runningR = 0;
    for (let i = 0; i < curve.length; i++) {
      // Curve is typically cumulative.
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

      {/* Config Button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: SPACE.sm }}>
        <button
          className="pa-btn pa-btn--small"
          onClick={() => setShowConfig(true)}
          style={{ color: "var(--text-muted)" }}
        >
          ⚙️ Configure View
        </button>
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
              <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: SPACE.md }}>
                💼 账户资金概览 <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>(Account)</span>
              </div>
              <AccountSummaryCards
                summary={summary}
                SPACE={SPACE}
              />
            </Card>
          )}

          {visibleWidgets.capitalGrowth && (
            <CapitalGrowthChart
              strategyLab={strategyLab}
              allTradesDateRange={allTradesDateRange}
              getRColorByAccountType={getRColorByAccountType}
              SPACE={SPACE}
            />
          )}

          {visibleWidgets.drawdownAnalysis && (
            <DrawdownChart
              data={drawdownData}
            />
          )}

          {visibleWidgets.marketCycle && (
            <MarketCyclePerformance
              liveCyclePerf={liveCyclePerf}
              SPACE={SPACE}
              CYCLE_MAP={CYCLE_MAP}
            />
          )}

          {visibleWidgets.tuitionCost && (
            <TuitionCostPanel
              tuition={tuition}
              SPACE={SPACE}
            />
          )}

          {visibleWidgets.analyticsSuggestion && (
            <AnalyticsSuggestion
              analyticsSuggestion={analyticsSuggestion}
              SPACE={SPACE}
            />
          )}

          {visibleWidgets.dataAnalysis && (
            <DataAnalysisPanel
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
            />
          )}

          <AnalyticsInsightPanel
            analyticsMind={analyticsMind}
            analyticsTopStrats={analyticsTopStrats}
            SPACE={SPACE}
          />
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

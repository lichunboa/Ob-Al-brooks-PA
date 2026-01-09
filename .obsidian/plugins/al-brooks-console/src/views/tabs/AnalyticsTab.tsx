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
import { RMultiplesChart } from "../components/analytics/RMultiplesChart";
// 新增组件
import { CapitalGrowthChart } from "../components/analytics/CapitalGrowthChart";
import { AnalyticsGallery } from "../components/analytics/AnalyticsGallery";

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
  cardTightStyle: React.CSSProperties;
  cardSubtleTightStyle: React.CSSProperties;
  selectStyle: React.CSSProperties;
  SPACE: any; // 空间常量
  // 计算函数
  getDayOfMonth: (dateIso: string) => string;
  getRColorByAccountType: (accountType: AccountType) => string;
  getPoints: (values: number[], w: number, h: number, pad: number) => string;
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
  cardTightStyle,
  cardSubtleTightStyle,
  selectStyle,
  SPACE,
  getDayOfMonth,
  getRColorByAccountType,
  getPoints,
  CYCLE_MAP,
}) => {
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
          <div
            style={{
              ...cardTightStyle,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                opacity: 0.75,
                marginBottom: SPACE.md,
              }}
            >
              💼 账户资金概览{" "}
              <span
                style={{
                  fontWeight: 600,
                  opacity: 0.6,
                  fontSize: "0.85em",
                }}
              >
                (Account)
              </span>
            </div>

            <AccountSummaryCards
              summary={summary}
              cardSubtleTightStyle={cardSubtleTightStyle}
              SPACE={SPACE}
            />
          </div>

          <MarketCyclePerformance
            liveCyclePerf={liveCyclePerf}
            cardTightStyle={cardTightStyle}
            SPACE={SPACE}
            CYCLE_MAP={CYCLE_MAP}
          />

          <TuitionCostPanel
            tuition={tuition}
            cardTightStyle={cardTightStyle}
            SPACE={SPACE}
          />

          <AnalyticsSuggestion
            analyticsSuggestion={analyticsSuggestion}
            cardTightStyle={cardTightStyle}
            SPACE={SPACE}
          />

          <DataAnalysisPanel
            calendarCells={calendarCells}
            calendarDays={calendarDays}
            calendarMaxAbs={calendarMaxAbs}
            strategyAttribution={strategyAttribution}
            analyticsScope={analyticsScope}
            setAnalyticsScope={setAnalyticsScope}
            openFile={openFile}
            getDayOfMonth={getDayOfMonth}
            cardTightStyle={cardTightStyle}
            textButtonStyle={textButtonStyle}
            selectStyle={selectStyle}
            SPACE={SPACE}
          />

          <RMultiplesChart
            analyticsRecentLiveTradesAsc={analyticsRecentLiveTradesAsc}
            analyticsRMultiples={analyticsRMultiples}
            analyticsMind={analyticsMind}
            analyticsTopStrats={analyticsTopStrats}
            getRColorByAccountType={getRColorByAccountType}
            cardTightStyle={cardTightStyle}
            cardSubtleTightStyle={cardSubtleTightStyle}
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
          <CapitalGrowthChart
            strategyLab={strategyLab}
            allTradesDateRange={allTradesDateRange}
            getRColorByAccountType={getRColorByAccountType}
            cardTightStyle={cardTightStyle}
            SPACE={SPACE}
          />

          <AnalyticsGallery
            gallery={gallery}
            galleryScope={galleryScope}
            setGalleryScope={setGalleryScope}
            openFile={openFile}
            getResourceUrl={getResourceUrl}
            selectStyle={selectStyle}
            cardTightStyle={cardTightStyle}
            SPACE={SPACE}
          />
        </div>
      </div>
    </>
  );
};

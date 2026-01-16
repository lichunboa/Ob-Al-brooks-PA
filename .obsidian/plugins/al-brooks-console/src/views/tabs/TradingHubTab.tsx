import * as React from "react";
import type { App } from "obsidian";
import type { TradeRecord } from "../../core/contracts";
import type { StrategyCard } from "../../core/strategy-index";
import type { TradeIndex } from "../../core/trade-index";
import type { StrategyIndex } from "../../core/strategy-index";
import type { EnumPresets } from "../../core/enum-presets";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { TodayKpiCard } from "../components/trading/TodayKpiCard";
import { OpenTradeAssistant } from "../components/trading/OpenTradeAssistant";
import { TradeList } from "../components/TradeList";
import { DailyActionsPanel } from "../components/trading/DailyActionsPanel";

import { DailyPlan } from "../../types/plan";

/**
 * TradingHubTab Props接口
 */
export interface TradingHubTabProps {
  // 计划数据
  todayPlan?: DailyPlan;
  onGoToPlan: () => void;
  onSavePlan: (plan: DailyPlan) => Promise<void>;
  onToggleChecklistItem?: (index: number) => Promise<void>;
  onUpdateRiskLimit?: (riskLimit: number) => Promise<void>;

  // 交易数据
  latestTrade: TradeRecord | null;
  openTrade: TradeRecord | null;
  todayTrades: TradeRecord[];

  // 策略数据
  openTradeStrategy: StrategyCard | null;
  todayStrategyPicks: StrategyCard[];
  strategyIndex: StrategyIndex;

  // KPI数据
  todayKpi: {
    total: number;
    wins: number;
    losses: number;
    winRatePct: number;
    netMoney: number;
    netR: number;
  };

  // 其他数据
  todayMarketCycle?: string;
  reviewHints: Array<{ id: string; zh: string; en: string }>;

  // 索引和功能
  index: TradeIndex;
  openFile: (path: string) => void;
  canOpenTodayNote: boolean;
  onOpenTodayNote: () => void;
  can: (feature: string) => boolean;
  app?: App;
  enumPresets?: EnumPresets;
  onRefreshData?: () => Promise<void>;

  // 样式
  textButtonStyle?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
  disabledButtonStyle?: React.CSSProperties;

  // 组件
  MarkdownBlock?: React.FC<{ markdown: string; sourcePath?: string }>;
  currencyMode?: 'USD' | 'CNY';
}

/**
 * Trading Hub Tab组件
 * 显示交易中心的所有内容:KPI、策略推荐、持仓助手、今日交易、每日行动等
 */
export const TradingHubTab: React.FC<TradingHubTabProps> = ({
  todayPlan,
  onGoToPlan,
  latestTrade,
  openTrade,
  todayTrades,
  openTradeStrategy,
  todayStrategyPicks,
  strategyIndex,
  todayKpi,
  todayMarketCycle,
  reviewHints,
  openFile,
  canOpenTodayNote,
  onOpenTodayNote,
  can,
  textButtonStyle,
  buttonStyle,
  disabledButtonStyle,
  MarkdownBlock,
  app,
  enumPresets,
  currencyMode = 'USD', // Default to USD
}) => {

  // 计算所有未平仓交易
  const openTrades = React.useMemo(() => {
    return todayTrades.filter(t =>
      t.outcome !== "win" &&
      t.outcome !== "loss" &&
      t.outcome !== "scratch"
    );
  }, [todayTrades]);

  return (
    <>
      <SectionHeader title="交易中心" subtitle="Trading Hub" icon="⚔️" />
      <GlassPanel style={{ marginBottom: "16px" }}>
        <TodayKpiCard todayKpi={todayKpi} currencyMode={currencyMode} />

        <OpenTradeAssistant
          openTrade={openTrade}
          todayMarketCycle={todayMarketCycle}
          strategyIndex={strategyIndex}
          onOpenFile={openFile}
          openTrades={openTrades}
          trades={todayTrades}
          textButtonStyle={textButtonStyle}
          buttonStyle={buttonStyle}
          app={app}
          enumPresets={enumPresets}
        />


      </GlassPanel>

      <DailyActionsPanel can={can} MarkdownBlock={MarkdownBlock} />

      {/* Removed duplicate "recent trades" card; keep only the Today Trades list at top. */}
    </>
  );
}

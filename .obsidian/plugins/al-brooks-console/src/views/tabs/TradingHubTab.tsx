import * as React from "react";
import type { TradeRecord } from "../../core/contracts";
import type { StrategyCard } from "../../core/strategy-index";
import type { TradeIndex } from "../../core/trade-index";
import type { StrategyIndex } from "../../core/strategy-index";
import { TodayKpiCard } from "../components/trading/TodayKpiCard";
import { OpenTradeAssistant } from "../components/trading/OpenTradeAssistant";
import { TradeList } from "../components/TradeList";
import { DailyActionsPanel } from "../components/trading/DailyActionsPanel";
import { ReviewHintsPanel } from "../components/trading/ReviewHintsPanel";
import { MarketCyclePanel } from "../components/trading/MarketCyclePanel";
import { TodayTradesSection } from "../components/trading/TodayTradesSection";

/**
 * TradingHubTab Props接口
 */
export interface TradingHubTabProps {
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

  // 样式
  glassPanelStyle: React.CSSProperties;
  textButtonStyle: React.CSSProperties;
  buttonStyle: React.CSSProperties;
  disabledButtonStyle: React.CSSProperties;

  // 事件处理器
  onTextBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onTextBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onTextBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onTextBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;

  // 组件
  MarkdownBlock: React.FC<{ markdown: string; sourcePath?: string }>;
}

/**
 * Trading Hub Tab组件
 * 显示交易中心的所有内容:KPI、策略推荐、持仓助手、今日交易、每日行动等
 */
export function TradingHubTab(props: TradingHubTabProps): JSX.Element {
  const {
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
    glassPanelStyle,
    textButtonStyle,
    buttonStyle,
    disabledButtonStyle,
    onTextBtnMouseEnter,
    onTextBtnMouseLeave,
    onTextBtnFocus,
    onTextBtnBlur,
    onBtnMouseEnter,
    onBtnMouseLeave,
    onBtnFocus,
    onBtnBlur,
    MarkdownBlock,
  } = props;

  return (
    <>
      <div
        style={{
          margin: "12px 0 10px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>⚔️ 交易中心</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Trading Hub
        </div>
      </div>

      <ReviewHintsPanel
        latestTrade={latestTrade}
        reviewHints={reviewHints}
        glassPanelStyle={glassPanelStyle}
      />

      <div
        style={{
          ...glassPanelStyle,
          marginBottom: "16px",
        }}
      >
        <TodayKpiCard todayKpi={todayKpi} />

        <MarketCyclePanel
          todayMarketCycle={todayMarketCycle}
          todayStrategyPicks={todayStrategyPicks}
          canOpenTodayNote={canOpenTodayNote}
          onOpenTodayNote={onOpenTodayNote}
          openFile={openFile}
          buttonStyle={buttonStyle}
          disabledButtonStyle={disabledButtonStyle}
          textButtonStyle={textButtonStyle}
          onBtnMouseEnter={onBtnMouseEnter}
          onBtnMouseLeave={onBtnMouseLeave}
          onBtnFocus={onBtnFocus}
          onBtnBlur={onBtnBlur}
          onTextBtnMouseEnter={onTextBtnMouseEnter}
          onTextBtnMouseLeave={onTextBtnMouseLeave}
          onTextBtnFocus={onTextBtnFocus}
          onTextBtnBlur={onTextBtnBlur}
        />

        <OpenTradeAssistant
          openTrade={openTrade}
          openTradeStrategy={openTradeStrategy}
          todayMarketCycle={todayMarketCycle}
          strategyIndex={strategyIndex}
          onOpenFile={openFile}
          textButtonStyle={textButtonStyle}
          buttonStyle={buttonStyle}
          onTextBtnMouseEnter={onTextBtnMouseEnter}
          onTextBtnMouseLeave={onTextBtnMouseLeave}
          onTextBtnFocus={onTextBtnFocus}
          onTextBtnBlur={onTextBtnBlur}
          onBtnMouseEnter={onBtnMouseEnter}
          onBtnMouseLeave={onBtnMouseLeave}
          onBtnFocus={onBtnFocus}
          onBtnBlur={onBtnBlur}
        />


        <TodayTradesSection todayTrades={todayTrades} openFile={openFile} />
      </div>

      <DailyActionsPanel can={can} MarkdownBlock={MarkdownBlock} />

      {/* Removed duplicate "recent trades" card; keep only the Today Trades list at top. */}
    </>
  );
}

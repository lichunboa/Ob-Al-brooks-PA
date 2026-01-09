import * as React from "react";
import type { TradeRecord } from "../../core/contracts";
import type { StrategyCard } from "../../core/strategy-index";
import type { TradeIndex } from "../../core/trade-index";
import type { StrategyIndex } from "../../core/strategy-index";
import { TodayKpiCard } from "../components/trading/TodayKpiCard";
import { OpenTradeAssistant } from "../components/trading/OpenTradeAssistant";
import { TradeList } from "../components/TradeList";
import { DailyActionsPanel } from "../components/trading/DailyActionsPanel";

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

      {latestTrade && reviewHints.length > 0 && (
        <details style={{ marginBottom: "16px" }}>
          <summary
            style={{
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "0.95em",
              userSelect: "none",
              marginBottom: "8px",
            }}
          >
            扩展（不参与旧版对照）：复盘提示
          </summary>
          <div style={glassPanelStyle}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              复盘提示
              <span
                style={{
                  fontWeight: 400,
                  marginLeft: "8px",
                  color: "var(--text-muted)",
                  fontSize: "0.85em",
                }}
              >
                {latestTrade.name}
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {reviewHints.slice(0, 4).map((h) => (
                <li key={h.id} style={{ marginBottom: "6px" }}>
                  <div>{h.zh}</div>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.85em",
                    }}
                  >
                    {h.en}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      <div
        style={{
          ...glassPanelStyle,
          marginBottom: "16px",
        }}
      >
        <TodayKpiCard todayKpi={todayKpi} />

        {!todayMarketCycle && (
          <div style={{ marginBottom: "12px" }}>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9em",
                marginBottom: "10px",
              }}
            >
              创建今日日记，并设置市场周期以获取策略推荐（旧版同位置）。
            </div>
            <button
              type="button"
              disabled={!canOpenTodayNote}
              onClick={onOpenTodayNote}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={canOpenTodayNote ? buttonStyle : disabledButtonStyle}
            >
              打开/创建今日日记（设置市场周期）
            </button>
          </div>
        )}

        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9em",
            marginBottom: "10px",
          }}
        >
          市场周期：{todayMarketCycle ?? "—"}
        </div>

        {todayStrategyPicks.length > 0 && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              周期 → 策略推荐
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {todayStrategyPicks.map((s) => (
                <li
                  key={`today-pick-${s.path}`}
                  style={{ marginBottom: "6px" }}
                >
                  <button
                    type="button"
                    onClick={() => openFile(s.path)}
                    style={textButtonStyle}
                    onMouseEnter={onTextBtnMouseEnter}
                    onMouseLeave={onTextBtnMouseLeave}
                    onFocus={onTextBtnFocus}
                    onBlur={onTextBtnBlur}
                  >
                    {s.canonicalName}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

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


        <div style={{ marginTop: "16px" }}>
          <h3 style={{ marginBottom: "12px" }}>今日交易</h3>
          {todayTrades.length > 0 ? (
            <TradeList trades={todayTrades} onOpenFile={openFile} />
          ) : (
            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
              今日暂无交易记录
            </div>
          )}
        </div>
      </div>

      <DailyActionsPanel can={can} MarkdownBlock={MarkdownBlock} />

      {/* Removed duplicate "recent trades" card; keep only the Today Trades list at top. */}
    </>
  );
}

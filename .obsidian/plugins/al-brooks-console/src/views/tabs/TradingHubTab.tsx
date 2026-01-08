import * as React from "react";
import type { TradeRecord } from "../../core/contracts";
import type { StrategyCard } from "../../core/strategy-index";
import type { TradeIndex } from "../../core/trade-index";
import type { StrategyIndex } from "../../core/strategy-index";
import { TodayKpiCard } from "../components/trading/TodayKpiCard";
import { OpenTradeAssistant } from "../components/trading/OpenTradeAssistant";
import { TradeList } from "../components/TradeList";

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

      <div
        style={{
          margin: "18px 0 10px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>✅ 每日行动</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Actions
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        {!can("tasks:open") ? (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            v5.0 在控制台内联展示 Tasks 查询块；当前未检测到 Tasks
            集成可用（请安装/启用 Tasks 插件）。
          </div>
        ) : null}

        <div
          style={{
            marginTop: "12px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "10px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>
              🔥 必须解决 (Inbox & Urgent)
            </div>
            <MarkdownBlock
              markdown={`**❓ 疑难杂症 (Questions)**\n\n\`\`\`tasks\nnot done\ntag includes #task/question\npath does not include Templates\nhide backlink\nshort mode\n\`\`\`\n\n**🚨 紧急事项 (Urgent)**\n\n\`\`\`tasks\nnot done\ntag includes #task/urgent\npath does not include Templates\nhide backlink\nshort mode\n\`\`\`\n`}
            />
          </div>

          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "10px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>
              🛠️ 持续改进 (Improvement)
            </div>
            <MarkdownBlock
              markdown={`**🧪 回测任务 (Backtest)**\n\n\`\`\`tasks\nnot done\ntag includes #task/backtest\npath does not include Templates\nhide backlink\nshort mode\n\`\`\`\n\n**📝 复盘任务 (Review)**\n\n\`\`\`tasks\nnot done\ntag includes #task/review\npath does not include Templates\nhide backlink\nshort mode\n\`\`\`\n\n**📖 待学习/阅读 (Study)**\n\n\`\`\`tasks\nnot done\n(tag includes #task/study) OR (tag includes #task/read) OR (tag includes #task/watch)\npath does not include Templates\nlimit 5\nhide backlink\nshort mode\n\`\`\`\n\n**🔬 待验证想法 (Verify)**\n\n\`\`\`tasks\nnot done\ntag includes #task/verify\npath does not include Templates\nhide backlink\nshort mode\n\`\`\`\n`}
            />
          </div>

          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "10px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>
              📅 每日例行 (Routine)
            </div>
            <MarkdownBlock
              markdown={`**📝 手动打卡 (Checklist)**\n\n- [ ] ☀️ **盘前**：阅读新闻，标记关键位 (S/R Levels) 🔁 every day\n- [ ] 🧘 **盘中**：每小时检查一次情绪 (FOMO Check) 🔁 every day\n- [ ] 🌙 **盘后**：填写当日 \`复盘日记\` 🔁 every day\n\n**🧹 杂项待办 (To-Do)**\n\n\`\`\`tasks\nnot done\ntag includes #task/todo\npath does not include Templates\nhide backlink\nshort mode\nlimit 5\n\`\`\`\n`}
            />
          </div>

          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "10px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>
              🛠️ 等待任务 (Maintenance)
            </div>
            <MarkdownBlock
              markdown={`**🖨️ 待打印 (Print Queue)**\n\n\`\`\`tasks\nnot done\ntag includes #task/print\npath does not include Templates\nhide backlink\nshort mode\n\`\`\`\n\n**📂 待整理 (Organize)**\n\n\`\`\`tasks\nnot done\ntag includes #task/organize\npath does not include Templates\nhide backlink\nshort mode\n\`\`\`\n`}
            />
          </div>
        </div>
      </div>

      {/* Removed duplicate "recent trades" card; keep only the Today Trades list at top. */}
    </>
  );
}

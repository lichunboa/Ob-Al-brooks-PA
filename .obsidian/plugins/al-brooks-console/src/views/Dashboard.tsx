import * as React from "react";
import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  MarkdownRenderer,
  Component,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type { TradeIndex, TradeIndexStatus } from "../core/trade-index";
import { computeTradeStatsByAccountType } from "../core/stats";
import { buildReviewHints } from "../core/review-hints";
import type { AccountType, TradeRecord } from "../core/contracts";
import type { StrategyIndex } from "../core/strategy-index";
import { matchStrategies } from "../core/strategy-matcher";
import { StatsCard } from "./components/StatsCard";
import { StrategyStats } from "./components";
import { TradeList } from "./components/TradeList";
import { StrategyList } from "./components/StrategyList";
import { ContextWidget, ErrorWidget } from "./components/AnalyticsWidgets";
import {
  computeDailyAgg,
  computeEquityCurve,
  computeStrategyAttribution,
  identifyStrategyForAnalytics,
  normalizeMarketCycleForAnalytics,
  computeContextAnalysis,
  computeErrorAnalysis,
  computeTuitionAnalysis,
  filterTradesByScope,
  type AnalyticsScope,
  type DailyAgg,

    const curves: Record<AccountType, number[]> = {
      Live: [0],
      Demo: [0],
      Backtest: [0],
    };
    const cum: Record<AccountType, number> = {
      Live: 0,
            width: "70px",
            color: "var(--text-muted)",
            fontSize: "0.85em",
          }}
        >
          {label}
        </div>
        <div
          style={{
            flex: "1 1 auto",
            display: "flex",
            height: "10px",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "999px",
            overflow: "hidden",
            background: "rgba(var(--mono-rgb-100), 0.03)",
          }}
        >
          <div style={{ flex: "1 1 0", position: "relative" }}>
            {ratio < 0 && (
              <div
                style={{
            onClick={onRebuild}
            onMouseEnter={onBtnMouseEnter}
            onMouseLeave={onBtnMouseLeave}
            onFocus={onBtnFocus}
            onBlur={onBtnBlur}
            style={{ ...buttonStyle, marginLeft: "12px" }}
          >
            重建索引
          </button>
        )}
      </h2>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          margin: "-6px 0 14px",
        }}
      >
        {(
          [
            { id: "trading", label: "交易中心" },
            { id: "analytics", label: "数据中心" },
            { id: "learn", label: "学习模块" },
            { id: "manage", label: "管理/维护" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActivePage(t.id)}
            style={t.id === activePage ? activeTabButtonStyle : tabButtonStyle}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activePage === "trading" ? (
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
              <div
                style={{
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "10px",
                  padding: "12px",
                  background: "var(--background-primary)",
                }}
              >
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

          <>
            <div
              style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "16px",
                background: "var(--background-primary)",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>今日</div>

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

              {openTrade && (
                <div>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              进行中交易助手
            </div>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9em",
                marginBottom: "8px",
              }}
            >
              <button
                type="button"
                onClick={() => openFile(openTrade.path)}
                style={textButtonStyle}
                onMouseEnter={onTextBtnMouseEnter}
                onMouseLeave={onTextBtnMouseLeave}
                onFocus={onTextBtnFocus}
                onBlur={onTextBtnBlur}
              >
                {openTrade.ticker ?? "未知"} • {openTrade.name}
              </button>
            </div>

            {openTradeStrategy ? (
              <div>
                <div style={{ marginBottom: "8px" }}>
                  策略:{" "}
                  <button
                    type="button"
                    onClick={() => openFile(openTradeStrategy.path)}
                    style={textButtonStyle}
                    onMouseEnter={onTextBtnMouseEnter}
                    onMouseLeave={onTextBtnMouseLeave}
                    onFocus={onTextBtnFocus}
                    onBlur={onTextBtnBlur}
                  >
                    {openTradeStrategy.canonicalName}
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: "8px",
                  }}
                >
                  {(openTradeStrategy.entryCriteria?.length ?? 0) > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                        入场
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {openTradeStrategy
                          .entryCriteria!.slice(0, 3)
                          .map((x, i) => (
                            <li key={`entry-${i}`}>{x}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {(openTradeStrategy.stopLossRecommendation?.length ?? 0) >
                    0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                        止损
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {openTradeStrategy
                          .stopLossRecommendation!.slice(0, 3)
                          .map((x, i) => (
                            <li key={`stop-${i}`}>{x}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {(openTradeStrategy.riskAlerts?.length ?? 0) > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                        风险
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {openTradeStrategy
                          .riskAlerts!.slice(0, 3)
                          .map((x, i) => (
                            <li key={`risk-${i}`}>{x}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {(openTradeStrategy.takeProfitRecommendation?.length ?? 0) >
                    0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                        目标
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {openTradeStrategy
                          .takeProfitRecommendation!.slice(0, 3)
                          .map((x, i) => (
                            <li key={`tp-${i}`}>{x}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>

                {(() => {
                  const curSignals = (openTrade.signalBarQuality ?? [])
                    .map((s) => String(s).trim())
                    .filter(Boolean);
                  const reqSignals = (openTradeStrategy.signalBarQuality ?? [])
                    .map((s) => String(s).trim())
                    .filter(Boolean);

                  const hasSignalInfo =
                    curSignals.length > 0 || reqSignals.length > 0;
                  if (!hasSignalInfo) return null;

                  const norm = (s: string) => s.toLowerCase();
                  const signalMatch =
                    curSignals.length > 0 && reqSignals.length > 0
                      ? reqSignals.some((r) =>
                          curSignals.some((c) => {
                            const rn = norm(r);
                            const cn = norm(c);
                            return rn.includes(cn) || cn.includes(rn);
                          })
                        )
                      : null;

                  return (
                    <div
                      style={{
                        marginTop: "10px",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "10px",
                        padding: "10px",
                        background: "rgba(var(--mono-rgb-100), 0.03)",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                        🔍 信号K验证
                      </div>

                      {curSignals.length > 0 ? (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "6px",
                          }}
                        >
                          当前：
                          <span style={{ color: "var(--text-accent)" }}>
                            {curSignals.join(" / ")}
                          </span>
                        </div>
                      ) : (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "6px",
                          }}
                        >
                          当前：—
                        </div>
                      )}

                      {reqSignals.length > 0 ? (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "6px",
                          }}
                        >
                          建议：{reqSignals.join(" / ")}
                        </div>
                      ) : (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "6px",
                          }}
                        >
                          建议：未在策略卡中定义
                        </div>
                      )}

                      {signalMatch === null ? null : (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                          }}
                        >
                          匹配：
                          <span
                            style={{
                              marginLeft: "6px",
                              color: signalMatch
                                ? "var(--text-success)"
                                : "var(--text-warning)",
                              fontWeight: 700,
                            }}
                          >
                            {signalMatch ? "✅" : "⚠️"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              (() => {
                const marketCycleRaw = (openTrade.marketCycle ?? todayMarketCycle)
                  ?.toString()
                  .trim();
                const marketCycle = marketCycleRaw
                  ? marketCycleRaw.includes("(")
                    ? marketCycleRaw.split("(")[0].trim()
                    : marketCycleRaw
                  : undefined;
                const setupCategory = openTrade.setupCategory
                  ?.toString()
                  .trim();
                const setupKey = openTrade.setupKey?.toString().trim();
                const hasHints = Boolean(marketCycle || setupCategory);

                if (!hasHints) {
                  return (
                    <div
                      style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                    >
                      未找到匹配策略。
                    </div>
                  );
                }

                const norm = (s: string) => s.toLowerCase();
                const wantCycleKey = marketCycle
                  ? norm(marketCycle)
                  : undefined;
                const wantSetupKey = (setupCategory || setupKey)
                  ? norm(String(setupCategory || setupKey))
                  : undefined;

                const scored = strategyIndex
                  .list()
                  .map((card) => {
                    let score = 0;
                    if (
                      wantCycleKey &&
                      card.marketCycles.some((c) => {
                        const ck = norm(String(c));
                        return (
                          ck.includes(wantCycleKey) || wantCycleKey.includes(ck)
                        );
                      })
                    ) {
                      score += 2;
                    }
                    if (
                      wantSetupKey &&
                      card.setupCategories.some((c) => {
                        const ck = norm(String(c));
                        return (
                          ck.includes(wantSetupKey) || wantSetupKey.includes(ck)
                        );
                      })
                    ) {
                      score += 1;
                    }
                    return { card, score };
                  })
                  .filter((x) => x.score > 0)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map((x) => x.card);

                if (scored.length === 0) {
                  return (
                    <div
                      style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                    >
                      未找到匹配策略。
                    </div>
                  );
                }

                return (
                  <div>
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.9em",
                        marginBottom: "8px",
                      }}
                    >
                      💡 基于当前市场背景（{marketCycle ?? "未知"}）的策略建议：
                    </div>
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                    >
                      {scored.map((s) => (
                        <button
                          key={`today-fallback-${s.path}`}
                          type="button"
                          onClick={() => openFile(s.path)}
                          style={buttonStyle}
                          onMouseEnter={onBtnMouseEnter}
                          onMouseLeave={onBtnMouseLeave}
                          onFocus={onBtnFocus}
                          onBlur={onBtnBlur}
                        >
                          {s.canonicalName}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()
            )}
                </div>
              )}

              <div style={{ marginTop: "16px" }}>
                <h3 style={{ marginBottom: "12px" }}>最近活动</h3>
                <TradeList
                  trades={trades.slice(0, 50)}
                  onOpenFile={openFile}
                />
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
                    markdown={`**❓ 疑难杂症 (Questions)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/question\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**🚨 紧急事项 (Urgent)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/urgent\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n`}
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
                    markdown={`**🧪 回测任务 (Backtest)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/backtest\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**📝 复盘任务 (Review)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/review\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**📖 待学习/阅读 (Study)**\n\n\
\`\`\`tasks\n\
not done\n\
(tag includes #task/study) OR (tag includes #task/read) OR (tag includes #task/watch)\n\
path does not include Templates\n\
limit 5\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**🔬 待验证想法 (Verify)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/verify\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n`}
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
                    markdown={`**📝 手动打卡 (Checklist)**\n\n\
- [ ] ☀️ **盘前**：阅读新闻，标记关键位 (S/R Levels) 🔁 every day\n\
- [ ] 🧘 **盘中**：每小时检查一次情绪 (FOMO Check) 🔁 every day\n\
- [ ] 🌙 **盘后**：填写当日 \`复盘日记\` 🔁 every day\n\n\
**🧹 杂项待办 (To-Do)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/todo\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
limit 5\n\
\`\`\`\n`}
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
                    markdown={`**🖨️ 待打印 (Print Queue)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/print\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**📂 待整理 (Organize)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/organize\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n`}
                  />
                </div>
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
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: "2 1 520px", minWidth: "320px" }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                      marginBottom: "12px",
                    }}
                  >
                    {(
                      [
                        {
                          t: "总交易",
                          v: String(todaySummary.All.countTotal),
                          c: "var(--text-normal)",
                        },
                        {
                          t: "获胜",
                          v: String(todaySummary.All.countWins),
                          c: "var(--text-success)",
                        },
                        {
                          t: "亏损",
                          v: String(todaySummary.All.countLosses),
                          c: "var(--text-error)",
                        },
                        {
                          t: "胜率",
                          v: `${todaySummary.All.winRatePct}%`,
                          c:
                            todaySummary.All.winRatePct >= 50
                              ? "var(--text-success)"
                              : "var(--text-warning)",
                        },
                        {
                          t: "净利润",
                          v: `${
                            todaySummary.All.netProfit >= 0 ? "+" : ""
                          }${todaySummary.All.netProfit.toFixed(1)}R`,
                          c:
                            todaySummary.All.netProfit >= 0
                              ? "var(--text-success)"
                              : "var(--text-error)",
                        },
                      ] as const
                    ).map((x) => (
                      <div
                        key={`today-m-${x.t}`}
                        style={{
                          flex: "1 1 160px",
                          minWidth: "160px",
                          border: "1px solid var(--background-modifier-border)",
                          borderRadius: "12px",
                          padding: "12px",
                          background: "rgba(var(--mono-rgb-100), 0.03)",
                        }}
                      >
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.85em",
                          }}
                        >
                          {x.t}
                        </div>
                        <div
                          style={{
                            marginTop: "6px",
                            fontWeight: 800,
                            fontSize: "1.2rem",
                            color: x.c,
                          }}
                        >
                          {x.v}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: "6px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                      最近交易记录
                    </div>
                    {todayTrades.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {todayTrades.slice(0, 5).map((t) => {
                          const dir = (t.direction ?? "").toString().trim();
                          const dirIcon =
                            dir === "多" || dir.toLowerCase() === "long"
                              ? "📈"
                              : dir === "空" || dir.toLowerCase() === "short"
                              ? "📉"
                              : "➡️";
                          const tf = (t.timeframe ?? "").toString().trim();
                          const ident = identifyStrategyForAnalytics(
                            t,
                            strategyIndex
                          );
                          const strategy =
                            ident.name && ident.name !== "Unknown"
                              ? ident.name
                              : "";

                          const outcome = t.outcome;
                          const outcomeLabel =
                            outcome === "win"
                              ? "Win"
                              : outcome === "loss"
                              ? "Loss"
                              : outcome === "scratch"
                              ? "Scratch"
                              : outcome === "open" ||
                                outcome === "unknown" ||
                                outcome === undefined
                              ? "进行中"
                              : String(outcome);
                          const outcomeColor =
                            outcome === "win"
                              ? "var(--text-success)"
                              : outcome === "loss"
                              ? "var(--text-error)"
                              : outcome === "scratch"
                              ? "var(--text-warning)"
                              : "var(--text-muted)";

                          const pnl =
                            typeof t.pnl === "number" && Number.isFinite(t.pnl)
                              ? t.pnl
                              : undefined;
                          const pnlColor =
                            pnl === undefined
                              ? "var(--text-muted)"
                              : pnl >= 0
                              ? "var(--text-success)"
                              : "var(--text-error)";

                          const entry =
                            (t.rawFrontmatter?.[
                              "entry"
                            ] as unknown as string | undefined) ??
                            (t.rawFrontmatter?.[
                              "入场"
                            ] as unknown as string | undefined);
                          const stop =
                            (t.rawFrontmatter?.[
                              "stop"
                            ] as unknown as string | undefined) ??
                            (t.rawFrontmatter?.[
                              "止损"
                            ] as unknown as string | undefined);

                          return (
                            <li key={t.path} style={{ marginBottom: "10px" }}>
                              <button
                                type="button"
                                onClick={() => openFile(t.path)}
                                style={textButtonStyle}
                                onMouseEnter={onTextBtnMouseEnter}
                                onMouseLeave={onTextBtnMouseLeave}
                                onFocus={onTextBtnFocus}
                                onBlur={onTextBtnBlur}
                              >
                                {dirIcon} {t.ticker ?? "未知"}
                                {tf ? ` ${tf}` : ""}
                                {strategy ? ` - ${strategy}` : ""}
                              </button>

                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "10px",
                                  marginTop: "4px",
                                  color: "var(--text-muted)",
                                  fontSize: "0.85em",
                                }}
                              >
                                <span
                                  style={{
                                    padding: "1px 6px",
                                    borderRadius: "6px",
                                    border:
                                      "1px solid var(--background-modifier-border)",
                                    color: outcomeColor,
                                  }}
                                >
                                  {outcomeLabel}
                                </span>
                                {entry ? <span>入场: {String(entry)}</span> : null}
                                {stop ? <span>止损: {String(stop)}</span> : null}
                                {pnl !== undefined ? (
                                  <span style={{ color: pnlColor, fontWeight: 700 }}>
                                    PnL: {pnl >= 0 ? "+" : ""}
                                    {pnl.toFixed(1)}R
                                  </span>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div
                        style={{ color: "var(--text-faint)", padding: "4px 0" }}
                      >
                        今日暂无交易记录
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ flex: "1 1 320px", minWidth: "280px" }}>
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                      快捷入口
                    </div>
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                    >
                      <button
                        type="button"
                        disabled={!can("quickadd:new-live-trade")}
                        onClick={() => action("quickadd:new-live-trade")}
                        onMouseEnter={onBtnMouseEnter}
                        onMouseLeave={onBtnMouseLeave}
                        onFocus={onBtnFocus}
                        onBlur={onBtnBlur}
                        style={
                          can("quickadd:new-live-trade")
                            ? buttonStyle
                            : disabledButtonStyle
                        }
                      >
                        新建实盘
                      </button>
                      <button
                        type="button"
                        disabled={!can("quickadd:new-demo-trade")}
                        onClick={() => action("quickadd:new-demo-trade")}
                        onMouseEnter={onBtnMouseEnter}
                        onMouseLeave={onBtnMouseLeave}
                        onFocus={onBtnFocus}
                        onBlur={onBtnBlur}
                        style={
                          can("quickadd:new-demo-trade")
                            ? buttonStyle
                            : disabledButtonStyle
                        }
                      >
                        新建模拟
                      </button>
                      <button
                        type="button"
                        disabled={!can("quickadd:new-backtest")}
                        onClick={() => action("quickadd:new-backtest")}
                        onMouseEnter={onBtnMouseEnter}
                        onMouseLeave={onBtnMouseLeave}
                        onFocus={onBtnFocus}
                        onBlur={onBtnBlur}
                        style={
                          can("quickadd:new-backtest")
                            ? buttonStyle
                            : disabledButtonStyle
                        }
                      >
                        新建回测
                      </button>
                      {!can("quickadd:new-live-trade") &&
                        !can("quickadd:new-demo-trade") &&
                        !can("quickadd:new-backtest") && (
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "0.85em",
                              alignSelf: "center",
                            }}
                          >
                            QuickAdd 不可用
                          </span>
                        )}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                      近期 R 趋势
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginBottom: "10px",
                      }}
                    >
                      <div style={{ flex: "1 1 220px", minWidth: "220px" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            fontSize: "0.75em",
                            marginBottom: "6px",
                            color: "var(--text-muted)",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ color: getRColorByAccountType("Live") }}>
                            ● 实盘
                          </span>
                          <span style={{ color: getRColorByAccountType("Demo") }}>
                            ● 模拟
                          </span>
                          <span
                            style={{ color: getRColorByAccountType("Backtest") }}
                          >
                            ● 回测
                          </span>
                        </div>

                        {last30TradesDesc.length === 0 ? (
                          <div
                            style={{ color: "var(--text-faint)", fontSize: "0.85em" }}
                          >
                            暂无交易数据
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-end",
                              gap: "4px",
                              height: "70px",
                              borderBottom:
                                "1px solid var(--background-modifier-border)",
                              paddingBottom: "6px",
                            }}
                          >
                            {last30TradesDesc
                              .slice()
                              .reverse()
                              .map((t) => {
                                const r =
                                  typeof t.pnl === "number" &&
                                  Number.isFinite(t.pnl)
                                    ? t.pnl
                                    : 0;
                                const h = Math.max(
                                  4,
                                  Math.round((Math.abs(r) / last30MaxAbsR) * 56)
                                );
                                const color =
                                  r >= 0
                                    ? getRColorByAccountType(t.accountType ?? "Live")
                                    : "var(--text-error)";
                                const title = `${t.name}\n${
                                  t.accountType ?? "—"
                                }\nR: ${r.toFixed(2)}`;
                                return (
                                  <div
                                    key={t.path}
                                    title={title}
                                    style={{
                                      width: "6px",
                                      height: `${h}px`,
                                      background: color,
                                      borderRadius: "2px",
                                      opacity: r >= 0 ? 1 : 0.7,
                                    }}
                                  />
                                );
                              })}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          flex: "1 1 180px",
                          minWidth: "180px",
                          border: "1px solid var(--background-modifier-border)",
                          borderRadius: "10px",
                          padding: "10px",
                          background: "rgba(var(--mono-rgb-100), 0.03)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            opacity: 0.75,
                            marginBottom: "6px",
                          }}
                        >
                          🧠 实盘心态
                        </div>
                        <div
                          style={{
                            fontSize: "1.2em",
                            fontWeight: 900,
                            color: liveMind.color,
                          }}
                        >
                          {liveMind.status}
                        </div>
                        <div
                          style={{
                            color: "var(--text-faint)",
                            fontSize: "0.85em",
                            marginTop: "6px",
                          }}
                        >
                          近期错误：追单(FOMO) {liveMind.fomo} | 上头(Tilt) {liveMind.tilt}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.85em",
                        marginBottom: "8px",
                      }}
                    >
                      最近 10 笔
                    </div>
                    {(["Live", "Demo", "Backtest"] as const).map((at) => (
                      <TrendRow
                        key={`r10-${at}`}
                        label={at === "Live" ? "实盘" : at === "Demo" ? "模拟" : "回测"}
                        value={rLast10[at]}
                        ratio={r10MaxAbs > 0 ? rLast10[at] / r10MaxAbs : 0}
                        color={getRColorByAccountType(at)}
                      />
                    ))}
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.85em",
                        margin: "10px 0 8px",
                      }}
                    >
                      最近 30 笔
                    </div>
                    {(["Live", "Demo", "Backtest"] as const).map((at) => (
                      <TrendRow
                        key={`r30-${at}`}
                        label={at === "Live" ? "实盘" : at === "Demo" ? "模拟" : "回测"}
                        value={rLast30[at]}
                        ratio={r30MaxAbs > 0 ? rLast30[at] / r30MaxAbs : 0}
                        color={getRColorByAccountType(at)}
                      />
                    ))}
                  </div>

                  <div style={{ marginTop: "14px" }}>
                    <button
                      type="button"
                      disabled={!canCreateTrade && !createTradeNote}
                      onClick={() => {
                        if (can("quickadd:new-live-trade"))
                          return action("quickadd:new-live-trade");
                        if (can("quickadd:new-demo-trade"))
                          return action("quickadd:new-demo-trade");
                        if (can("quickadd:new-backtest"))
                          return action("quickadd:new-backtest");
                        void createTradeNote?.();
                      }}
                      onMouseEnter={(e) => {
                        if (e.currentTarget.disabled) return;
                        e.currentTarget.style.filter = "brightness(1.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.filter = "none";
                      }}
                      style={
                        canCreateTrade || createTradeNote
                          ? {
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "10px",
                              border:
                                "1px solid var(--background-modifier-border)",
                              background: "var(--interactive-accent)",
                              color: "var(--text-on-accent)",
                              fontWeight: 800,
                              cursor: "pointer",
                            }
                          : {
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "10px",
                              border:
                                "1px solid var(--background-modifier-border)",
                              background: "var(--background-primary)",
                              color: "var(--text-faint)",
                              fontWeight: 800,
                              opacity: 0.6,
                              cursor: "not-allowed",
                            }
                      }
                    >
                      创建新交易笔记（图表分析 → 形态识别 → 策略匹配）
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        </>
      ) : null}

      {activePage === "analytics" ? (
        <>
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
            <div style={{ fontWeight: 700 }}>📊 数据中心</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
              Analytics Hub
            </div>
          </div>

      {/* Stats Row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <StatsCard title="总笔数" value={all.countTotal} icon="📊" />
        <StatsCard
          title="累计盈亏"
          value={`${all.netProfit > 0 ? "+" : ""}${all.netProfit.toFixed(1)}R`}
          color={
            all.netProfit >= 0 ? "var(--text-success)" : "var(--text-error)"
          }
          icon="💰"
        />
        <StatsCard
          title="胜率"
          value={`${all.winRatePct}%`}
          color={
            all.winRatePct > 50 ? "var(--text-success)" : "var(--text-warning)"
          }
          icon="🎯"
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <StatsCard
          title="实盘"
          value={`${summary.Live.countTotal} 笔`}
          subValue={`${
            summary.Live.winRatePct
          }% • ${summary.Live.netProfit.toFixed(1)}R`}
          icon="🟢"
        />
        <StatsCard
          title="模拟"
          value={`${summary.Demo.countTotal} 笔`}
          subValue={`${
            summary.Demo.winRatePct
          }% • ${summary.Demo.netProfit.toFixed(1)}R`}
          icon="🟡"
        />
        <StatsCard
          title="回测"
          value={`${summary.Backtest.countTotal} 笔`}
          subValue={`${
            summary.Backtest.winRatePct
          }% • ${summary.Backtest.netProfit.toFixed(1)}R`}
          icon="🔵"
        />
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
        <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "12px" }}>
          💼 账户资金概览{" "}
          <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>
            (Account)
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              flex: "1.5 1 360px",
              minWidth: "320px",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "12px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "10px",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: "1.1em",
                  color: "var(--text-success)",
                }}
              >
                🟢 实盘账户
              </div>
              <div
                style={{
                  fontSize: "0.8em",
                  color: "var(--text-muted)",
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "999px",
                  padding: "2px 8px",
                  background: "var(--background-primary)",
                }}
              >
                Live
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "6px",
                marginTop: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "2.2em",
                  fontWeight: 900,
                  lineHeight: 1,
                  color:
                    summary.Live.netProfit >= 0
                      ? "var(--text-success)"
                      : "var(--text-error)",
                }}
              >
                {summary.Live.netProfit > 0 ? "+" : ""}
                {summary.Live.netProfit.toFixed(1)}
              </div>
              <div style={{ color: "var(--text-faint)", fontSize: "0.95em" }}>
                R
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "14px",
                marginTop: "10px",
                color: "var(--text-muted)",
                fontSize: "0.9em",
                flexWrap: "wrap",
              }}
            >
              <div>📦 {summary.Live.countTotal} 笔交易</div>
              <div>🎯 {summary.Live.winRatePct}% 胜率</div>
            </div>
          </div>

          <div
            style={{
              flex: "1 1 260px",
              minWidth: "260px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {(
              [
                {
                  title: "模拟盘",
                  icon: "🔵",
                  stats: summary.Demo,
                },
                {
                  title: "复盘回测",
                  icon: "🟠",
                  stats: summary.Backtest,
                },
              ] as const
            ).map((card) => (
              <div
                key={card.title}
                style={{
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "10px",
                  padding: "12px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "var(--text-muted)" }}>
                    {card.icon} {card.title}
                  </div>
                  <div
                    style={{ fontSize: "0.8em", color: "var(--text-faint)" }}
                  >
                    {card.stats.countTotal} 笔
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "6px",
                    marginTop: "6px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.6em",
                      fontWeight: 900,
                      color:
                        card.stats.netProfit >= 0
                          ? "var(--text-success)"
                          : "var(--text-error)",
                    }}
                  >
                    {card.stats.netProfit > 0 ? "+" : ""}
                    {card.stats.netProfit.toFixed(1)}
                  </div>
                  <div
                    style={{ color: "var(--text-faint)", fontSize: "0.95em" }}
                  >
                    R
                  </div>
                </div>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.9em",
                    marginTop: "4px",
                  }}
                >
                  胜率：{card.stats.winRatePct}%
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            paddingTop: "12px",
            borderTop: "1px solid var(--background-modifier-border)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "10px",
              marginBottom: "10px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text-muted)" }}>
              📅 盈亏日历 ({accountTargetMonth})
            </div>
            <div style={{ fontSize: "0.8em", color: "var(--text-faint)" }}>
              All Accounts
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "6px",
            }}
          >
            {Array.from({ length: accountDaysInMonth }, (_, i) => i + 1).map(
              (day) => {
                const data = accountDailyMap.get(day);
                const pnl = data?.total;
                const hasTrade = pnl !== undefined;
                const color = !hasTrade
                  ? "var(--text-faint)"
                  : pnl! > 0
                  ? "var(--text-success)"
                  : pnl! < 0
                  ? "var(--text-error)"
                  : "var(--text-muted)";
                const bg = !hasTrade
                  ? "rgba(var(--mono-rgb-100), 0.02)"
                  : pnl! > 0
                  ? "rgba(var(--color-green-rgb), 0.12)"
                  : pnl! < 0
                  ? "rgba(var(--color-red-rgb), 0.12)"
                  : "rgba(var(--mono-rgb-100), 0.06)";

                return (
                  <div
                    key={`${accountTargetMonth}-${day}`}
                    title={`${accountTargetMonth}-${String(day).padStart(
                      2,
                      "0"
                    )} PnL: ${hasTrade ? pnl!.toFixed(2) : "0"}`}
                    style={{
                      aspectRatio: "1",
                      background: bg,
                      border: "1px solid var(--background-modifier-border)",
                      borderRadius: "8px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "2px",
                    }}
                  >
                    <div
                      style={{ fontSize: "0.75em", color: "var(--text-faint)" }}
                    >
                      {day}
                    </div>
                    {hasTrade ? (
                      <div
                        style={{
                          fontSize: "0.85em",
                          fontWeight: 800,
                          color,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {pnl! > 0 ? "+" : ""}
                        {pnl!.toFixed(0)}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: "0.85em",
                          fontWeight: 700,
                          color: "var(--text-faint)",
                          opacity: 0.4,
                        }}
                      >
                        —
                      </div>
                    )}

                    {hasTrade ? (
                      <div
                        style={{
                          display: "flex",
                          gap: "2px",
                          height: "5px",
                          width: "80%",
                          marginTop: "2px",
                          opacity: 0.95,
                        }}
                      >
                        {data?.types.has("Live") && (
                          <div
                            style={{
                              flex: 1,
                              background: getRColorByAccountType("Live"),
                              borderRadius: "2px",
                            }}
                          />
                        )}
                        {data?.types.has("Demo") && (
                          <div
                            style={{
                              flex: 1,
                              background: getRColorByAccountType("Demo"),
                              borderRadius: "2px",
                            }}
                          />
                        )}
                        {data?.types.has("Backtest") && (
                          <div
                            style={{
                              flex: 1,
                              background: getRColorByAccountType("Backtest"),
                              borderRadius: "2px",
                            }}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              }
            )}
          </div>
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
        <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "10px" }}>
          🌪️ 不同市场环境表现{" "}
          <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>
            (Live PnL)
          </span>
        </div>
        {liveCyclePerf.length === 0 ? (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            暂无数据
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {liveCyclePerf.map((cy) => {
              const color =
                cy.pnl > 0
                  ? "var(--text-success)"
                  : cy.pnl < 0
                  ? "var(--text-error)"
                  : "var(--text-muted)";
              return (
                <div
                  key={cy.name}
                  style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    minWidth: "120px",
                    flex: "1 1 180px",
                    background: "rgba(var(--mono-rgb-100), 0.03)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{ fontSize: "0.85em", color: "var(--text-muted)" }}
                  >
                    {cycleMap[cy.name] ?? cy.name}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      color,
                      fontVariantNumeric: "tabular-nums",
                      marginTop: "2px",
                    }}
                  >
                    {cy.pnl > 0 ? "+" : ""}
                    {cy.pnl.toFixed(1)}R
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
        <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "10px" }}>
          💸 错误的代价{" "}
          <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>
            (学费统计)
          </span>
        </div>
        {tuition.tuitionR <= 0 ? (
          <div style={{ color: "var(--text-success)", fontWeight: 700 }}>
            🎉 完美！近期实盘没有因纪律问题亏损。
          </div>
        ) : (
          <div>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9em",
                marginBottom: "10px",
              }}
            >
              因执行错误共计亏损：
              <span
                style={{
                  color: "var(--text-error)",
                  fontWeight: 900,
                  marginLeft: "6px",
                }}
              >
                -{tuition.tuitionR.toFixed(1)}R
              </span>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {tuition.rows.slice(0, 5).map((row) => {
                const pct = Math.round((row.costR / tuition.tuitionR) * 100);
                return (
                  <div
                    key={row.tag}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "0.9em",
                    }}
                  >
                    <div
                      style={{
                        width: "110px",
                        color: "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={row.tag}
                    >
                      {row.tag}
                    </div>
                    <div
                      style={{
                        flex: "1 1 auto",
                        background: "rgba(var(--mono-rgb-100), 0.03)",
                        height: "6px",
                        borderRadius: "999px",
                        overflow: "hidden",
                        border: "1px solid var(--background-modifier-border)",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: "var(--text-error)",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        width: "70px",
                        textAlign: "right",
                        color: "var(--text-error)",
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      -{row.costR.toFixed(1)}R
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
        <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "10px" }}>
          💡 系统建议{" "}
          <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>
            (Actions)
          </span>
        </div>
        <div
          style={{
            fontSize: "0.95em",
            lineHeight: 1.6,
            padding: "10px 12px",
            borderRadius: "10px",
            background:
              analyticsSuggestion.tone === "danger"
                ? "rgba(var(--color-red-rgb), 0.12)"
                : analyticsSuggestion.tone === "warn"
                ? "rgba(var(--color-yellow-rgb), 0.12)"
                : "rgba(var(--color-green-rgb), 0.10)",
            border: "1px solid var(--background-modifier-border)",
            color:
              analyticsSuggestion.tone === "danger"
                ? "var(--text-error)"
                : analyticsSuggestion.tone === "warn"
                ? "var(--text-warning)"
                : "var(--text-success)",
            fontWeight: 700,
          }}
        >
          {analyticsSuggestion.text}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>数据分析</div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--text-muted)",
              fontSize: "0.9em",
            }}
          >
            范围
            <select
              value={analyticsScope}
              onChange={(e) =>
                setAnalyticsScope(e.target.value as AnalyticsScope)
              }
              style={selectStyle}
            >
              <option value="Live">实盘</option>
              <option value="Demo">模拟</option>
              <option value="Backtest">回测</option>
              <option value="All">全部</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
          <div style={{ flex: "1 1 320px", minWidth: "320px" }}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              日历（最近 {calendarDays} 天）
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: "6px",
              }}
            >
              {calendarCells.map((c) => {
                const absRatio =
                  calendarMaxAbs > 0
                    ? Math.min(1, Math.abs(c.netR) / calendarMaxAbs)
                    : 0;
                const alpha = c.count > 0 ? 0.12 + 0.55 * absRatio : 0.04;
                const bg =
                  c.netR > 0
                    ? `rgba(var(--color-green-rgb), ${alpha})`
                    : c.netR < 0
                    ? `rgba(var(--color-red-rgb), ${alpha})`
                    : `rgba(var(--mono-rgb-100), 0.05)`;
                return (
                  <div
                    key={`cal-${c.dateIso}`}
                    title={`${c.dateIso} • ${c.count} 笔 • ${
                      c.netR >= 0 ? "+" : ""
                    }${c.netR.toFixed(1)}R`}
                    style={{
                      border: "1px solid var(--background-modifier-border)",
                      borderRadius: "6px",
                      padding: "6px",
                      background: bg,
                      minHeight: "40px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{ fontSize: "0.85em", color: "var(--text-muted)" }}
                    >
                      {getDayOfMonth(c.dateIso)}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85em",
                        fontWeight: 600,
                        color:
                          c.netR > 0
                            ? "var(--text-success)"
                            : c.netR < 0
                            ? "var(--text-error)"
                            : "var(--text-faint)",
                        textAlign: "right",
                      }}
                    >
                      {c.count > 0
                        ? `${c.netR >= 0 ? "+" : ""}${c.netR.toFixed(1)}R`
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ flex: "1 1 360px", minWidth: "360px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "10px",
                marginBottom: "8px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 600 }}>权益曲线</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                {analyticsDateRange.min && analyticsDateRange.max
                  ? `范围：${analyticsDateRange.min} → ${analyticsDateRange.max}`
                  : "范围：—"}
              </div>
            </div>
            {equitySeries.length > 1 ? (
              (() => {
                const w = 520;
                const h = 160;
                const pad = 14;
                const ys = equitySeries.map((p) => p.equityR);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                const span = Math.max(1e-6, maxY - minY);
                const xStep =
                  (w - pad * 2) / Math.max(1, equitySeries.length - 1);
                const points = equitySeries
                  .map((p, i) => {
                    const x = pad + i * xStep;
                    const y =
                      pad + (1 - (p.equityR - minY) / span) * (h - pad * 2);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(" ");

                const last = equitySeries[equitySeries.length - 1];
                return (
                  <div>
                    <svg
                      viewBox={`0 0 ${w} ${h}`}
                      width="100%"
                      height="160"
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        background: `rgba(var(--mono-rgb-100), 0.03)`,
                      }}
                    >
                      <polyline
                        points={points}
                        fill="none"
                        stroke="var(--text-accent)"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div
                      style={{
                        marginTop: "6px",
                        color: "var(--text-muted)",
                        fontSize: "0.9em",
                      }}
                    >
                      最新：{" "}
                      <span
                        style={{
                          color:
                            last.equityR >= 0
                              ? "var(--text-success)"
                              : "var(--text-error)",
                          fontWeight: 600,
                        }}
                      >
                        {last.equityR >= 0 ? "+" : ""}
                        {last.equityR.toFixed(1)}R
                      </span>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                数据不足。
              </div>
            )}

            <div style={{ fontWeight: 600, margin: "14px 0 8px" }}>
              策略归因（Top）
            </div>
            {strategyAttribution.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "18px" }}>
                {strategyAttribution.map((r) => (
                  <li
                    key={`attr-${r.strategyName}`}
                    style={{ marginBottom: "6px" }}
                  >
                    {r.strategyPath ? (
                      <button
                        type="button"
                        onClick={() => openFile(r.strategyPath!)}
                        style={textButtonStyle}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                      >
                        {r.strategyName}
                      </button>
                    ) : (
                      <span>{r.strategyName}</span>
                    )}
                    <span
                      style={{
                        color: "var(--text-muted)",
                        marginLeft: "8px",
                        fontSize: "0.9em",
                      }}
                    >
                      {r.count} 笔 •{" "}
                      <span
                        style={{
                          color:
                            r.netR >= 0
                              ? "var(--text-success)"
                              : "var(--text-error)",
                          fontWeight: 600,
                        }}
                      >
                        {r.netR >= 0 ? "+" : ""}
                        {r.netR.toFixed(1)}R
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                未找到策略归因数据。
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: "12px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ flex: "1 1 360px", minWidth: "320px" }}>
            <ContextWidget data={contextAnalysis} />
          </div>
          <div style={{ flex: "1 1 360px", minWidth: "320px" }}>
            <ErrorWidget data={errorAnalysis} />
          </div>
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "12px",
            marginBottom: "10px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 700, opacity: 0.85 }}>
            📈 综合趋势 (R-Multiples)
            <span
              style={{
                fontWeight: 600,
                opacity: 0.6,
                fontSize: "0.85em",
                marginLeft: "6px",
              }}
            >
              仅实盘 · 最近 {analyticsRecentLiveTradesAsc.length} 笔
            </span>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
            Avg R: {analyticsRMultiples.avg.toFixed(2)}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
          <div style={{ flex: "2 1 420px", minWidth: "360px" }}>
            {(() => {
              const rHeight = 90;
              const rZeroY = rHeight / 2;
              const barWidth = 8;
              const barGap = 4;
              const step = barWidth + barGap;
              const maxAbs = analyticsRMultiples.maxAbs;
              const rScale = (rHeight / 2 - 6) / Math.max(1e-6, maxAbs);
              const innerWidth = Math.max(
                analyticsRecentLiveTradesAsc.length * step,
                200
              );

              return (
                <div
                  style={{
                    position: "relative",
                    height: `${rHeight}px`,
                    width: "100%",
                    overflowX: "auto",
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "8px",
                    background: "rgba(var(--mono-rgb-100), 0.03)",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      height: `${rHeight}px`,
                      width: `${innerWidth}px`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: `${rZeroY}px`,
                        height: "1px",
                        background: "rgba(var(--mono-rgb-100), 0.18)",
                        borderTop: "1px dashed rgba(var(--mono-rgb-100), 0.25)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: 6,
                        top: rZeroY - 10,
                        fontSize: "0.75em",
                        color: "var(--text-faint)",
                      }}
                    >
                      0R
                    </div>
                    {analyticsRecentLiveTradesAsc.length === 0 ? (
                      <div
                        style={{
                          padding: "18px",
                          color: "var(--text-faint)",
                          fontSize: "0.9em",
                        }}
                      >
                        暂无数据
                      </div>
                    ) : (
                      analyticsRecentLiveTradesAsc.map((t, i) => {
                        const r =
                          typeof t.pnl === "number" && Number.isFinite(t.pnl)
                            ? t.pnl
                            : 0;
                        let h = Math.abs(r) * rScale;
                        if (h < 3) h = 3;
                        const color =
                          r > 0
                            ? "var(--text-success)"
                            : r < 0
                            ? "var(--text-error)"
                            : "var(--text-muted)";
                        const top = r >= 0 ? rZeroY - h : rZeroY;
                        return (
                          <div
                            key={`rbar-${t.path}-${t.dateIso}-${i}`}
                            title={`${t.dateIso} | ${t.name} | R: ${r.toFixed(
                              2
                            )}`}
                            style={{
                              position: "absolute",
                              left: `${i * step}px`,
                              top: `${top}px`,
                              width: `${barWidth}px`,
                              height: `${h}px`,
                              background: color,
                              borderRadius: "2px",
                              opacity: 0.9,
                            }}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          <div
            style={{
              flex: "1 1 260px",
              minWidth: "260px",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "8px",
              padding: "12px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
              🧠 实盘心态
            </div>
            <div
              style={{
                fontSize: "1.15em",
                fontWeight: 900,
                color: analyticsMind.color,
              }}
            >
              {analyticsMind.status}
            </div>
            <div style={{ color: "var(--text-faint)", fontSize: "0.85em" }}>
              FOMO: {analyticsMind.fomo} | Tilt: {analyticsMind.tilt} | 犹豫:{" "}
              {analyticsMind.hesitation}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "12px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>
            📊 热门策略
          </div>
          {analyticsTopStrats.length === 0 ? (
            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
              暂无数据
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {analyticsTopStrats.map((s) => {
                const color =
                  s.wr >= 50
                    ? "var(--text-success)"
                    : s.wr >= 40
                    ? "var(--text-warning)"
                    : "var(--text-error)";
                let displayName = s.name;
                if (displayName.length > 12 && displayName.includes("(")) {
                  displayName = displayName.split("(")[0].trim();
                }
                return (
                  <div
                    key={`topstrat-${s.name}`}
                    style={{
                      background: "rgba(var(--mono-rgb-100), 0.03)",
                      border: "1px solid var(--background-modifier-border)",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <div
                        title={s.name}
                        style={{
                          fontSize: "0.9em",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginBottom: "6px",
                        }}
                      >
                        {displayName}
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "6px",
                          borderRadius: "999px",
                          background: "rgba(var(--mono-rgb-100), 0.05)",
                          border: "1px solid var(--background-modifier-border)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${s.wr}%`,
                            height: "100%",
                            background: color,
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ flex: "0 0 auto", textAlign: "right" }}>
                      <div
                        style={{
                          fontWeight: 900,
                          color,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {s.wr}%
                      </div>
                      <div
                        style={{
                          fontSize: "0.8em",
                          color: "var(--text-faint)",
                        }}
                      >
                        {s.total} 笔
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "12px",
            marginBottom: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "1.05em" }}>
            🧬 资金增长曲线{" "}
            <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>
              (Capital Growth)
            </span>
          </div>

          <div
            style={{
              fontSize: "0.85em",
              color: "var(--text-muted)",
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: getRColorByAccountType("Live") }}>
              ● 实盘 {strategyLab.cum.Live >= 0 ? "+" : ""}
              {strategyLab.cum.Live.toFixed(1)}R
            </span>
            <span style={{ color: getRColorByAccountType("Demo") }}>
              ● 模拟 {strategyLab.cum.Demo >= 0 ? "+" : ""}
              {strategyLab.cum.Demo.toFixed(1)}R
            </span>
            <span style={{ color: getRColorByAccountType("Backtest") }}>
              ● 回测 {strategyLab.cum.Backtest >= 0 ? "+" : ""}
              {strategyLab.cum.Backtest.toFixed(1)}R
            </span>
            <span style={{ color: "var(--text-faint)" }}>
              {allTradesDateRange.min && allTradesDateRange.max
                ? `范围：${allTradesDateRange.min} → ${allTradesDateRange.max}`
                : "范围：—"}
            </span>
          </div>
        </div>

        {(() => {
          const w = 520;
          const h = 150;
          const pad = 14;
          const allValues = [
            ...strategyLab.curves.Live,
            ...strategyLab.curves.Demo,
            ...strategyLab.curves.Backtest,
          ];
          const maxVal = Math.max(...allValues, 5);
          const minVal = Math.min(...allValues, -5);
          const range = Math.max(1e-6, maxVal - minVal);
          const zeroY = pad + (1 - (0 - minVal) / range) * (h - pad * 2);

          const getPoints = (data: number[]) => {
            if (data.length < 2) return "";
            const xStep = (w - pad * 2) / Math.max(1, data.length - 1);
            return data
              .map((val, i) => {
                const x = pad + i * xStep;
                const y = pad + (1 - (val - minVal) / range) * (h - pad * 2);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ");
          };

          const ptsLive = getPoints(strategyLab.curves.Live);
          const ptsDemo = getPoints(strategyLab.curves.Demo);
          const ptsBack = getPoints(strategyLab.curves.Backtest);

          return (
            <svg
              viewBox={`0 0 ${w} ${h}`}
              width="100%"
              height="150"
              style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                background: `rgba(var(--mono-rgb-100), 0.03)`,
              }}
            >
              <line
                x1={0}
                y1={zeroY}
                x2={w}
                y2={zeroY}
                stroke="rgba(var(--mono-rgb-100), 0.18)"
                strokeDasharray="4"
              />

              {ptsBack && (
                <polyline
                  points={ptsBack}
                  fill="none"
                  stroke={getRColorByAccountType("Backtest")}
                  strokeWidth="1.6"
                  opacity={0.65}
                  strokeDasharray="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {ptsDemo && (
                <polyline
                  points={ptsDemo}
                  fill="none"
                  stroke={getRColorByAccountType("Demo")}
                  strokeWidth="1.8"
                  opacity={0.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {ptsLive && (
                <polyline
                  points={ptsLive}
                  fill="none"
                  stroke={getRColorByAccountType("Live")}
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
            </svg>
          );
        })()}

        <div
          style={{
            marginTop: "14px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ flex: "1 1 360px", minWidth: "320px" }}>
            <div
              style={{ fontSize: "0.85em", opacity: 0.7, marginBottom: "8px" }}
            >
              📊 热门策略表现{" "}
              <span
                style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.9em" }}
              >
                (Top Setups)
              </span>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              {strategyLab.topSetups.length > 0 ? (
                strategyLab.topSetups.map((s) => (
                  <div
                    key={`topsetup-${s.name}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      fontSize: "0.9em",
                      background: "rgba(var(--mono-rgb-100), 0.03)",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--background-modifier-border)",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.name}
                    </span>
                    <span
                      style={{ color: "var(--text-muted)", flex: "0 0 auto" }}
                    >
                      <span
                        style={{
                          color:
                            s.wr > 50
                              ? "var(--text-success)"
                              : "var(--text-warning)",
                          fontWeight: 800,
                        }}
                      >
                        {s.wr}%
                      </span>{" "}
                      <span style={{ opacity: 0.6 }}>({s.total})</span>
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                  数据不足。
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: "1 1 360px", minWidth: "320px" }}>
            <div
              style={{ fontSize: "0.85em", opacity: 0.7, marginBottom: "8px" }}
            >
              💡 系统建议
            </div>
            <div style={{ fontSize: "0.9em", opacity: 0.85, lineHeight: 1.6 }}>
              {strategyLab.suggestion}
            </div>
          </div>
        </div>
      </div>

        </>
      ) : null}

      {activePage === "learn" ? (
        <>
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
            <div style={{ fontWeight: 700 }}>📚 学习模块</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
              Learning
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>记忆 / SRS</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              disabled={!can("srs:review-flashcards")}
              onClick={() => action("srs:review-flashcards")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("srs:review-flashcards") ? buttonStyle : disabledButtonStyle
              }
            >
              复习
            </button>
            <button
              type="button"
              onClick={reloadMemory}
              disabled={!loadMemory || memoryBusy}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                !loadMemory || memoryBusy
                  ? { ...disabledButtonStyle, padding: "6px 10px" }
                  : { ...buttonStyle, padding: "6px 10px" }
              }
            >
              刷新
            </button>
            <button
              type="button"
              onClick={hardRefreshMemory}
              disabled={!loadMemory || memoryBusy}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                !loadMemory || memoryBusy
                  ? { ...disabledButtonStyle, padding: "6px 10px" }
                  : { ...buttonStyle, padding: "6px 10px" }
              }
            >
              强制刷新
            </button>
          </div>
        </div>

        {!can("srs:review-flashcards") && (
          <div
            style={{
              color: "var(--text-faint)",
              fontSize: "0.9em",
              marginBottom: "8px",
            }}
          >
            SRS 插件不可用（适配器已降级）。统计仍会从 #flashcards 笔记计算。
          </div>
        )}

        {memoryError ? (
          <div style={{ color: "var(--text-error)", fontSize: "0.9em" }}>
            {memoryError}
          </div>
        ) : memoryBusy ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
            加载中…
          </div>
        ) : memory ? (
          <div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                color: "var(--text-muted)",
                fontSize: "0.9em",
                marginBottom: "10px",
              }}
            >
              <div>
                总计：<strong>{memory.total}</strong>
              </div>
              <div>
                到期（≤{settings.srsDueThresholdDays}天）：{" "}
                <strong>{memory.due}</strong>
              </div>
              <div>
                掌握度：<strong>{memory.masteryPct}%</strong>
              </div>
              <div>
                负载（7天）：<strong>{memory.load7d}</strong>
              </div>
              <div>
                状态：<strong>{memory.status}</strong>
              </div>
            </div>

            {(() => {
              const pTotal = Math.max(1, memory.total);
              const sBase =
                (memory.cnt?.sNorm ?? 0) + (memory.cnt?.sRev ?? 0) * 2;
              const mMulti =
                (memory.cnt?.mNorm ?? 0) + (memory.cnt?.mRev ?? 0) * 2;
              const cloze = memory.cnt?.cloze ?? 0;

              const seg = (n: number) => `${Math.max(0, (n / pTotal) * 100)}%`;

              return (
                <>
                  <div
                    style={{
                      height: "8px",
                      width: "100%",
                      borderRadius: "4px",
                      overflow: "hidden",
                      background: "var(--background-modifier-border)",
                      display: "flex",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: seg(memory.cnt?.sNorm ?? 0),
                        background: "var(--text-muted)",
                        opacity: 0.5,
                      }}
                    />
                    <div
                      style={{
                        width: seg((memory.cnt?.sRev ?? 0) * 2),
                        background: "var(--text-muted)",
                        opacity: 0.35,
                      }}
                    />
                    <div
                      style={{
                        width: seg(memory.cnt?.mNorm ?? 0),
                        background: "var(--text-accent)",
                        opacity: 0.55,
                      }}
                    />
                    <div
                      style={{
                        width: seg((memory.cnt?.mRev ?? 0) * 2),
                        background: "var(--text-accent)",
                        opacity: 0.35,
                      }}
                    />
                    <div
                      style={{
                        width: seg(memory.cnt?.cloze ?? 0),
                        background: "var(--text-accent)",
                        opacity: 0.85,
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "10px",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        padding: "10px",
                        textAlign: "center",
                        background: "rgba(var(--mono-rgb-100), 0.02)",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75em",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        基础
                      </div>
                      <div style={{ fontWeight: 800 }}>{sBase}</div>
                    </div>

                    <div
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        padding: "10px",
                        textAlign: "center",
                        background: "rgba(var(--mono-rgb-100), 0.02)",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75em",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        多选
                      </div>
                      <div style={{ fontWeight: 800 }}>{mMulti}</div>
                    </div>

                    <div
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        padding: "10px",
                        textAlign: "center",
                        background: "rgba(var(--mono-rgb-100), 0.02)",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75em",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        填空
                      </div>
                      <div style={{ fontWeight: 800 }}>{cloze}</div>
                    </div>
                  </div>
                </>
              );
            })()}

            {(() => {
              const series = memory.loadNext7;
              const max = Math.max(3, ...series.map((x) => x.count || 0));
              return (
                <div
                  style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "10px",
                    background: "rgba(var(--mono-rgb-100), 0.02)",
                    marginBottom: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "10px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.9em" }}>
                      未来 7 天负载
                    </div>
                    <div
                      style={{ color: "var(--text-faint)", fontSize: "0.85em" }}
                    >
                      +1…+7
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: "10px",
                      height: "120px",
                    }}
                  >
                    {series.map((x, idx) => {
                      const h = Math.max(
                        4,
                        Math.round((Math.max(0, x.count || 0) / max) * 100)
                      );
                      const has = (x.count || 0) > 0;
                      return (
                        <div
                          key={`mem-load-${x.dateIso}-${idx}`}
                          style={{
                            flex: "1 1 0",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <div
                            style={{
                              width: "8px",
                              height: `${h}%`,
                              minHeight: "4px",
                              borderRadius: "4px",
                              background: has
                                ? "var(--text-accent)"
                                : "var(--background-modifier-border)",
                              opacity: has ? 0.85 : 0.6,
                            }}
                          />
                          <div
                            style={{
                              fontSize: "0.75em",
                              color: "var(--text-faint)",
                              lineHeight: 1,
                            }}
                          >
                            +{idx + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const canRecommendFocus =
                !memoryIgnoreFocus &&
                memory.due > 0 &&
                Boolean(memory.focusFile);

              const focusRec =
                canRecommendFocus && memory.focusFile
                  ? {
                      type: "Focus" as const,
                      title: memory.focusFile.name.replace(/\.md$/i, ""),
                      path: memory.focusFile.path,
                      desc: `到期: ${memory.focusFile.due} | 易度: ${memory.focusFile.avgEase}`,
                    }
                  : null;

              const courseRec = course?.hybridRec
                ? (() => {
                    const rec = course.hybridRec;
                    const title = String(rec.data.t || rec.data.q || "推荐");
                    const path = String((rec.data as any).path || "");
                    const desc = rec.type === "New" ? "新主题" : "闪卡测验";
                    return { type: rec.type, title, path, desc } as const;
                  })()
                : null;

              const quiz =
                memory.quizPool.length > 0
                  ? memory.quizPool[
                      Math.max(0, memoryShakeIndex) % memory.quizPool.length
                    ]
                  : null;
              const randomRec = quiz
                ? {
                    type: "Shake" as const,
                    title: String(quiz.q || quiz.file),
                    path: String(quiz.path),
                    desc: "🎲 随机抽取",
                  }
                : null;

              const rec = focusRec ?? courseRec ?? randomRec;
              if (!rec) return null;

              const label =
                rec.type === "Focus"
                  ? "🔥 优先复习"
                  : rec.type === "New"
                  ? "🚀 推荐"
                  : rec.type === "Review"
                  ? "🔄 推荐"
                  : "🎲 随机抽取";

              const onShake = () => {
                setMemoryIgnoreFocus(true);
                if (memory.quizPool.length > 0) {
                  const next = Math.floor(
                    Math.random() * memory.quizPool.length
                  );
                  setMemoryShakeIndex(next);
                } else {
                  setMemoryShakeIndex((x) => x + 1);
                }
              };

              return (
                <div
                  style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "10px",
                    background: "rgba(var(--mono-rgb-100), 0.03)",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div style={{ flex: "1 1 auto" }}>
                    <div
                      style={{
                        fontSize: "0.85em",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "6px",
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ marginBottom: "6px" }}>
                      <button
                        type="button"
                        onClick={() => openFile(String(rec.path))}
                        style={{ ...textButtonStyle, fontWeight: 700 }}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                      >
                        {String(rec.title)}
                      </button>
                    </div>
                    <div
                      style={{ color: "var(--text-faint)", fontSize: "0.85em" }}
                    >
                      {rec.desc}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onShake}
                    onMouseEnter={onBtnMouseEnter}
                    onMouseLeave={onBtnMouseLeave}
                    onFocus={onBtnFocus}
                    onBlur={onBtnBlur}
                    style={{ ...buttonStyle, padding: "6px 10px" }}
                    title="摇一摇换题（跳过优先）"
                  >
                    🎲
                  </button>
                </div>
              );
            })()}

            {memory.focusFile ? (
              <div
                style={{
                  marginBottom: "10px",
                  color: "var(--text-muted)",
                  fontSize: "0.9em",
                }}
              >
                焦点：{" "}
                <button
                  type="button"
                  onClick={() => openFile(memory.focusFile!.path)}
                  style={{ ...textButtonStyle, fontWeight: 600 }}
                  onMouseEnter={onTextBtnMouseEnter}
                  onMouseLeave={onTextBtnMouseLeave}
                  onFocus={onTextBtnFocus}
                  onBlur={onTextBtnBlur}
                >
                  {memory.focusFile.name.replace(/\.md$/i, "")}
                </button>
                <span style={{ marginLeft: "8px", color: "var(--text-faint)" }}>
                  到期: {memory.focusFile.due} | 易度:{" "}
                  {memory.focusFile.avgEase}
                </span>
              </div>
            ) : (
              <div
                style={{
                  marginBottom: "10px",
                  color: "var(--text-faint)",
                  fontSize: "0.9em",
                }}
              >
                暂无焦点卡片。
              </div>
            )}

            {memory.quizPool.length > 0 ? (
              <div>
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  随机抽题（{settings.srsRandomQuizCount}）
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                  {memory.quizPool.map((q, idx) => (
                    <li key={`q-${idx}`} style={{ marginBottom: "6px" }}>
                      <button
                        type="button"
                        onClick={() => openFile(q.path)}
                        style={textButtonStyle}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                      >
                        {q.q || q.file}
                      </button>
                      <span
                        style={{
                          marginLeft: "8px",
                          color: "var(--text-faint)",
                          fontSize: "0.85em",
                        }}
                      >
                        {q.file}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                在 #flashcards 笔记中未找到可抽取题库。
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            记忆数据不可用。
          </div>
        )}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>
            课程{" "}
            <span
              style={{
                fontWeight: 500,
                color: "var(--text-muted)",
                fontSize: "0.85em",
              }}
            >
              (Course)
            </span>
          </div>
          <button
            type="button"
            onClick={reloadCourse}
            disabled={!loadCourse || courseBusy}
            onMouseEnter={onBtnMouseEnter}
            onMouseLeave={onBtnMouseLeave}
            onFocus={onBtnFocus}
            onBlur={onBtnBlur}
            style={
              !loadCourse || courseBusy
                ? { ...disabledButtonStyle, padding: "6px 10px" }
                : { ...buttonStyle, padding: "6px 10px" }
            }
          >
            刷新
          </button>
        </div>

        {courseError ? (
          <div style={{ color: "var(--text-error)", fontSize: "0.9em" }}>
            {courseError}
          </div>
        ) : courseBusy ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
            加载中…
          </div>
        ) : course && course.syllabus.length > 0 ? (
          <div>
            {course.hybridRec
              ? (() => {
                  const rec = course.hybridRec;
                  const sid = simpleCourseId(rec.data.id);
                  const link =
                    course.linksById[rec.data.id] || course.linksById[sid];
                  const prefix =
                    rec.type === "New" ? "🚀 继续学习" : "🔄 建议复习";
                  return (
                    <div
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        padding: "10px",
                        background: "rgba(var(--mono-rgb-100), 0.03)",
                        marginBottom: "10px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                        }}
                      >
                        <div>
                          {link ? (
                            <button
                              type="button"
                              onClick={() => openFile(link.path)}
                              style={{ ...textButtonStyle, fontWeight: 600 }}
                              onMouseEnter={onTextBtnMouseEnter}
                              onMouseLeave={onTextBtnMouseLeave}
                              onFocus={onTextBtnFocus}
                              onBlur={onTextBtnBlur}
                            >
                              {prefix}: {String(rec.data.t ?? rec.data.id)}
                            </button>
                          ) : (
                            <span style={{ color: "var(--text-faint)" }}>
                              {prefix}: {String(rec.data.t ?? rec.data.id)}
                              （笔记未创建）
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-monospace)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {rec.data.id}
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: "6px",
                          color: "var(--text-muted)",
                          fontSize: "0.85em",
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          章节: <strong>{String(rec.data.p ?? "—")}</strong>
                        </span>
                        <span>
                          进度:{" "}
                          <strong>
                            {course.progress.doneCount}/
                            {course.progress.totalCount}
                          </strong>
                        </span>
                        <span>
                          笔记: <strong>{link ? "已创建" : "未创建"}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })()
              : null}

            {course.upNext.length > 0 && (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.9em",
                  marginBottom: "8px",
                }}
              >
                接下来（窗口={settings.courseRecommendationWindow}）：{" "}
                {course.upNext.map((x, idx) => {
                  const label = String(x.item.id);
                  if (x.link) {
                    return (
                      <React.Fragment key={`up-${x.item.id}`}>
                        {idx > 0 ? ", " : ""}
                        <button
                          type="button"
                          onClick={() => openFile(x.link!.path)}
                          style={textButtonStyle}
                          onMouseEnter={onTextBtnMouseEnter}
                          onMouseLeave={onTextBtnMouseLeave}
                          onFocus={onTextBtnFocus}
                          onBlur={onTextBtnBlur}
                        >
                          {label}
                        </button>
                      </React.Fragment>
                    );
                  }
                  return (
                    <React.Fragment key={`up-${x.item.id}`}>
                      {idx > 0 ? ", " : ""}
                      <span style={{ color: "var(--text-faint)" }}>
                        {label}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            <details>
              <summary
                style={{
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: "0.9em",
                  userSelect: "none",
                }}
              >
                展开课程矩阵
              </summary>
              <div
                style={{
                  marginTop: "12px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "20px",
                }}
              >
                {course.phases.map((ph) => (
                  <div key={`ph-${ph.phase}`} style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        fontSize: "0.85em",
                        color: "var(--text-muted)",
                        marginBottom: "6px",
                        borderBottom:
                          "1px solid var(--background-modifier-border)",
                        paddingBottom: "4px",
                      }}
                    >
                      {ph.phase}
                    </div>
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                    >
                      {ph.items.map((c) => {
                        const bg = c.isDone
                          ? "var(--text-success)"
                          : c.hasNote
                          ? "var(--text-accent)"
                          : "rgba(var(--mono-rgb-100), 0.06)";
                        const fg = c.isDone
                          ? "var(--background-primary)"
                          : c.hasNote
                          ? "var(--background-primary)"
                          : "var(--text-faint)";
                        const title = `${c.item.id}: ${String(c.item.t ?? "")}`;
                        return (
                          <button
                            key={`c-${ph.phase}-${c.item.id}`}
                            type="button"
                            disabled={!c.link}
                            onClick={() => c.link && openFile(c.link.path)}
                            title={title}
                            onMouseEnter={onMiniCellMouseEnter}
                            onMouseLeave={onMiniCellMouseLeave}
                            onFocus={onMiniCellFocus}
                            onBlur={onMiniCellBlur}
                            style={{
                              width: "26px",
                              height: "26px",
                              borderRadius: "6px",
                              flexShrink: 0,
                              padding: 0,
                              border:
                                "1px solid var(--background-modifier-border)",
                              background: bg,
                              cursor: c.link ? "pointer" : "default",
                              opacity: c.link ? 1 : 0.75,
                              outline: "none",
                              transition:
                                "border-color 180ms ease, box-shadow 180ms ease",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "100%",
                                height: "100%",
                                color: fg,
                                fontSize: "0.65em",
                                fontWeight: 700,
                                letterSpacing: "-0.3px",
                              }}
                            >
                              {c.shortId}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            课程数据不可用。请检查 PA_Syllabus_Data.md 与 #PA/Course 相关笔记。
          </div>
        )}
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
        <div style={{ fontWeight: 600, marginBottom: "10px" }}>
          策略仓库
          <span style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
            {" "}
            （作战手册/Playbook）
          </span>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <StrategyStats
            total={strategyStats.total}
            activeCount={strategyStats.activeCount}
            learningCount={strategyStats.learningCount}
            totalUses={strategyStats.totalUses}
            onFilter={(f: string) => {
              // TODO: wire filtering state to StrategyList (future task)
              console.log("策略过滤：", f);
            }}
          />
        </div>

        {(() => {
          const cycle = (todayMarketCycle ?? "").trim();
          if (!cycle) {
            return (
              <div
                style={{
                  margin: "-6px 0 10px 0",
                  padding: "10px 12px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  color: "var(--text-faint)",
                  fontSize: "0.9em",
                }}
              >
                今日市场周期未设置（可在 今日/Today 里补充）。
              </div>
            );
          }

          const isActive = (statusRaw: unknown) => {
            const s = typeof statusRaw === "string" ? statusRaw.trim() : "";
            if (!s) return false;
            return s.includes("实战") || s.toLowerCase().includes("active");
          };

          const picks = matchStrategies(strategyIndex, {
            marketCycle: cycle,
            limit: 6,
          }).filter((s) => isActive((s as any).statusRaw));

          return (
            <div
              style={{
                margin: "-6px 0 10px 0",
                padding: "10px 12px",
                background: "rgba(var(--mono-rgb-100), 0.03)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
              }}
            >
              <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: 6 }}>
                🌊 今日市场周期：{" "}
                <span style={{ color: "var(--text-accent)", fontWeight: 800 }}>
                  {cycle}
                </span>
              </div>
              <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
                {picks.length > 0 ? (
                  <>
                    推荐优先关注：{" "}
                    {picks.map((s, idx) => (
                      <React.Fragment key={`pb-pick-${s.path}`}>
                        {idx > 0 ? " · " : ""}
                        <button
                          type="button"
                          onClick={() => openFile(s.path)}
                          style={{ ...textButtonStyle, whiteSpace: "nowrap" }}
                          onMouseEnter={onTextBtnMouseEnter}
                          onMouseLeave={onTextBtnMouseLeave}
                          onFocus={onTextBtnFocus}
                          onBlur={onTextBtnBlur}
                        >
                          {String(s.canonicalName || s.name)}
                        </button>
                      </React.Fragment>
                    ))}
                  </>
                ) : (
                  "暂无匹配的实战策略（可在策略卡片里补充状态/周期）。"
                )}
              </div>
            </div>
          );
        })()}

        <div style={{ marginTop: "10px" }}>
          <StrategyList
            strategies={strategies}
            onOpenFile={openFile}
            perf={strategyPerf}
            showTitle={false}
            showControls={false}
          />
        </div>

        <div
          style={{
            marginTop: "16px",
            paddingTop: "12px",
            borderTop: "1px solid var(--background-modifier-border)",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {(() => {
              const quickPath =
                "策略仓库 (Strategy Repository)/太妃方案/太妃方案.md";
              return (
                <button
                  type="button"
                  onClick={() => openFile(quickPath)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--background-modifier-border)",
                    background: "rgba(var(--mono-rgb-100), 0.03)",
                    color: "var(--text-accent)",
                    cursor: "pointer",
                    fontSize: "0.85em",
                    fontWeight: 700,
                  }}
                >
                  📚 作战手册（Brooks Playbook）
                </button>
              );
            })()}

            <span
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid var(--background-modifier-border)",
                background: "rgba(var(--mono-rgb-100), 0.03)",
                color: "var(--text-muted)",
                fontSize: "0.85em",
                fontWeight: 700,
              }}
            >
              📖 Al Brooks经典（即将推出）
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: "20px",
            paddingTop: "15px",
            borderTop: "1px solid var(--background-modifier-border)",
          }}
        >
          <div style={{ fontWeight: 700, opacity: 0.7, marginBottom: "10px" }}>
            🏆 实战表现 (Performance)
          </div>

          {playbookPerfRows.length === 0 ? (
            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
              暂无可用的策略表现统计（需要交易记录与策略归因）。
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 72px 88px 60px",
                  gap: "0px",
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--background-modifier-border)",
                  color: "var(--text-muted)",
                  fontSize: "0.85em",
                  fontWeight: 700,
                }}
              >
                <div>策略</div>
                <div>胜率</div>
                <div>盈亏</div>
                <div>次数</div>
              </div>

              {playbookPerfRows.map((r) => {
                const pnlColor =
                  r.pnl > 0
                    ? "var(--text-success)"
                    : r.pnl < 0
                    ? "var(--text-error)"
                    : "var(--text-muted)";

                return (
                  <div
                    key={`pb-perf-${r.canonical}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 72px 88px 60px",
                      padding: "8px 10px",
                      borderBottom:
                        "1px solid var(--background-modifier-border)",
                      fontSize: "0.9em",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {r.path ? (
                        <button
                          type="button"
                          onClick={() => openFile(r.path!)}
                          style={textButtonStyle}
                          onMouseEnter={onTextBtnMouseEnter}
                          onMouseLeave={onTextBtnMouseLeave}
                          onFocus={onTextBtnFocus}
                          onBlur={onTextBtnBlur}
                        >
                          {r.canonical}
                        </button>
                      ) : (
                        <span>{r.canonical}</span>
                      )}
                    </div>
                    <div style={{ fontVariantNumeric: "tabular-nums" }}>
                      {r.winRate}%
                    </div>
                    <div
                      style={{
                        color: pnlColor,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.pnl > 0 ? "+" : ""}
                      {Math.round(r.pnl)}
                    </div>
                    <div style={{ fontVariantNumeric: "tabular-nums" }}>
                      {r.total}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
        <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "10px" }}>
          🖼️ 最新复盘{" "}
          <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>
            （图表/Charts）
          </span>
        </div>
        {!getResourceUrl ? (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            画廊不可用。
          </div>
        ) : galleryItems.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
            }}
          >
            {galleryItems.map((it) => (
              <button
                key={`gal-${it.coverPath}`}
                type="button"
                onClick={() => openFile(it.tradePath)}
                title={`${it.tradeName} • ${it.coverPath}`}
                onMouseEnter={onCoverMouseEnter}
                onMouseLeave={onCoverMouseLeave}
                onFocus={onCoverFocus}
                onBlur={onCoverBlur}
                style={{
                  padding: 0,
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  overflow: "hidden",
                  background: `rgba(var(--mono-rgb-100), 0.03)`,
                  cursor: "pointer",
                  outline: "none",
                  transition:
                    "background-color 180ms ease, border-color 180ms ease",
                  position: "relative",
                  aspectRatio: "16 / 9",
                }}
              >
                {it.url ? (
                  <>
                    <img
                      src={it.url}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />

                    <div
                      style={{
                        position: "absolute",
                        top: "6px",
                        right: "6px",
                        background: "rgba(var(--mono-rgb-100), 0.12)",
                        border: "1px solid var(--background-modifier-border)",
                        color:
                          it.accountType === "Live"
                            ? "var(--text-success)"
                            : it.accountType === "Backtest"
                            ? "var(--text-warning)"
                            : "var(--text-accent)",
                        fontSize: "0.72em",
                        fontWeight: 900,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        backdropFilter: "blur(6px)",
                      }}
                    >
                      {it.accountType === "Live"
                        ? "实盘"
                        : it.accountType === "Backtest"
                        ? "回测"
                        : "模拟"}
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        padding: "16px 10px 8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        gap: "10px",
                        background:
                          "linear-gradient(rgba(var(--mono-rgb-0), 0), rgba(var(--mono-rgb-0), 0.9))",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-on-accent)",
                          fontSize: "0.85em",
                          fontWeight: 800,
                          textAlign: "left",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: "1 1 auto",
                        }}
                      >
                        {it.tradeName}
                      </div>
                      <div
                        style={{
                          color:
                            it.pnl >= 0
                              ? "var(--text-success)"
                              : "var(--text-error)",
                          fontWeight: 900,
                          fontSize: "0.95em",
                          flex: "0 0 auto",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {it.pnl > 0 ? "+" : ""}
                        {it.pnl.toFixed(1)}
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-faint)",
                      fontSize: "0.85em",
                    }}
                  >
                    —
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            暂无封面图片。请在 Frontmatter 添加 cover: [[图片]] 或 图片路径。
          </div>
        )}

        <div
          style={{
            textAlign: "center",
            marginTop: "12px",
            paddingTop: "8px",
            borderTop: "1px solid var(--background-modifier-border)",
          }}
        >
          <a
            href={gallerySearchHref}
            style={{
              color: "var(--text-accent)",
              textDecoration: "none",
              fontSize: "0.85em",
              fontWeight: 700,
            }}
          >
            📂 查看所有图表
          </a>
        </div>
      </div>

        </>
      ) : null}

      {activePage === "manage" ? (
        <>
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
            <div style={{ fontWeight: 700 }}>📉 管理模块</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
              管理（Management）
            </div>
          </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "12px",
          marginBottom: "16px",
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
            🔎 检查器（Inspector）
          </div>
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            数据治理与巡检（已在下方区块实现）
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            padding: "10px",
            background: "rgba(var(--mono-rgb-100), 0.03)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>🧩 字段规则（Schema）</div>
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            v5.0 的 `pa-view-schema` 已并入下方“检查器/Schema 监控”（KPIs /
            异常修复台 / 标签全景 / Top 分布）。
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            padding: "10px",
            background: "rgba(var(--mono-rgb-100), 0.03)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>🛡️ 管理器（Manager）</div>
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            属性管理（已在下方“管理器”区块实现）
          </div>
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>检查器 / 字段规则（Schema）监控</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setShowFixPlan((v) => !v)}
              disabled={!enumPresets}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                enumPresets
                  ? { ...buttonStyle, padding: "6px 10px" }
                  : { ...disabledButtonStyle, padding: "6px 10px" }
              }
              title={!enumPresets ? "枚举预设不可用" : "切换修复方案预览"}
            >
              {showFixPlan ? "隐藏修复方案" : "显示修复方案"}
            </button>
          </div>
        </div>

        <div
          style={{
            color: "var(--text-faint)",
            fontSize: "0.9em",
            marginBottom: "10px",
          }}
        >
          只读：仅报告问题；修复方案（FixPlan）仅预览（不会写入 vault）。
          <span style={{ marginLeft: "8px" }}>
            枚举预设：{enumPresets ? "已加载" : "不可用"}
          </span>
        </div>

        {(() => {
          const issueCount = schemaIssues.length;
          const healthScore = Math.max(0, 100 - issueCount * 5);
          const healthColor =
            healthScore > 90
              ? "var(--text-accent)"
              : healthScore > 60
              ? "var(--text-warning)"
              : "var(--text-error)";
          const files = paTagSnapshot?.files ?? 0;
          const tags = paTagSnapshot
            ? Object.keys(paTagSnapshot.tagMap).length
            : 0;

          const topTags = paTagSnapshot
            ? Object.entries(paTagSnapshot.tagMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 60)
            : [];

          const hasCJK = (str: string) => /[\u4e00-\u9fff]/.test(str);

          const prettySchemaVal = (val?: string) => {
            let s = (val ?? "").toString().trim();
            if (!s) return "";
            const low = s.toLowerCase();
            if (s === "Unknown" || low === "unknown") return "未知/Unknown";
            if (s === "Empty" || low === "empty") return "空/Empty";
            if (low === "null") return "空/null";

            // 中文(English) -> 中文/English
            if (s.includes("(") && s.endsWith(")")) {
              const parts = s.split("(");
              const cn = (parts[0] || "").trim();
              const en = parts
                .slice(1)
                .join("(")
                .replace(/\)\s*$/, "")
                .trim();
              if (cn && en) return `${cn}/${en}`;
              if (cn) return cn;
              if (en) return `待补充/${en}`;
            }

            // 已是 pair，尽量保证中文在左
            if (s.includes("/")) {
              const parts = s.split("/");
              const left = (parts[0] || "").trim();
              const right = parts.slice(1).join("/").trim();
              if (hasCJK(left)) return s;
              if (hasCJK(right)) return `${right}/${left}`;
              return `待补充/${s}`;
            }

            if (!hasCJK(s) && /[a-zA-Z]/.test(s)) return `待补充/${s}`;
            return s;
          };

          const prettyExecVal = (val?: string) => {
            const s0 = (val ?? "").toString().trim();
            if (!s0) return "未知/Unknown";
            const low = s0.toLowerCase();
            if (low.includes("unknown") || low === "null")
              return "未知/Unknown";
            if (low.includes("perfect") || s0.includes("完美"))
              return "🟢 完美";
            if (low.includes("fomo") || s0.includes("FOMO")) return "🔴 FOMO";
            if (low.includes("tight") || s0.includes("止损太紧"))
              return "🔴 止损太紧";
            if (low.includes("scratch") || s0.includes("主动"))
              return "🟡 主动离场";
            if (
              low.includes("normal") ||
              low.includes("none") ||
              s0.includes("正常")
            )
              return "🟢 正常";
            return prettySchemaVal(s0) || "未知/Unknown";
          };

          const topN = (
            getter: (t: TradeRecord) => string | undefined,
            pretty?: (v?: string) => string
          ) => {
            const map = new Map<string, number>();
            for (const t of trades) {
              const raw = getter(t);
              const base = (raw ?? "").toString().trim();
              const v = (pretty ? pretty(base) : base) || "Unknown";
              if (!v) continue;
              map.set(v, (map.get(v) ?? 0) + 1);
            }
            return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
          };

          const distTicker = topN((t) => t.ticker, prettySchemaVal);
          // “Setup” 分布优先看 setupKey（v5/legacy 的 setup/setupKey），并兼容 setupCategory。
          const distSetup = topN(
            (t) => t.setupKey ?? t.setupCategory,
            prettySchemaVal
          );
          const distExec = topN((t) => t.executionQuality, prettyExecVal);

          return (
            <div style={{ marginBottom: "12px" }}>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "10px",
                }}
              >
                <div style={{ color: healthColor, fontWeight: 700 }}>
                  系统健康度：{healthScore}
                </div>
                <div
                  style={{
                    color:
                      issueCount > 0
                        ? "var(--text-error)"
                        : "var(--text-muted)",
                  }}
                >
                  待修异常：{issueCount}
                </div>
                <div style={{ color: "var(--text-muted)" }}>
                  标签总数：{tags}
                </div>
                <div style={{ color: "var(--text-muted)" }}>
                  笔记档案：{files}
                </div>
              </div>

              {schemaScanNote ? (
                <div
                  style={{
                    color: "var(--text-faint)",
                    fontSize: "0.85em",
                    marginBottom: "10px",
                  }}
                >
                  {schemaScanNote}
                </div>
              ) : null}

              <div
                style={{
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  padding: "10px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                  marginBottom: "10px",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                  🚑 异常修复台（Fix Station）
                </div>

                {schemaIssues.length === 0 ? (
                  <div
                    style={{ color: "var(--text-accent)", fontSize: "0.9em" }}
                  >
                    ✅ 系统非常健康（All Clear）
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: "200px",
                      overflow: "auto",
                      border: "1px solid var(--background-modifier-border)",
                      borderRadius: "8px",
                      background: "var(--background-primary)",
                    }}
                  >
                    {schemaIssues.slice(0, 50).map((item, idx) => (
                      <button
                        key={`${item.path}:${item.key}:${idx}`}
                        type="button"
                        onClick={() => openFile(item.path)}
                        title={item.path}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          border: "none",
                          borderBottom:
                            "1px solid var(--background-modifier-border)",
                          background: "transparent",
                          cursor: "pointer",
                          outline: "none",
                          transition:
                            "background-color 180ms ease, box-shadow 180ms ease",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            alignItems: "baseline",
                          }}
                        >
                          <div
                            style={{
                              flex: "1 1 auto",
                              minWidth: 0,
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                            <div
                              style={{
                                color: "var(--text-faint)",
                                fontSize: "0.85em",
                              }}
                            >
                              {item.key}
                            </div>
                          </div>
                          <div
                            style={{
                              color: "var(--text-error)",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.type}
                          </div>
                        </div>
                      </button>
                    ))}
                    {schemaIssues.length > 50 ? (
                      <div
                        style={{
                          padding: "8px 10px",
                          color: "var(--text-faint)",
                          fontSize: "0.85em",
                        }}
                      >
                        仅显示前 50 条异常。
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div
                style={{
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  padding: "10px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                  marginBottom: "10px",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                  🏷️ 标签全景（Tag System）
                </div>
                {!paTagSnapshot ? (
                  <div
                    style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                  >
                    标签扫描不可用。
                  </div>
                ) : (
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                  >
                    {topTags.map(([tag, count]) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => openGlobalSearch(`tag:${tag}`)}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                        style={{
                          padding: "2px 8px",
                          borderRadius: "999px",
                          border: "1px solid var(--background-modifier-border)",
                          background: "var(--background-primary)",
                          fontSize: "0.85em",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        #{tag} ({count})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  padding: "10px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                  📊 Top 分布（Ticker / Setup / Exec）
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "10px",
                  }}
                >
                  {[
                    { title: "Ticker", data: distTicker },
                    { title: "Setup", data: distSetup },
                    { title: "Exec", data: distExec },
                  ].map((col) => (
                    <div
                      key={col.title}
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        padding: "8px",
                        background: "var(--background-primary)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          marginBottom: "6px",
                          color: "var(--text-muted)",
                        }}
                      >
                        {col.title}
                      </div>
                      {col.data.length === 0 ? (
                        <div
                          style={{
                            color: "var(--text-faint)",
                            fontSize: "0.85em",
                          }}
                        >
                          无数据
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          {col.data.map(([k, v]) => (
                            <div
                              key={k}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "10px",
                                fontSize: "0.9em",
                              }}
                            >
                              <div
                                style={{
                                  color: "var(--text-normal)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={k}
                              >
                                {k}
                              </div>
                              <div
                                style={{
                                  color: "var(--text-muted)",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {v}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {(() => {
          const errorCount = inspectorIssues.filter(
            (i) => i.severity === "error"
          ).length;
          const warnCount = inspectorIssues.filter(
            (i) => i.severity === "warn"
          ).length;
          return (
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "10px",
              }}
            >
              <div style={{ color: "var(--text-error)" }}>
                错误：{errorCount}
              </div>
              <div style={{ color: "var(--text-warning)" }}>
                警告：{warnCount}
              </div>
              <div style={{ color: "var(--text-muted)" }}>
                总计：{inspectorIssues.length}
              </div>
            </div>
          );
        })()}

        {inspectorIssues.length === 0 ? (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            未发现问题。
          </div>
        ) : (
          <div
            style={{
              maxHeight: "240px",
              overflow: "auto",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "8px",
            }}
          >
            {inspectorIssues.slice(0, 50).map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => openFile(issue.path)}
                title={issue.path}
                onMouseEnter={onTextBtnMouseEnter}
                onMouseLeave={onTextBtnMouseLeave}
                onFocus={onTextBtnFocus}
                onBlur={onTextBtnBlur}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  border: "none",
                  borderBottom: "1px solid var(--background-modifier-border)",
                  background: "transparent",
                  cursor: "pointer",
                  outline: "none",
                  transition:
                    "background-color 180ms ease, box-shadow 180ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "baseline",
                  }}
                >
                  <div
                    style={{
                      width: "60px",
                      color:
                        issue.severity === "error"
                          ? "var(--text-error)"
                          : "var(--text-warning)",
                      fontWeight: 600,
                    }}
                  >
                    {issue.severity === "error"
                      ? "错误"
                      : issue.severity === "warn"
                      ? "警告"
                      : "—"}
                  </div>
                  <div style={{ flex: "1 1 auto" }}>
                    <div style={{ fontWeight: 600 }}>{issue.title}</div>
                    <div
                      style={{ color: "var(--text-faint)", fontSize: "0.85em" }}
                    >
                      {issue.path}
                      {issue.detail ? ` — ${issue.detail}` : ""}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {inspectorIssues.length > 50 ? (
              <div
                style={{
                  padding: "8px 10px",
                  color: "var(--text-faint)",
                  fontSize: "0.85em",
                }}
              >
                仅显示前 50 条问题。
              </div>
            ) : null}
          </div>
        )}

        {showFixPlan ? (
          enumPresets ? (
            <div style={{ marginTop: "10px" }}>
              <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                修复方案（预览）
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "10px",
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                  maxHeight: "220px",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {fixPlanText ?? ""}
              </pre>
            </div>
          ) : (
            <div
              style={{
                marginTop: "10px",
                color: "var(--text-faint)",
                fontSize: "0.9em",
              }}
            >
              枚举预设不可用，已禁用修复方案生成。
            </div>
          )
        ) : null}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>管理器（预览 → 确认 → 写入）</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              disabled={!enumPresets}
              onClick={() => {
                if (!enumPresets) return;
                const plan = buildFixPlan(trades, enumPresets);
                setManagerPlan(plan);
                setManagerResult(undefined);
              }}
              title={
                !enumPresets ? "枚举预设不可用" : "使用检查器生成的修复方案"
              }
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                enumPresets
                  ? { ...buttonStyle, padding: "6px 10px" }
                  : { ...disabledButtonStyle, padding: "6px 10px" }
              }
            >
              使用检查器修复方案
            </button>
            <button
              type="button"
              onClick={() => {
                const plan = buildTradeNormalizationPlan(trades, enumPresets, {
                  includeDeleteKeys: true,
                });
                setManagerPlan(plan);
                setManagerResult(undefined);
              }}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={{ ...buttonStyle, padding: "6px 10px" }}
            >
              生成交易计划
            </button>
            <button
              type="button"
              disabled={!loadStrategyNotes}
              onClick={async () => {
                if (!loadStrategyNotes) return;
                setManagerBusy(true);
                try {
                  const notes = await loadStrategyNotes();
                  const plan = buildStrategyMaintenancePlan(
                    notes,
                    enumPresets,
                    { includeDeleteKeys: true }
                  );
                  setManagerPlan(plan);
                  setManagerResult(undefined);
                  setManagerTradeInventory(undefined);
                  setManagerTradeInventoryFiles(undefined);
                  setManagerStrategyInventory(undefined);
                  setManagerStrategyInventoryFiles(undefined);
                } finally {
                  setManagerBusy(false);
                }
              }}
              title={!loadStrategyNotes ? "策略扫描不可用" : "生成策略维护计划"}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                loadStrategyNotes
                  ? { ...buttonStyle, padding: "6px 10px" }
                  : { ...disabledButtonStyle, padding: "6px 10px" }
              }
            >
              生成策略计划
            </button>

            <button
              type="button"
              onClick={async () => {
                setManagerBusy(true);
                try {
                  await scanManagerInventory();
                } finally {
                  setManagerBusy(false);
                }
              }}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                managerBusy
                  ? { ...disabledButtonStyle, padding: "6px 10px" }
                  : { ...buttonStyle, padding: "6px 10px" }
              }
            >
              扫描属性（v5.0）
            </button>
          </div>
        </div>

        <div
          style={{
            color: "var(--text-faint)",
            fontSize: "0.9em",
            marginBottom: "10px",
          }}
        >
          读写模式：生成计划后可直接“应用计划”写入；支持“撤销上次应用”。
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "8px",
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="checkbox"
              checked={managerDeleteKeys}
              onChange={(e) =>
                setManagerDeleteKeys((e.target as HTMLInputElement).checked)
              }
            />
            允许删除字段（危险）
          </label>
          <button
            type="button"
            disabled={!applyFixPlan || !managerPlan || managerBusy}
            onClick={async () => {
              if (!applyFixPlan || !managerPlan) return;
              setManagerBusy(true);
              try {
                const res = await applyFixPlan(managerPlan, {
                  deleteKeys: managerDeleteKeys,
                });
                setManagerResult(res);
                setManagerBackups(res.backups);
              } finally {
                setManagerBusy(false);
              }
            }}
            onMouseEnter={onBtnMouseEnter}
            onMouseLeave={onBtnMouseLeave}
            onFocus={onBtnFocus}
            onBlur={onBtnBlur}
            style={
              !applyFixPlan || !managerPlan || managerBusy
                ? { ...disabledButtonStyle, padding: "6px 10px" }
                : { ...buttonStyle, padding: "6px 10px" }
            }
          >
            应用计划
          </button>
          <button
            type="button"
            disabled={!restoreFiles || !managerBackups || managerBusy}
            onClick={async () => {
              if (!restoreFiles || !managerBackups) return;
              setManagerBusy(true);
              try {
                const res = await restoreFiles(managerBackups);
                setManagerResult(res);
                setManagerBackups(undefined);
                setManagerTradeInventory(undefined);
                setManagerTradeInventoryFiles(undefined);
                setManagerStrategyInventory(undefined);
                setManagerStrategyInventoryFiles(undefined);
              } finally {
                setManagerBusy(false);
              }
            }}
            onMouseEnter={onBtnMouseEnter}
            onMouseLeave={onBtnMouseLeave}
            onFocus={onBtnFocus}
            onBlur={onBtnBlur}
            style={
              !restoreFiles || !managerBackups || managerBusy
                ? { ...disabledButtonStyle, padding: "6px 10px" }
                : { ...buttonStyle, padding: "6px 10px" }
            }
          >
            撤销上次应用
          </button>
        </div>

        {managerPlan ? (
          <pre
            style={{
              margin: 0,
              padding: "10px",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "8px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
              maxHeight: "140px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {managerPlanText ?? ""}
          </pre>
        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            未加载计划（v5.0
            的单步操作会自动生成并应用计划；也可用上面的按钮生成计划）。
          </div>
        )}

        {managerResult ? (
          <div style={{ marginTop: "10px", color: "var(--text-muted)" }}>
            已应用：{managerResult.applied}，失败：{managerResult.failed}
            {managerResult.errors.length > 0 ? (
              <div
                style={{
                  marginTop: "6px",
                  color: "var(--text-faint)",
                  fontSize: "0.9em",
                }}
              >
                {managerResult.errors.slice(0, 5).map((e, idx) => (
                  <div key={`mgr-err-${idx}`}>
                    {e.path}: {e.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: "12px" }}>
          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "10px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>
              💎 上帝模式 (God Mode)
            </div>

            {managerTradeInventory || managerStrategyInventory ? (
              <>
                <input
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                  placeholder="🔍 搜索属性..."
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    border: "1px solid var(--background-modifier-border)",
                    background: "var(--background-primary)",
                    color: "var(--text-normal)",
                    marginBottom: "10px",
                  }}
                />

                {(() => {
                  const q = managerSearch.trim().toLowerCase();

                  const canonicalizeSearch = (s: string) => {
                    const raw = (s ?? "").toString().trim();
                    if (!raw) return "";
                    const low = raw.toLowerCase();
                    if (low === "n/a" || low === "na") return "unknown";
                    if (low.includes("unknown") || raw.includes("未知"))
                      return "unknown";
                    if (low === "null" || raw.includes("空/null"))
                      return "null";
                    if (
                      low.includes("empty") ||
                      raw === "空" ||
                      raw.includes("空/empty")
                    )
                      return "empty";
                    return low;
                  };

                  const qCanon = canonicalizeSearch(q);

                  const groups = MANAGER_GROUPS;
                  const othersTitle = "📂 其他属性 (Other)";

                  const prettyVal = (val: string) => {
                    let s = (val ?? "").toString().trim();
                    if (!s) return "";
                    const low = s.toLowerCase();
                    if (s === "Unknown" || low === "unknown")
                      return "未知/Unknown";
                    if (s === "Empty" || low === "empty") return "空/Empty";
                    if (low === "null") return "空/null";
                    return s;
                  };

                  const matchKeyToGroup = (key: string) => {
                    const tokens = managerKeyTokens(key);
                    for (const g of groups) {
                      for (const kw of g.keywords) {
                        const needle = String(kw ?? "")
                          .trim()
                          .toLowerCase();
                        if (!needle) continue;
                        if (
                          tokens.some((t) => t === needle || t.includes(needle))
                        ) {
                          return g.title;
                        }
                      }
                    }
                    return othersTitle;
                  };

                  const renderInventoryGrid = (
                    inv: FrontmatterInventory | undefined,
                    scope: "trade" | "strategy",
                    title: string
                  ) => {
                    if (!inv) return null;

                    const matchesSearch = (key: string) => {
                      if (!q) return true;
                      const kl = key.toLowerCase();
                      if (kl.includes(q)) return true;
                      if (qCanon && canonicalizeSearch(kl).includes(qCanon))
                        return true;
                      const vals = Object.keys(inv.valPaths[key] ?? {});
                      return vals.some((v) => {
                        const vl = v.toLowerCase();
                        if (vl.includes(q)) return true;
                        if (!qCanon) return false;
                        return canonicalizeSearch(vl).includes(qCanon);
                      });
                    };

                    const bucketed = new Map<string, string[]>();
                    for (const g of groups) bucketed.set(g.title, []);
                    bucketed.set(othersTitle, []);

                    const visibleKeys = inv.keys
                      .map((k) => k.key)
                      .filter((k) => matchesSearch(k));

                    for (const key of visibleKeys) {
                      const g = matchKeyToGroup(key);
                      bucketed.get(g)!.push(key);
                    }

                    const groupEntries: Array<{
                      name: string;
                      keys: string[];
                    }> = [
                      {
                        name: groups[0]?.title ?? "",
                        keys: bucketed.get(groups[0]?.title ?? "") ?? [],
                      },
                      {
                        name: groups[1]?.title ?? "",
                        keys: bucketed.get(groups[1]?.title ?? "") ?? [],
                      },
                      {
                        name: groups[2]?.title ?? "",
                        keys: bucketed.get(groups[2]?.title ?? "") ?? [],
                      },
                      {
                        name: othersTitle,
                        keys: bucketed.get(othersTitle) ?? [],
                      },
                    ].filter((x) => x.name && x.keys.length > 0);

                    return (
                      <div style={{ marginBottom: "14px" }}>
                        <div style={{ fontWeight: 700, margin: "8px 0" }}>
                          {title}
                        </div>
                        {groupEntries.length === 0 ? (
                          <div
                            style={{
                              color: "var(--text-faint)",
                              fontSize: "0.9em",
                            }}
                          >
                            无匹配属性。
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                              gap: "10px",
                            }}
                          >
                            {groupEntries.map((g) => (
                              <div
                                key={`${scope}:${g.name}`}
                                style={{
                                  border:
                                    "1px solid var(--background-modifier-border)",
                                  borderRadius: "12px",
                                  padding: "10px",
                                  background: "var(--background-secondary)",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 700,
                                    marginBottom: "8px",
                                  }}
                                >
                                  {g.name}
                                </div>
                                <div style={{ display: "grid", gap: "6px" }}>
                                  {g.keys.slice(0, 18).map((key) => {
                                    const countFiles = (inv.keyPaths[key] ?? [])
                                      .length;
                                    const vals = Object.keys(
                                      inv.valPaths[key] ?? {}
                                    );
                                    const topVals = vals
                                      .map((v) => ({
                                        v,
                                        c: (inv.valPaths[key]?.[v] ?? [])
                                          .length,
                                      }))
                                      .sort((a, b) => b.c - a.c)
                                      .slice(0, 2);
                                    return (
                                      <div
                                        key={`${scope}:${key}`}
                                        onClick={() => {
                                          setManagerScope(scope);
                                          setManagerInspectorKey(key);
                                          setManagerInspectorTab("vals");
                                          setManagerInspectorFileFilter(
                                            undefined
                                          );
                                        }}
                                        style={{
                                          border:
                                            "1px solid var(--background-modifier-border)",
                                          borderRadius: "10px",
                                          padding: "8px 10px",
                                          background:
                                            "var(--background-primary)",
                                          cursor: "pointer",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontWeight: 650,
                                            display: "flex",
                                            justifyContent: "space-between",
                                            gap: "8px",
                                          }}
                                        >
                                          <span>{key}</span>
                                          <span
                                            style={{
                                              color: "var(--text-faint)",
                                            }}
                                          >
                                            {countFiles}
                                          </span>
                                        </div>
                                        <div
                                          style={{
                                            color: "var(--text-faint)",
                                            fontSize: "0.85em",
                                            marginTop: "2px",
                                            display: "flex",
                                            gap: "8px",
                                            flexWrap: "wrap",
                                          }}
                                        >
                                          {topVals.length ? (
                                            topVals.map((x) => (
                                              <span key={x.v}>
                                                {prettyVal(x.v)} · {x.c}
                                              </span>
                                            ))
                                          ) : (
                                            <span>（无值）</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {g.keys.length > 18 ? (
                                    <div style={{ color: "var(--text-faint)" }}>
                                      还有 {g.keys.length - 18} 个…
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      {renderInventoryGrid(
                        managerTradeInventory,
                        "trade",
                        "🧾 交易属性 (Trades)"
                      )}
                      {renderInventoryGrid(
                        managerStrategyInventory,
                        "strategy",
                        "📚 策略属性 (Strategies)"
                      )}
                    </>
                  );
                })()}

                {managerInspectorKey
                  ? (() => {
                      const inv =
                        managerScope === "strategy"
                          ? managerStrategyInventory
                          : managerTradeInventory;
                      const key = managerInspectorKey;
                      if (!inv) return null;

                      const selectManagerFiles =
                        managerScope === "strategy"
                          ? selectManagerStrategyFiles
                          : selectManagerTradeFiles;

                      const allPaths = inv.keyPaths[key] ?? [];
                      const perVal = inv.valPaths[key] ?? {};
                      const sortedVals = Object.entries(perVal).sort(
                        (a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)
                      );
                      const currentPaths =
                        managerInspectorFileFilter?.paths ?? allPaths;
                      const filterLabel = managerInspectorFileFilter?.label;

                      const prettyManagerVal = (val: string) => {
                        let s = (val ?? "").toString().trim();
                        if (!s) return "";
                        const low = s.toLowerCase();
                        if (s === "Unknown" || low === "unknown")
                          return "未知/Unknown";
                        if (s === "Empty" || low === "empty") return "空/Empty";
                        if (low === "null") return "空/null";
                        return s;
                      };

                      const close = () => {
                        setManagerInspectorKey(undefined);
                        setManagerInspectorTab("vals");
                        setManagerInspectorFileFilter(undefined);
                      };

                      const doRenameKey = async () => {
                        const n = window.prompt(`重命名 ${key}`, key) ?? "";
                        const nextKey = n.trim();
                        if (!nextKey || nextKey === key) return;
                        if (!window.confirm("确认重命名?")) return;
                        const plan = buildRenameKeyPlan(
                          selectManagerFiles(allPaths),
                          key,
                          nextKey,
                          { overwrite: false }
                        );
                        await runManagerPlan(plan, {
                          closeInspector: true,
                          forceDeleteKeys: true,
                          refreshInventory: true,
                        });
                      };

                      const doDeleteKey = async () => {
                        if (!window.confirm(`⚠️ 确认删除属性 [${key}]?`))
                          return;
                        const plan = buildDeleteKeyPlan(
                          selectManagerFiles(allPaths),
                          key
                        );
                        await runManagerPlan(plan, {
                          closeInspector: true,
                          requiresDeleteKeys: true,
                          refreshInventory: true,
                        });
                      };

                      const doAppendVal = async () => {
                        const v = window.prompt("追加新值") ?? "";
                        const val = v.trim();
                        if (!val) return;
                        if (!window.confirm("确认追加?")) return;
                        const plan = buildAppendValPlan(
                          selectManagerFiles(allPaths),
                          key,
                          val
                        );
                        await runManagerPlan(plan, {
                          closeInspector: true,
                          refreshInventory: true,
                        });
                      };

                      const doInjectProp = async () => {
                        const k = window.prompt("属性名") ?? "";
                        const newKey = k.trim();
                        if (!newKey) return;
                        const v = window.prompt(`${newKey} 的值`) ?? "";
                        const newVal = v.trim();
                        if (!newVal) return;
                        if (!window.confirm("确认注入?")) return;
                        const plan = buildInjectPropPlan(
                          selectManagerFiles(currentPaths),
                          newKey,
                          newVal
                        );
                        await runManagerPlan(plan, {
                          closeInspector: true,
                          refreshInventory: true,
                        });
                      };

                      const doUpdateVal = async (
                        val: string,
                        paths: string[]
                      ) => {
                        const n = window.prompt("修改值", val) ?? "";
                        const next = n.trim();
                        if (!next || next === val) return;
                        if (!window.confirm("确认修改?")) return;
                        const plan = buildUpdateValPlan(
                          selectManagerFiles(paths),
                          key,
                          val,
                          next
                        );
                        await runManagerPlan(plan, {
                          closeInspector: true,
                          refreshInventory: true,
                        });
                      };

                      const doDeleteVal = async (
                        val: string,
                        paths: string[]
                      ) => {
                        if (!window.confirm(`确认移除值 "${val}"?`)) return;
                        const plan = buildDeleteValPlan(
                          selectManagerFiles(paths),
                          key,
                          val,
                          {
                            deleteKeyIfEmpty: true,
                          }
                        );
                        await runManagerPlan(plan, {
                          closeInspector: true,
                          refreshInventory: true,
                        });
                      };

                      const showFilesForVal = (
                        val: string,
                        paths: string[]
                      ) => {
                        setManagerInspectorTab("files");
                        setManagerInspectorFileFilter({
                          paths,
                          label: `值: ${val}`,
                        });
                      };

                      return (
                        <div
                          onClick={(e) => {
                            if (e.target === e.currentTarget) close();
                          }}
                          style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(0,0,0,0.35)",
                            zIndex: 9999,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "24px",
                          }}
                        >
                          <div
                            style={{
                              width: "min(860px, 95vw)",
                              maxHeight: "85vh",
                              overflow: "hidden",
                              borderRadius: "12px",
                              border:
                                "1px solid var(--background-modifier-border)",
                              background: "var(--background-primary)",
                              display: "flex",
                              flexDirection: "column",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "12px",
                                padding: "12px 14px",
                                borderBottom:
                                  "1px solid var(--background-modifier-border)",
                              }}
                            >
                              <div style={{ fontWeight: 800 }}>
                                {key}
                                <span
                                  style={{
                                    color: "var(--text-faint)",
                                    fontSize: "0.9em",
                                    marginLeft: "10px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {managerScope === "strategy"
                                    ? "策略"
                                    : "交易"}
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                  type="button"
                                  disabled={managerBusy}
                                  onClick={doDeleteKey}
                                  style={
                                    managerBusy
                                      ? {
                                          ...disabledButtonStyle,
                                          padding: "6px 10px",
                                        }
                                      : { ...buttonStyle, padding: "6px 10px" }
                                  }
                                >
                                  🗑️ 删除属性
                                </button>
                                <button
                                  type="button"
                                  onClick={close}
                                  style={{
                                    ...buttonStyle,
                                    padding: "6px 10px",
                                  }}
                                >
                                  关闭
                                </button>
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                padding: "10px 14px",
                                borderBottom:
                                  "1px solid var(--background-modifier-border)",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setManagerInspectorTab("vals");
                                  setManagerInspectorFileFilter(undefined);
                                }}
                                style={{
                                  ...buttonStyle,
                                  padding: "6px 10px",
                                  background:
                                    managerInspectorTab === "vals"
                                      ? "rgba(var(--mono-rgb-100), 0.08)"
                                      : "var(--background-primary)",
                                }}
                              >
                                属性值 ({sortedVals.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setManagerInspectorTab("files")}
                                style={{
                                  ...buttonStyle,
                                  padding: "6px 10px",
                                  background:
                                    managerInspectorTab === "files"
                                      ? "rgba(var(--mono-rgb-100), 0.08)"
                                      : "var(--background-primary)",
                                }}
                              >
                                关联文件 ({allPaths.length})
                              </button>
                            </div>

                            <div
                              style={{
                                padding: "10px 14px",
                                overflow: "auto",
                                flex: "1 1 auto",
                              }}
                            >
                              {managerInspectorTab === "vals" ? (
                                <div style={{ display: "grid", gap: "8px" }}>
                                  {sortedVals.length === 0 ? (
                                    <div
                                      style={{
                                        padding: "40px",
                                        textAlign: "center",
                                        color: "var(--text-faint)",
                                      }}
                                    >
                                      无值记录
                                    </div>
                                  ) : (
                                    sortedVals.map(([val, paths]) => (
                                      <div
                                        key={`mgr-v5-row-${val}`}
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          gap: "10px",
                                          border:
                                            "1px solid var(--background-modifier-border)",
                                          borderRadius: "10px",
                                          padding: "10px",
                                          background:
                                            "rgba(var(--mono-rgb-100), 0.03)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "10px",
                                            minWidth: 0,
                                          }}
                                        >
                                          <span
                                            style={{
                                              border:
                                                "1px solid var(--background-modifier-border)",
                                              borderRadius: "999px",
                                              padding: "2px 10px",
                                              background:
                                                "var(--background-primary)",
                                              maxWidth: "520px",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                            }}
                                            title={val}
                                          >
                                            {prettyManagerVal(val) || val}
                                          </span>
                                          <span
                                            style={{
                                              color: "var(--text-muted)",
                                              fontVariantNumeric:
                                                "tabular-nums",
                                            }}
                                          >
                                            {paths.length}
                                          </span>
                                        </div>
                                        <div
                                          style={{
                                            display: "flex",
                                            gap: "8px",
                                          }}
                                        >
                                          <button
                                            type="button"
                                            disabled={managerBusy}
                                            onClick={() =>
                                              void doUpdateVal(val, paths)
                                            }
                                            style={
                                              managerBusy
                                                ? {
                                                    ...disabledButtonStyle,
                                                    padding: "6px 10px",
                                                  }
                                                : {
                                                    ...buttonStyle,
                                                    padding: "6px 10px",
                                                  }
                                            }
                                            title="修改"
                                          >
                                            ✏️
                                          </button>
                                          <button
                                            type="button"
                                            disabled={managerBusy}
                                            onClick={() =>
                                              void doDeleteVal(val, paths)
                                            }
                                            style={
                                              managerBusy
                                                ? {
                                                    ...disabledButtonStyle,
                                                    padding: "6px 10px",
                                                  }
                                                : {
                                                    ...buttonStyle,
                                                    padding: "6px 10px",
                                                  }
                                            }
                                            title="删除"
                                          >
                                            🗑️
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              showFilesForVal(val, paths)
                                            }
                                            style={{
                                              ...buttonStyle,
                                              padding: "6px 10px",
                                            }}
                                            title="查看文件"
                                          >
                                            👁️
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              ) : (
                                <div style={{ display: "grid", gap: "8px" }}>
                                  {filterLabel ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        color: "var(--text-accent)",
                                        fontWeight: 700,
                                        padding: "8px 10px",
                                        border:
                                          "1px solid var(--background-modifier-border)",
                                        borderRadius: "10px",
                                        background:
                                          "rgba(var(--mono-rgb-100), 0.03)",
                                      }}
                                    >
                                      <span>🔍 筛选: {filterLabel}</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setManagerInspectorFileFilter(
                                            undefined
                                          )
                                        }
                                        style={{
                                          ...buttonStyle,
                                          padding: "6px 10px",
                                        }}
                                      >
                                        ✕ 重置
                                      </button>
                                    </div>
                                  ) : null}

                                  {currentPaths.slice(0, 200).map((p) => (
                                    <button
                                      key={`mgr-v5-file-${p}`}
                                      type="button"
                                      onClick={() => void openFile?.(p)}
                                      title={p}
                                      onMouseEnter={onTextBtnMouseEnter}
                                      onMouseLeave={onTextBtnMouseLeave}
                                      onFocus={onTextBtnFocus}
                                      onBlur={onTextBtnBlur}
                                      style={{
                                        textAlign: "left",
                                        border:
                                          "1px solid var(--background-modifier-border)",
                                        borderRadius: "10px",
                                        padding: "10px",
                                        background: "var(--background-primary)",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <div style={{ fontWeight: 700 }}>
                                        {p.split("/").pop()}
                                      </div>
                                      <div
                                        style={{
                                          color: "var(--text-faint)",
                                          fontSize: "0.85em",
                                          opacity: 0.8,
                                        }}
                                      >
                                        {p}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div
                              style={{
                                padding: "10px 14px",
                                borderTop:
                                  "1px solid var(--background-modifier-border)",
                                display: "flex",
                                gap: "10px",
                                justifyContent: "flex-end",
                              }}
                            >
                              {managerInspectorTab === "vals" ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={managerBusy}
                                    onClick={() => void doRenameKey()}
                                    style={
                                      managerBusy
                                        ? {
                                            ...disabledButtonStyle,
                                            padding: "6px 10px",
                                          }
                                        : {
                                            ...buttonStyle,
                                            padding: "6px 10px",
                                          }
                                    }
                                  >
                                    ✏️ 重命名
                                  </button>
                                  <button
                                    type="button"
                                    disabled={managerBusy}
                                    onClick={() => void doAppendVal()}
                                    style={
                                      managerBusy
                                        ? {
                                            ...disabledButtonStyle,
                                            padding: "6px 10px",
                                          }
                                        : {
                                            ...buttonStyle,
                                            padding: "6px 10px",
                                          }
                                    }
                                  >
                                    ➕ 追加新值
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={managerBusy}
                                  onClick={() => void doInjectProp()}
                                  style={
                                    managerBusy
                                      ? {
                                          ...disabledButtonStyle,
                                          padding: "6px 10px",
                                        }
                                      : { ...buttonStyle, padding: "6px 10px" }
                                  }
                                >
                                  💉 注入属性
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  : null}
              </>
            ) : (
              <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                尚未扫描属性。点击上方“扫描属性（v5.0）”。
              </div>
            )}
          </div>
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
              markdown={`**❓ 疑难杂症 (Questions)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/question\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**🚨 紧急事项 (Urgent)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/urgent\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n`}
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
              markdown={`**🧪 回测任务 (Backtest)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/backtest\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**📝 复盘任务 (Review)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/review\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**📖 待学习/阅读 (Study)**\n\n\
\`\`\`tasks\n\
not done\n\
(tag includes #task/study) OR (tag includes #task/read) OR (tag includes #task/watch)\n\
path does not include Templates\n\
limit 5\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**🔬 待验证想法 (Verify)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/verify\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n`}
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
              markdown={`**📝 手动打卡 (Checklist)**\n\n\
- [ ] ☀️ **盘前**：阅读新闻，标记关键位 (S/R Levels) 🔁 every day\n\
- [ ] 🧘 **盘中**：每小时检查一次情绪 (FOMO Check) 🔁 every day\n\
- [ ] 🌙 **盘后**：填写当日 \`复盘日记\` 🔁 every day\n\n\
**🧹 杂项待办 (To-Do)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/todo\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
limit 5\n\
\`\`\`\n`}
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
              markdown={`**🖨️ 待打印 (Print Queue)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/print\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**📂 待整理 (Organize)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/organize\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n`}
            />
          </div>
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
        <div style={{ fontWeight: 700 }}>📥 导出</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>导出</div>
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "10px",
          }}
        >
          <button
            type="button"
            disabled={!runCommand}
            onClick={() =>
              runCommand?.("al-brooks-console:export-legacy-snapshot")
            }
            style={runCommand ? buttonStyle : disabledButtonStyle}
          >
            导出旧版兼容快照 (pa-db-export.json)
          </button>
          <button
            type="button"
            disabled={!runCommand}
            onClick={() =>
              runCommand?.("al-brooks-console:export-index-snapshot")
            }
            style={runCommand ? buttonStyle : disabledButtonStyle}
          >
            导出索引快照 (Index Snapshot)
          </button>
        </div>

        <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
          v5.0 在页面底部提供“一键备份数据库”按钮（写入
          pa-db-export.json）。插件版
          目前提供两类导出：旧版兼容快照（写入 vault 根目录
          pa-db-export.json）与索引快照（导出到 Exports/al-brooks-console/）。
        </div>
      </div>

        </>
      ) : null}
    </div>
  );
};

export class ConsoleView extends ItemView {
  private index: TradeIndex;
  private strategyIndex: StrategyIndex;
  private todayContext?: TodayContext;
  private integrations?: PluginIntegrationRegistry;
  private version: string;
  private root: Root | null = null;
  private mountEl: HTMLElement | null = null;
  private getSettings: () => AlBrooksConsoleSettings;
  private subscribeSettings: (
    listener: (settings: AlBrooksConsoleSettings) => void
  ) => () => void;

  constructor(
    leaf: WorkspaceLeaf,
    index: TradeIndex,
    strategyIndex: StrategyIndex,
    todayContext: TodayContext,
    integrations: PluginIntegrationRegistry,
    version: string,
    getSettings: () => AlBrooksConsoleSettings,
    subscribeSettings: (
      listener: (settings: AlBrooksConsoleSettings) => void
    ) => () => void
  ) {
    super(leaf);
    this.index = index;
    this.strategyIndex = strategyIndex;
    this.todayContext = todayContext;
    this.integrations = integrations;
    this.version = version;
    this.getSettings = getSettings;
    this.subscribeSettings = subscribeSettings;
  }

  getViewType() {
    return VIEW_TYPE_CONSOLE;
  }

  getDisplayText() {
    return "交易员控制台";
  }

  getIcon() {
    return "bar-chart-2";
  }

  async onOpen() {
    const openFile = (path: string) => {
      this.app.workspace.openLinkText(path, "", true);
    };

    const openGlobalSearch = (query: string) => {
      try {
        const plugin = (this.app as any)?.internalPlugins?.plugins?.[
          "global-search"
        ];
        const inst = plugin?.instance as any;
        inst?.openGlobalSearch?.(query);
      } catch {
        // best-effort only
      }
    };

    const resolveLink = (
      linkText: string,
      fromPath: string
    ): string | undefined => {
      const cleaned = String(linkText ?? "").trim();
      if (!cleaned) return undefined;
      const dest = this.app.metadataCache.getFirstLinkpathDest(
        cleaned,
        fromPath
      );
      return dest?.path;
    };

    const getResourceUrl = (path: string): string | undefined => {
      const af = this.app.vault.getAbstractFileByPath(path);
      if (!(af instanceof TFile)) return undefined;
      return this.app.vault.getResourcePath(af);
    };

    const createTradeNote = async (): Promise<void> => {
      const TEMPLATE_PATH = "Templates/单笔交易模版 (Trade Note).md";
      const DEST_DIR = "Daily/Trades";

      const ensureFolder = async (path: string): Promise<void> => {
        const parts = String(path ?? "")
          .replace(/^\/+/, "")
          .split("/")
          .map((p) => p.trim())
          .filter(Boolean);

        let cur = "";
        for (const p of parts) {
          cur = cur ? `${cur}/${p}` : p;
          const existing = this.app.vault.getAbstractFileByPath(cur);
          if (!existing) {
            try {
              await this.app.vault.createFolder(cur);
            } catch {
              // ignore if created concurrently
            }
          }
        }
      };

      const pickAvailablePath = async (basePath: string): Promise<string> => {
        const raw = String(basePath ?? "").replace(/^\/+/, "");
        if (!this.app.vault.getAbstractFileByPath(raw)) return raw;

        const m = raw.match(/^(.*?)(\.[^./]+)$/);
        const prefix = m ? m[1] : raw;
        const ext = m ? m[2] : "";
        for (let i = 2; i <= 9999; i++) {
          const candidate = `${prefix}_${i}${ext}`;
          if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
        }
        return `${prefix}_${Date.now()}${ext}`;
      };

      const today = toLocalDateIso(new Date());
      await ensureFolder(DEST_DIR);

      let content = "";
      try {
        const af = this.app.vault.getAbstractFileByPath(TEMPLATE_PATH);
        if (af instanceof TFile) content = await this.app.vault.read(af);
      } catch {
        // best-effort only
      }

      if (!content.trim()) {
        content = `---\n${stringifyYaml({
          tags: [TRADE_TAG],
          date: today,
        }).trimEnd()}\n---\n\n`;
      }

      const base = `${DEST_DIR}/${today}_Trade.md`;
      const path = await pickAvailablePath(base);
      await this.app.vault.create(path, content);
      openFile(path);
    };

    let enumPresets: EnumPresets | undefined = undefined;
    try {
      const presetsPath = "Templates/属性值预设.md";
      const af = this.app.vault.getAbstractFileByPath(presetsPath);
      if (af instanceof TFile) {
        let fm = this.app.metadataCache.getFileCache(af)?.frontmatter as any;
        if (!fm) {
          const text = await this.app.vault.read(af);
          const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
          if (m && m[1]) fm = parseYaml(m[1]);
        }
        if (fm && typeof fm === "object") {
          enumPresets = createEnumPresetsFromFrontmatter(
            fm as Record<string, unknown>
          );
        }
      }
    } catch (e) {
      // best-effort only; dashboard should still render without presets
    }

    const applyFrontmatterPatch = (
      text: string,
      updates: Record<string, unknown>,
      deleteKeys?: string[]
    ): string => {
      const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
      const yamlText = m?.[1];
      const body = m ? text.slice(m[0].length) : text;
      const fmRaw = yamlText ? (parseYaml(yamlText) as any) : {};
      const fm: Record<string, any> =
        fmRaw && typeof fmRaw === "object" ? { ...fmRaw } : {};
      for (const [k, v] of Object.entries(updates ?? {})) fm[k] = v;
      if (deleteKeys && deleteKeys.length > 0) {
        for (const k of deleteKeys) delete fm[k];
      }
      const nextYaml = String(stringifyYaml(fm) ?? "").trimEnd();
      return `---\n${nextYaml}\n---\n${body}`;
    };

    const applyFixPlan = async (
      plan: FixPlan,
      options?: { deleteKeys?: boolean }
    ) => {
      const res: ManagerApplyResult = {
        applied: 0,
        failed: 0,
        errors: [],
        backups: {},
      };
      for (const fu of plan.fileUpdates ?? []) {
        try {
          const af = this.app.vault.getAbstractFileByPath(fu.path);
          if (!(af instanceof TFile)) {
            res.failed += 1;
            res.errors.push({ path: fu.path, message: "文件未找到" });
            continue;
          }
          const oldText = await this.app.vault.read(af);
          res.backups[fu.path] = oldText;
          const nextText = applyFrontmatterPatch(
            oldText,
            fu.updates ?? {},
            options?.deleteKeys ? fu.deleteKeys : undefined
          );
          if (nextText !== oldText) {
            await this.app.vault.modify(af, nextText);
            res.applied += 1;
          }
        } catch (e) {
          res.failed += 1;
          res.errors.push({
            path: fu.path,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return res;
    };

    const restoreFiles = async (backups: Record<string, string>) => {
      const res: ManagerApplyResult = {
        applied: 0,
        failed: 0,
        errors: [],
        backups: {},
      };
      for (const [path, text] of Object.entries(backups ?? {})) {
        try {
          const af = this.app.vault.getAbstractFileByPath(path);
          if (!(af instanceof TFile)) {
            res.failed += 1;
            res.errors.push({ path, message: "文件未找到" });
            continue;
          }
          const oldText = await this.app.vault.read(af);
          res.backups[path] = oldText;
          if (text !== oldText) {
            await this.app.vault.modify(af, text);
            res.applied += 1;
          }
        } catch (e) {
          res.failed += 1;
          res.errors.push({
            path,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return res;
    };

    const loadStrategyNotes = async (): Promise<StrategyNoteFrontmatter[]> => {
      const repoPath = "策略仓库 (Strategy Repository)";
      const prefix = repoPath
        ? `${repoPath.replace(/^\/+/, "").trim().replace(/\/+$/, "")}/`
        : "";
      const out: StrategyNoteFrontmatter[] = [];
      const STRATEGY_TAG = "PA/Strategy";
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => (prefix ? f.path.startsWith(prefix) : true));
      for (const f of files) {
        const cache = this.app.metadataCache.getFileCache(f);
        let fm = cache?.frontmatter as Record<string, unknown> | undefined;
        const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
        const fmTagsRaw = (fm as any)?.tags as unknown;
        const fmTags = Array.isArray(fmTagsRaw)
          ? fmTagsRaw.filter((t): t is string => typeof t === "string")
          : typeof fmTagsRaw === "string"
          ? [fmTagsRaw]
          : [];
        const normalized = [...cacheTags, ...fmTags].map(normalizeTag);
        const isStrategy = normalized.some(
          (t) => t.toLowerCase() === STRATEGY_TAG.toLowerCase()
        );
        if (!isStrategy) continue;
        if (!fm) {
          try {
            const text = await this.app.vault.read(f);
            const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
            if (m && m[1]) {
              const parsed = parseYaml(m[1]);
              fm =
                parsed && typeof parsed === "object"
                  ? (parsed as any)
                  : undefined;
            }
          } catch (e) {
            // ignore
          }
        }
        if (fm) out.push({ path: f.path, frontmatter: fm });
      }
      return out;
    };

    const loadPaTagSnapshot = async (): Promise<PaTagSnapshot> => {
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => !f.path.startsWith("Templates/"));

      const tagMap: Record<string, number> = {};
      let countFiles = 0;

      const isPaTag = (t: string): boolean => {
        const n = normalizeTag(t).toLowerCase();
        return n === "pa" || n.startsWith("pa/");
      };

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const cache = this.app.metadataCache.getFileCache(f);
        const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
        const fm = cache?.frontmatter as any;
        const fmTagsRaw = fm?.tags as unknown;
        const fmTags = Array.isArray(fmTagsRaw)
          ? fmTagsRaw.filter((t): t is string => typeof t === "string")
          : typeof fmTagsRaw === "string"
          ? [fmTagsRaw]
          : [];
        const normalized = [...cacheTags, ...fmTags].map(normalizeTag);
        if (!normalized.some(isPaTag)) continue;

        countFiles += 1;
        for (const tag of normalized) {
          tagMap[tag] = (tagMap[tag] ?? 0) + 1;
        }

        if (i % 250 === 0) await new Promise((r) => window.setTimeout(r, 0));
      }

      return { files: countFiles, tagMap };
    };

    const loadCourse = async (
      settings: AlBrooksConsoleSettings
    ): Promise<CourseSnapshot> => {
      const syllabusName = "PA_Syllabus_Data.md";
      const syFile = this.app.vault
        .getMarkdownFiles()
        .find((f) => f.name === syllabusName);
      const syllabus = syFile
        ? parseSyllabusJsonFromMarkdown(await this.app.vault.read(syFile))
        : [];

      const COURSE_TAG = "PA/Course";
      const doneIds = new Set<string>();
      const linksById: Record<string, { path: string; name: string }> = {};

      const files = this.app.vault.getMarkdownFiles();
      for (const f of files) {
        const cache = this.app.metadataCache.getFileCache(f);
        const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
        const fm = cache?.frontmatter as any;
        const fmTagsRaw = fm?.tags as unknown;
        const fmTags = Array.isArray(fmTagsRaw)
          ? fmTagsRaw.filter((t): t is string => typeof t === "string")
          : typeof fmTagsRaw === "string"
          ? [fmTagsRaw]
          : [];
        const normalized = [...cacheTags, ...fmTags].map(normalizeTag);
        const isCourse = normalized.some(
          (t) => t.toLowerCase() === COURSE_TAG.toLowerCase()
        );
        if (!isCourse) continue;

        let ids = fm?.module_id as unknown;
        if (!ids) continue;
        if (!Array.isArray(ids)) ids = [ids];
        const studied = Boolean(fm?.studied);
        for (const id of ids as any[]) {
          const strId = String(id ?? "").trim();
          if (!strId) continue;
          linksById[strId] = { path: f.path, name: f.name };
          if (studied) doneIds.add(strId);
        }
      }

      return buildCourseSnapshot({
        syllabus,
        doneIds,
        linksById,
        courseRecommendationWindow: settings.courseRecommendationWindow,
      });
    };

    const loadMemory = async (
      settings: AlBrooksConsoleSettings
    ): Promise<MemorySnapshot> => {
      const FLASH_TAG = "flashcards";
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => !f.path.startsWith("Templates/"));
      const picked = files.filter((f) => {
        const cache = this.app.metadataCache.getFileCache(f);
        const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
        const fm = cache?.frontmatter as any;
        const fmTagsRaw = fm?.tags as unknown;
        const fmTags = Array.isArray(fmTagsRaw)
          ? fmTagsRaw.filter((t): t is string => typeof t === "string")
          : typeof fmTagsRaw === "string"
          ? [fmTagsRaw]
          : [];
        const normalized = [...cacheTags, ...fmTags].map(normalizeTag);
        return normalized.some(
          (t) => t.toLowerCase() === FLASH_TAG.toLowerCase()
        );
      });

      const fileInputs: Array<{
        path: string;
        name: string;
        folder: string;
        content: string;
      }> = [];
      for (let i = 0; i < picked.length; i++) {
        const f = picked[i];
        const content = await this.app.vault.read(f);
        const folder = f.path.split("/").slice(0, -1).pop() || "Root";
        fileInputs.push({ path: f.path, name: f.name, folder, content });
        if (i % 12 === 0) await new Promise((r) => window.setTimeout(r, 0));
      }

      return buildMemorySnapshot({
        files: fileInputs,
        today: new Date(),
        dueThresholdDays: settings.srsDueThresholdDays,
        randomQuizCount: settings.srsRandomQuizCount,
      });
    };

    this.contentEl.empty();
    this.mountEl = this.contentEl.createDiv();
    this.root = createRoot(this.mountEl);
    this.root.render(
      <ConsoleErrorBoundary>
        <ConsoleComponent
          index={this.index}
          strategyIndex={this.strategyIndex}
          todayContext={this.todayContext}
          resolveLink={resolveLink}
          getResourceUrl={getResourceUrl}
          enumPresets={enumPresets}
          loadStrategyNotes={loadStrategyNotes}
          loadPaTagSnapshot={loadPaTagSnapshot}
          applyFixPlan={applyFixPlan}
          restoreFiles={restoreFiles}
          createTradeNote={createTradeNote}
          settings={this.getSettings()}
          subscribeSettings={this.subscribeSettings}
          loadCourse={loadCourse}
          loadMemory={loadMemory}
          integrations={this.integrations}
          openFile={openFile}
          openGlobalSearch={openGlobalSearch}
          runCommand={(commandId) =>
            (this.app as any).commands?.executeCommandById?.(commandId)
          }
          version={this.version}
        />
      </ConsoleErrorBoundary>
    );
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
    this.mountEl = null;
  }
}

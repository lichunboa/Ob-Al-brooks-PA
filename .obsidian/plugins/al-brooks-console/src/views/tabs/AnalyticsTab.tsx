import * as React from "react";
import type { AccountType, TradeRecord } from "../../core/contracts";
import type { AnalyticsScope } from "../../core/analytics";
import { V5_COLORS, withHexAlpha } from "../../ui/tokens";
import { AccountSummaryCards } from "../components/analytics/AccountSummaryCards";
import { MarketCyclePerformance } from "../components/analytics/MarketCyclePerformance";
import { TuitionCostPanel } from "../components/analytics/TuitionCostPanel";
import { AnalyticsSuggestion } from "../components/analytics/AnalyticsSuggestion";
import { DataAnalysisPanel } from "../components/analytics/DataAnalysisPanel";
// 样式常量通过Props传递

// Props接口
export interface AnalyticsTabProps {
  // 数据Props
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
  dailyAgg?: any[];
  analyticsRecentLiveTradesAsc: TradeRecord[];
  analyticsRMultiples: {
    avg: number;
    maxAbs: number;
  };
  analyticsMind: {
    status: string;
    color: string;
    fomo: number;
    tilt: number;
    hesitation: number;
  };
  analyticsTopStrats: any[];
  liveCyclePerf: any[];
  tuition: {
    tuitionR: number;
    rows: any[];
  };
  calendarCells: any[];
  calendarMaxAbs: number;
  calendarDays: number;
  strategyAttribution: any[];
  analyticsScope: AnalyticsScope;
  gallery: {
    items: any[];
    scopeTotal: number;
    candidateCount: number;
  };
  galleryScope: AnalyticsScope;
  gallerySearchHref: string;
  allTradesDateRange: {
    min: string | null;
    max: string | null;
  };

  // 函数Props
  setAnalyticsScope: (scope: AnalyticsScope) => void;
  setGalleryScope: (scope: AnalyticsScope) => void;
  openFile: (path: string) => void;
  getResourceUrl: ((path: string) => string) | undefined;

  // 样式Props
  textButtonStyle: React.CSSProperties;
  cardTightStyle: React.CSSProperties;
  cardSubtleTightStyle: React.CSSProperties;
  selectStyle: React.CSSProperties;

  // 常量Props (样式)
  SPACE: any;  // 样式常量对象

  // 事件处理Props
  onTextBtnMouseEnter: (e: React.MouseEvent) => void;
  onTextBtnMouseLeave: (e: React.MouseEvent) => void;
  onTextBtnFocus: (e: React.FocusEvent) => void;
  onTextBtnBlur: (e: React.FocusEvent) => void;
  onCoverMouseEnter: (e: React.MouseEvent) => void;
  onCoverMouseLeave: (e: React.MouseEvent) => void;
  onCoverFocus: (e: React.FocusEvent) => void;
  onCoverBlur: (e: React.FocusEvent) => void;

  // 工具函数Props
  getDayOfMonth: (dateIso: string) => string;
  getRColorByAccountType: (accountType: AccountType) => string;
  getPoints: (values: number[], w: number, h: number, pad: number) => string;

  // 常量Props
  CYCLE_MAP: Record<string, string>;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  summary,
  strategyLab,
  contextAnalysis,
  analyticsSuggestion,
  dailyAgg,
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
  onTextBtnMouseEnter,
  onTextBtnMouseLeave,
  onTextBtnFocus,
  onTextBtnBlur,
  onCoverMouseEnter,
  onCoverMouseLeave,
  onCoverFocus,
  onCoverBlur,
  getDayOfMonth,
  getRColorByAccountType,
  getPoints,
  CYCLE_MAP,
}) => {
  return (
    <>
      <div
        style={{
          margin: `${SPACE.xxl} 0 ${SPACE.sm}`,
          paddingBottom: SPACE.xs,
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: SPACE.sm,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>📊 数据中心</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Analytics Hub
        </div>
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
            onTextBtnMouseEnter={onTextBtnMouseEnter}
            onTextBtnMouseLeave={onTextBtnMouseLeave}
            onTextBtnFocus={onTextBtnFocus}
            onTextBtnBlur={onTextBtnBlur}
          />

          <div
            style={{
              ...cardTightStyle,
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
              <div
                style={{ color: "var(--text-muted)", fontSize: "0.85em" }}
              >
                Avg R: {analyticsRMultiples.avg.toFixed(2)}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: SPACE.md }}>
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
                        border:
                          "1px solid var(--background-modifier-border)",
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
                            borderTop:
                              "1px dashed rgba(var(--mono-rgb-100), 0.25)",
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
                              typeof t.pnl === "number" &&
                                Number.isFinite(t.pnl)
                                ? t.pnl
                                : 0;
                            let h = Math.abs(r) * rScale;
                            if (h < 3) h = 3;
                            const color =
                              r > 0
                                ? V5_COLORS.win
                                : r < 0
                                  ? V5_COLORS.loss
                                  : "var(--text-muted)";
                            const top = r >= 0 ? rZeroY - h : rZeroY;
                            return (
                              <div
                                key={`rbar-${t.path}-${t.dateIso}-${i}`}
                                title={`${t.dateIso} | ${t.name
                                  } | R: ${r.toFixed(2)}`}
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

              <div style={cardSubtleTightStyle}>
                <div
                  style={{ color: "var(--text-muted)", fontSize: "0.9em" }}
                >
                  🧠 实盘心态
                </div>
                <div
                  style={{
                    fontSize: "1.15em",
                    fontWeight: 900,
                    color: analyticsMind.color,
                    marginTop: SPACE.xs,
                  }}
                >
                  {analyticsMind.status}
                </div>
                <div
                  style={{
                    color: "var(--text-faint)",
                    fontSize: "0.85em",
                    marginTop: SPACE.xs,
                  }}
                >
                  FOMO: {analyticsMind.fomo} | Tilt: {analyticsMind.tilt} |
                  犹豫: {analyticsMind.hesitation}
                </div>
              </div>
            </div>

            <div style={{ marginTop: "12px" }}>
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                📊 热门策略
              </div>
              {analyticsTopStrats.length === 0 ? (
                <div
                  style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                >
                  暂无数据
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {analyticsTopStrats.map((s) => {
                    const color =
                      s.wr >= 50
                        ? V5_COLORS.win
                        : s.wr >= 40
                          ? V5_COLORS.back
                          : V5_COLORS.loss;
                    let displayName = s.name;
                    if (
                      displayName.length > 12 &&
                      displayName.includes("(")
                    ) {
                      displayName = displayName.split("(")[0].trim();
                    }
                    return (
                      <div
                        key={`topstrat-${s.name}`}
                        style={{
                          background: "rgba(var(--mono-rgb-100), 0.03)",
                          border:
                            "1px solid var(--background-modifier-border)",
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
                              border:
                                "1px solid var(--background-modifier-border)",
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
                        <div
                          style={{ flex: "0 0 auto", textAlign: "right" }}
                        >
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
        </div>

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
                <span
                  style={{
                    fontWeight: 600,
                    opacity: 0.6,
                    fontSize: "0.85em",
                  }}
                >
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
              const zeroY =
                pad + (1 - (0 - minVal) / range) * (h - pad * 2);

              // getPoints 已移至 utils/chart-utils.ts

              const ptsLive = getPoints(strategyLab.curves.Live, w, h, pad);
              const ptsDemo = getPoints(strategyLab.curves.Demo, w, h, pad);
              const ptsBack = getPoints(strategyLab.curves.Backtest, w, h, pad);

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

            {/* Removed embedded strategy/suggestion duplicates; keep only primary modules elsewhere. */}
          </div>

          <div
            style={{
              ...cardTightStyle,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: SPACE.sm,
                marginBottom: SPACE.sm,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 700, opacity: 0.75 }}>
                🖼️ 最新复盘{" "}
                <span
                  style={{
                    fontWeight: 600,
                    opacity: 0.6,
                    fontSize: "0.85em",
                  }}
                >
                  （图表/Charts）
                </span>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: SPACE.xs,
                  color: "var(--text-muted)",
                  fontSize: "0.9em",
                }}
              >
                范围
                <select
                  value={galleryScope}
                  onChange={(e) =>
                    setGalleryScope(e.target.value as AnalyticsScope)
                  }
                  style={selectStyle}
                >
                  <option value="All">全部</option>
                  <option value="Live">实盘</option>
                  <option value="Backtest">回测</option>
                  <option value="Demo">模拟</option>
                </select>
              </label>
            </div>

            <div
              style={{
                marginTop: "2px",
                color: "var(--text-faint)",
                fontSize: "0.8em",
              }}
            >
              {`范围内共 ${gallery.scopeTotal} 笔 · 候选 ${gallery.candidateCount} · 展示 ${gallery.items.length}`}
            </div>

            {!getResourceUrl ? (
              <div
                style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
              >
                画廊不可用。
              </div>
            ) : gallery.items.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: SPACE.md,
                }}
              >
                {gallery.items.map((it) => (
                  <button
                    key={`gal-${it.tradePath}`}
                    type="button"
                    onClick={() => openFile(it.tradePath)}
                    title={`${it.tradeName} • ${it.coverPath}`}
                    onMouseEnter={onCoverMouseEnter}
                    onMouseLeave={onCoverMouseLeave}
                    onFocus={onCoverFocus}
                    onBlur={onCoverBlur}
                    style={{
                      display: "block",
                      width: "100%",
                      height: "auto",
                      minHeight: "140px",
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
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                            zIndex: 1,
                          }}
                        />

                        <div
                          style={{
                            position: "absolute",
                            top: SPACE.xs,
                            right: SPACE.xs,
                            zIndex: 2,
                            background:
                              it.accountType === "Live"
                                ? V5_COLORS.live
                                : it.accountType === "Backtest"
                                  ? V5_COLORS.back
                                  : V5_COLORS.demo,
                            border:
                              "1px solid var(--background-modifier-border)",
                            color: "rgba(var(--mono-rgb-0), 0.9)",
                            fontSize: "0.6em",
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: "4px",
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
                            zIndex: 2,
                            padding: `${SPACE.xxl} ${SPACE.sm} ${SPACE.xs}`,
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
                              fontSize: "0.75em",
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
                                  ? V5_COLORS.live
                                  : V5_COLORS.loss,
                              fontWeight: 800,
                              fontSize: "0.9em",
                              flex: "0 0 auto",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {(() => {
                              const s = it.pnl
                                .toFixed(1)
                                .replace(/\.0$/, "");
                              return `${it.pnl > 0 ? "+" : ""}${s}`;
                            })()}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          padding: SPACE.md,
                          color: "var(--text-muted)",
                          fontSize: "0.9em",
                          zIndex: 1,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            color: "var(--text-faint)",
                          }}
                        >
                          无封面
                        </div>
                        <div
                          style={{
                            fontWeight: 800,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            width: "100%",
                          }}
                        >
                          {it.tradeName}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            width: "100%",
                            gap: SPACE.sm,
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.8em",
                              color: "var(--text-faint)",
                              border:
                                "1px solid var(--background-modifier-border)",
                              borderRadius: "999px",
                              padding: "2px 8px",
                              background: "var(--background-primary)",
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
                              color:
                                it.pnl >= 0
                                  ? V5_COLORS.win
                                  : V5_COLORS.loss,
                              fontWeight: 900,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {(() => {
                              const s = it.pnl
                                .toFixed(1)
                                .replace(/\.0$/, "");
                              return `${it.pnl > 0 ? "+" : ""}${s}R`;
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div
                style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
              >
                暂无封面图片。请在 Frontmatter 添加 cover: [[图片]] 或
                图片路径。
              </div>
            )}

            <div
              style={{
                textAlign: "center",
                marginTop: SPACE.md,
                paddingTop: SPACE.sm,
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
        </div>
      </div>
    </>
  );
};

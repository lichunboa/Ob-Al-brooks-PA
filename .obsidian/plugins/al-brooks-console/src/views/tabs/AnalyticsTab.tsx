import * as React from "react";
import {
    GlassCard,
    GlassPanel,
    GlassInset,
    HeadingM,
    Label,
    DisplayXL,
    StatusBadge,
    ButtonGhost,
} from "../../ui/components/DesignSystem";
import {
    SPACE,
} from "../../ui/styles/dashboardPrimitives";
import { withHexAlpha, V5_COLORS } from "../../ui/tokens";
import { COLORS } from "../../ui/styles/theme";
import type { AnalyticsScope } from "../../core/analytics";

interface AnalyticsTabProps {
    summary: Record<
        "Live" | "Demo" | "Backtest",
        { netProfit: number; countTotal: number; winRatePct: number }
    >;
    liveCyclePerf: { name: string; pnl: number }[];
    cycleMap: Record<string, string>;
    tuition: {
        tuitionR: number;
        rows: { tag: string; costR: number }[];
    };
    analyticsSuggestion: {
        tone: "danger" | "warn" | "neutral" | "success" | string;
        text: string;
    };
    analyticsScope: AnalyticsScope;
    setAnalyticsScope: (scope: AnalyticsScope) => void;
    calendarCells: { dateIso: string; netR: number; count: number }[];
    calendarDays: number;
    calendarMaxAbs: number;
    strategyAttribution: {
        strategyName: string;
        strategyPath?: string;
        count: number;
        netR: number;
    }[];
    analyticsRMultiples: { avg: number; maxAbs: number };
    analyticsRecentLiveTradesAsc: Array<{
        path: string;
        name: string;
        dateIso: string;
        pnl?: number;
    }>;
    analyticsMind: {
        status: string;
        color: string;
        fomo: string;
        tilt: string;
        hesitation: string;
    };
    analyticsTopStrats: { name: string; wr: number; total: number }[];
    openFile: (path: string) => void;
    getDayOfMonth: (dateIso: string) => string;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
    summary,
    liveCyclePerf,
    cycleMap,
    tuition,
    analyticsSuggestion,
    analyticsScope,
    setAnalyticsScope,
    calendarCells,
    calendarDays,
    calendarMaxAbs,
    strategyAttribution,
    analyticsRMultiples,
    analyticsRecentLiveTradesAsc,
    analyticsMind,
    analyticsTopStrats,
    openFile,
    getDayOfMonth,
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
                    {/* Account Overview */}
                    <GlassCard>
                        <div style={{ marginBottom: SPACE.lg }}>
                            <HeadingM>
                                💼 账户资金概览{" "}
                                <span style={{ opacity: 0.5, fontSize: "0.8em", fontWeight: 400 }}>
                                    (Account)
                                </span>
                            </HeadingM>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                                gap: SPACE.md,
                            }}
                        >
                            {(
                                [
                                    {
                                        key: "Live",
                                        label: "🟢 实盘账户",
                                        badge: "Live",
                                        accent: V5_COLORS.live,
                                        stats: summary.Live,
                                    },
                                    {
                                        key: "Demo",
                                        label: "🔵 模拟盘",
                                        badge: "Demo",
                                        accent: V5_COLORS.demo,
                                        stats: summary.Demo,
                                    },
                                    {
                                        key: "Backtest",
                                        label: "🟠 复盘回测",
                                        badge: "Backtest",
                                        accent: V5_COLORS.back,
                                        stats: summary.Backtest,
                                    },
                                ] as const
                            ).map((card) => (
                                <GlassPanel
                                    key={card.key}
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: SPACE.sm,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                        }}
                                    >
                                        <div style={{ fontWeight: 700, color: card.accent }}>
                                            {card.label}
                                        </div>
                                        <StatusBadge label={card.badge} tone="neutral" />
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "baseline",
                                            gap: SPACE.xs,
                                            marginTop: SPACE.xs,
                                        }}
                                    >
                                        <DisplayXL
                                            money
                                            color={
                                                card.stats.netProfit >= 0 ? COLORS.win : COLORS.loss
                                            }
                                        >
                                            {card.stats.netProfit > 0 ? "+" : ""}
                                            {card.stats.netProfit.toFixed(1)}
                                        </DisplayXL>
                                        <span
                                            style={{ color: COLORS.text.muted, fontSize: "0.9em" }}
                                        >
                                            R
                                        </span>
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            gap: SPACE.lg,
                                            color: COLORS.text.muted,
                                            fontSize: "0.85em",
                                        }}
                                    >
                                        <div>📦 {card.stats.countTotal} 笔</div>
                                        <div>🎯 {card.stats.winRatePct}% 胜率</div>
                                    </div>
                                </GlassPanel>
                            ))}
                        </div>
                    </GlassCard>

                    {/* Market Environment */}
                    <GlassCard>
                        <div style={{ marginBottom: SPACE.lg }}>
                            <HeadingM>
                                🌪️ 不同市场环境表现{" "}
                                <span style={{ opacity: 0.5, fontSize: "0.8em", fontWeight: 400 }}>
                                    (Live PnL)
                                </span>
                            </HeadingM>
                        </div>

                        {liveCyclePerf.length === 0 ? (
                            <div
                                style={{
                                    color: COLORS.text.muted,
                                    fontSize: "0.9em",
                                    padding: SPACE.sm,
                                }}
                            >
                                暂无数据
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                                    gap: SPACE.sm,
                                }}
                            >
                                {liveCyclePerf.map((cy) => {
                                    const color =
                                        cy.pnl > 0
                                            ? COLORS.win
                                            : cy.pnl < 0
                                                ? COLORS.loss
                                                : COLORS.text.muted;
                                    return (
                                        <GlassInset
                                            key={cy.name}
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                padding: SPACE.sm,
                                            }}
                                        >
                                            <Label align="center" style={{ marginBottom: SPACE.xs }}>
                                                {cycleMap[cy.name] ?? cy.name}
                                            </Label>
                                            <div
                                                style={{
                                                    fontWeight: 800,
                                                    color,
                                                    fontVariantNumeric: "tabular-nums",
                                                }}
                                            >
                                                {cy.pnl > 0 ? "+" : ""}
                                                {cy.pnl.toFixed(1)}R
                                            </div>
                                        </GlassInset>
                                    );
                                })}
                            </div>
                        )}
                    </GlassCard>

                    {/* Tuition */}
                    <GlassCard>
                        <div style={{ marginBottom: SPACE.lg }}>
                            <HeadingM>
                                💸 错误的代价{" "}
                                <span style={{ opacity: 0.5, fontSize: "0.8em", fontWeight: 400 }}>
                                    (学费统计)
                                </span>
                            </HeadingM>
                        </div>
                        {tuition.tuitionR <= 0 ? (
                            <div
                                style={{
                                    color: COLORS.win,
                                    fontWeight: 700,
                                    padding: SPACE.sm,
                                }}
                            >
                                🎉 完美！近期实盘没有因纪律问题亏损。
                            </div>
                        ) : (
                            <GlassPanel
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: SPACE.md,
                                }}
                            >
                                <div style={{ color: COLORS.text.muted, fontSize: "0.9em" }}>
                                    因执行错误共计亏损：
                                    <span
                                        style={{
                                            color: COLORS.loss,
                                            fontWeight: 900,
                                            marginLeft: "6px",
                                        }}
                                    >
                                        -{tuition.tuitionR.toFixed(1)}R
                                    </span>
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: SPACE.sm,
                                    }}
                                >
                                    {tuition.rows.slice(0, 5).map((row) => {
                                        const pct = Math.round(
                                            (row.costR / tuition.tuitionR) * 100
                                        );
                                        return (
                                            <div
                                                key={row.tag}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: SPACE.md,
                                                    fontSize: "0.9em",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: "110px",
                                                        color: COLORS.text.muted,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                    title={row.tag}
                                                >
                                                    {row.tag}
                                                </div>
                                                <GlassInset
                                                    style={{
                                                        flex: "1 1 auto",
                                                        height: "8px",
                                                        padding: 0,
                                                        borderRadius: "999px",
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: `${pct}%`,
                                                            height: "100%",
                                                            background: COLORS.loss,
                                                        }}
                                                    />
                                                </GlassInset>
                                                <div
                                                    style={{
                                                        width: "70px",
                                                        textAlign: "right",
                                                        color: COLORS.loss,
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
                            </GlassPanel>
                        )}
                    </GlassCard>

                    {/* System Suggestion */}
                    <GlassCard>
                        <div style={{ marginBottom: SPACE.lg }}>
                            <HeadingM>
                                💡 系统建议{" "}
                                <span style={{ opacity: 0.5, fontSize: "0.8em", fontWeight: 400 }}>
                                    (Actions)
                                </span>
                            </HeadingM>
                        </div>
                        <GlassPanel
                            style={{
                                fontSize: "0.95em",
                                lineHeight: 1.6,
                                background:
                                    analyticsSuggestion.tone === "danger"
                                        ? withHexAlpha(V5_COLORS.loss, "1F")
                                        : analyticsSuggestion.tone === "warn"
                                            ? withHexAlpha(V5_COLORS.back, "1F")
                                            : withHexAlpha(V5_COLORS.win, "1A"),
                                border: "1px solid var(--background-modifier-border)",
                                color:
                                    analyticsSuggestion.tone === "danger"
                                        ? V5_COLORS.loss
                                        : analyticsSuggestion.tone === "warn"
                                            ? V5_COLORS.back
                                            : V5_COLORS.win,
                                fontWeight: 600,
                            }}
                        >
                            {analyticsSuggestion.text}
                        </GlassPanel>
                    </GlassCard>

                    {/* Data Analysis Grid */}
                    <GlassCard>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: SPACE.lg,
                            }}
                        >
                            <HeadingM>数据分析</HeadingM>
                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: SPACE.sm,
                                    fontSize: "0.9em",
                                    color: COLORS.text.muted,
                                }}
                            >
                                范围
                                <select
                                    value={analyticsScope}
                                    onChange={(e) =>
                                        setAnalyticsScope(e.target.value as AnalyticsScope)
                                    }
                                    style={{
                                        background: "var(--background-primary)",
                                        border: `1px solid ${COLORS.border}`,
                                        borderRadius: "4px",
                                        color: "var(--text-normal)",
                                        padding: "2px 8px",
                                        fontSize: "inherit",
                                    }}
                                >
                                    <option value="Live">实盘</option>
                                    <option value="Demo">模拟</option>
                                    <option value="Backtest">回测</option>
                                    <option value="All">全部</option>
                                </select>
                            </label>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                                gap: SPACE.xl,
                            }}
                        >
                            {/* Calendar */}
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        fontWeight: 600,
                                        marginBottom: SPACE.md,
                                        color: COLORS.text.muted,
                                        fontSize: "0.9em",
                                    }}
                                >
                                    日历 (最近 {calendarDays} 天)
                                </div>
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(7, 1fr)",
                                        gap: "4px",
                                    }}
                                >
                                    {calendarCells.map((c) => {
                                        const absRatio =
                                            calendarMaxAbs > 0
                                                ? Math.min(1, Math.abs(c.netR) / calendarMaxAbs)
                                                : 0;
                                        const bg =
                                            c.netR > 0
                                                ? withHexAlpha(V5_COLORS.win, "20")
                                                : c.netR < 0
                                                    ? withHexAlpha(V5_COLORS.loss, "20")
                                                    : `rgba(var(--mono-rgb-100), 0.05)`;

                                        return (
                                            <GlassInset
                                                key={`cal-${c.dateIso}`}
                                                style={{
                                                    padding: "4px",
                                                    background: bg,
                                                    minHeight: "44px",
                                                    display: "flex",
                                                    border: `1px solid ${COLORS.border}`,
                                                }}
                                            >
                                                <div
                                                    title={`${c.dateIso} • ${c.count} 笔 • ${c.netR >= 0 ? "+" : ""
                                                        }${c.netR.toFixed(1)}R`}
                                                    style={{
                                                        width: "100%",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        justifyContent: "space-between",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontSize: "0.75em",
                                                            color: COLORS.text.muted,
                                                            textAlign: "left",
                                                        }}
                                                    >
                                                        {getDayOfMonth(c.dateIso)}
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: "0.8em",
                                                            fontWeight: 700,
                                                            color:
                                                                c.netR > 0
                                                                    ? COLORS.win
                                                                    : c.netR < 0
                                                                        ? COLORS.loss
                                                                        : COLORS.text.muted,
                                                            textAlign: "right",
                                                        }}
                                                    >
                                                        {c.count > 0
                                                            ? `${c.netR >= 0 ? "+" : ""}${c.netR.toFixed(1)}`
                                                            : "—"}
                                                    </div>
                                                </div>
                                            </GlassInset>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Attribution */}
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        fontWeight: 600,
                                        marginBottom: SPACE.md,
                                        color: COLORS.text.muted,
                                        fontSize: "0.9em",
                                    }}
                                >
                                    策略归因 (Top)
                                </div>
                                <GlassPanel style={{ padding: SPACE.sm, minHeight: "200px" }}>
                                    {strategyAttribution.length > 0 ? (
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: SPACE.xs,
                                            }}
                                        >
                                            {strategyAttribution.map((r) => (
                                                <div
                                                    key={`attr-${r.strategyName}`}
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        alignItems: "center",
                                                        fontSize: "0.9em",
                                                    }}
                                                >
                                                    {r.strategyPath ? (
                                                        <ButtonGhost
                                                            onClick={() => openFile(r.strategyPath!)}
                                                            style={{
                                                                textAlign: "left",
                                                                justifyContent: "flex-start",
                                                                flex: 1,
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                fontSize: "0.85em",
                                                            }}
                                                        >
                                                            {r.strategyName}
                                                        </ButtonGhost>
                                                    ) : (
                                                        <span
                                                            style={{
                                                                color: COLORS.text.normal,
                                                                padding: "4px 8px",
                                                            }}
                                                        >
                                                            {r.strategyName}
                                                        </span>
                                                    )}
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: SPACE.sm,
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                color: COLORS.text.muted,
                                                                fontSize: "0.9em",
                                                            }}
                                                        >
                                                            {r.count}笔
                                                        </span>
                                                        <span
                                                            style={{
                                                                fontWeight: 600,
                                                                color:
                                                                    r.netR >= 0 ? COLORS.win : COLORS.loss,
                                                                minWidth: "40px",
                                                                textAlign: "right",
                                                                fontVariantNumeric: "tabular-nums",
                                                            }}
                                                        >
                                                            {r.netR >= 0 ? "+" : ""}
                                                            {r.netR.toFixed(1)}R
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                color: COLORS.text.muted,
                                                fontSize: "0.9em",
                                                padding: SPACE.sm,
                                                textAlign: "center",
                                            }}
                                        >
                                            未找到策略归因数据。
                                        </div>
                                    )}
                                </GlassPanel>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Strategy Lab */}
                    <GlassCard>
                        <HeadingM style={{ marginBottom: SPACE.lg }}>Strategy Lab</HeadingM>

                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: SPACE.lg,
                            }}
                        >
                            {/* R-Multiples */}
                            <GlassPanel>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "baseline",
                                        marginBottom: SPACE.md,
                                    }}
                                >
                                    <Label>📈 综合趋势 (R-Multiples)</Label>
                                    <div
                                        style={{ fontSize: "0.85em", color: COLORS.text.muted }}
                                    >
                                        Avg R: {analyticsRMultiples.avg.toFixed(2)}
                                    </div>
                                </div>

                                {/* Chart */}
                                <div
                                    style={{
                                        position: "relative",
                                        height: "90px",
                                        width: "100%",
                                        overflowX: "auto",
                                        background: `rgba(var(--mono-rgb-100), 0.03)`,
                                        borderRadius: "8px",
                                        border: `1px solid ${COLORS.border}`,
                                    }}
                                >
                                    <div
                                        style={{
                                            position: "relative",
                                            height: "90px",
                                            width: `${Math.max(
                                                analyticsRecentLiveTradesAsc.length * 12,
                                                200
                                            )}px`,
                                        }}
                                    >
                                        <div
                                            style={{
                                                position: "absolute",
                                                left: 0,
                                                right: 0,
                                                top: "45px",
                                                height: "1px",
                                                background: `rgba(var(--mono-rgb-100), 0.18)`,
                                                borderTop: `1px dashed rgba(var(--mono-rgb-100), 0.25)`,
                                            }}
                                        />
                                        <div
                                            style={{
                                                position: "absolute",
                                                left: 6,
                                                top: 35,
                                                fontSize: "0.75em",
                                                color: COLORS.text.muted,
                                            }}
                                        >
                                            0R
                                        </div>

                                        {analyticsRecentLiveTradesAsc.length === 0 ? (
                                            <div
                                                style={{
                                                    padding: "18px",
                                                    color: COLORS.text.muted,
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
                                                const rHeight = 90;
                                                const rZeroY = rHeight / 2;
                                                const rScale =
                                                    (rHeight / 2 - 6) /
                                                    Math.max(1e-6, analyticsRMultiples.maxAbs);
                                                let h = Math.abs(r) * rScale;
                                                if (h < 3) h = 3;
                                                const top = r >= 0 ? rZeroY - h : rZeroY;
                                                const color =
                                                    r > 0
                                                        ? COLORS.win
                                                        : r < 0
                                                            ? COLORS.loss
                                                            : COLORS.text.muted;

                                                return (
                                                    <div
                                                        key={`rbar-${t.path}-${t.dateIso}-${i}`}
                                                        title={`${t.dateIso} | ${t.name} | R: ${r.toFixed(
                                                            2
                                                        )}`}
                                                        style={{
                                                            position: "absolute",
                                                            left: `${i * 12}px`,
                                                            top: `${top}px`,
                                                            width: "8px",
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
                            </GlassPanel>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(300px, 1fr))",
                                    gap: SPACE.md,
                                }}
                            >
                                {/* Psychology */}
                                <GlassInset style={{ padding: SPACE.md }}>
                                    <Label style={{ marginBottom: SPACE.sm }}>
                                        🧠 实盘心态
                                    </Label>
                                    <DisplayXL
                                        color={analyticsMind.color}
                                        style={{ fontSize: "1.5rem" }}
                                    >
                                        {analyticsMind.status}
                                    </DisplayXL>
                                    <div
                                        style={{
                                            marginTop: SPACE.sm,
                                            color: COLORS.text.muted,
                                            fontSize: "0.85em",
                                        }}
                                    >
                                        FOMO: {analyticsMind.fomo} | Tilt: {analyticsMind.tilt}{" "}
                                        | 犹豫: {analyticsMind.hesitation}
                                    </div>
                                </GlassInset>

                                {/* Top Strategies */}
                                <GlassPanel>
                                    <Label style={{ marginBottom: SPACE.sm }}>
                                        📊 热门策略
                                    </Label>
                                    {analyticsTopStrats.length === 0 ? (
                                        <div
                                            style={{
                                                color: COLORS.text.muted,
                                                fontSize: "0.9em",
                                            }}
                                        >
                                            暂无数据
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: SPACE.xs,
                                            }}
                                        >
                                            {analyticsTopStrats.map((s) => {
                                                const color =
                                                    s.wr >= 50
                                                        ? COLORS.win
                                                        : s.wr >= 40
                                                            ? COLORS.backtest
                                                            : COLORS.loss; // mapping rough colors using existing vars
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
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: SPACE.sm,
                                                        }}
                                                    >
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div
                                                                style={{
                                                                    fontSize: "0.9em",
                                                                    whiteSpace: "nowrap",
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                    marginBottom: "4px",
                                                                }}
                                                                title={s.name}
                                                            >
                                                                {displayName}
                                                            </div>
                                                            <div
                                                                style={{
                                                                    height: "4px",
                                                                    borderRadius: "999px",
                                                                    background: `rgba(var(--mono-rgb-100), 0.05)`,
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
                                                        <div style={{ textAlign: "right" }}>
                                                            <div
                                                                style={{
                                                                    fontWeight: 700,
                                                                    color,
                                                                    fontSize: "0.9em",
                                                                    fontVariantNumeric: "tabular-nums",
                                                                }}
                                                            >
                                                                {s.wr}%
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: "0.75em",
                                                                    color: COLORS.text.muted,
                                                                }}
                                                            >
                                                                {s.total}笔
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </GlassPanel>
                            </div>
                        </div>
                    </GlassCard>
                </div>
            </div>
        </>
    );
};

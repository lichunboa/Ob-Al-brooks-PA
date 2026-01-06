import * as React from "react";
import {
    GlassCard,
    GlassPanel,
    GlassInset,
    HeadingM,
    ButtonGhost,
} from "../../ui/components/DesignSystem";
import {
    SPACE,
    textButtonNoWrapStyle,
    textButtonStyle,
} from "../../ui/styles/dashboardPrimitives";
import { V5_COLORS } from "../../ui/tokens";
import { StrategyStats } from "../components/StrategyStats";
import { StrategyListFinal as StrategyList } from "../components/StrategyListFinal";

import type { StrategyIndex } from "../../core/strategy-index";
import { matchStrategies } from "../../core/strategy-matcher";
import type { CourseSnapshot } from "../../core/course";

// Types
interface EnrichedCourse extends CourseSnapshot {
    title?: string;
    path?: string;
    progress: CourseSnapshot["progress"] & { percent: number };
}

export interface LearnTabProps {
    strategies: any[]; // Strategy[]
    syllabuses?: EnrichedCourse[];
    strategyStats: {
        total: number;
        activeCount: number;
        learningCount: number;
        totalUses: number;
    };
    todayMarketCycle?: string;
    strategyIndex?: StrategyIndex;
    openFile: (path: string) => void;
    strategyPerf: Map<string, any>; // StrategyPerformance
    playbookPerfRows: Array<{
        canonical: string;
        path?: string;
        total: number;
        wins: number;
        pnl: number;
        winRate: number;
    }>;
    recommendationWindow?: number;
}

export const LearnTab: React.FC<LearnTabProps> = ({
    strategies,
    syllabuses = [],
    strategyStats,
    todayMarketCycle,
    strategyIndex,
    openFile,
    strategyPerf,
    playbookPerfRows,
    recommendationWindow = 3,
}) => {
    const [activeFilter, setActiveFilter] = React.useState<string>("all");

    // Filter Logic
    const filteredStrategies = React.useMemo(() => {
        if (activeFilter === "all") return strategies;

        const isActive = (s: any) => {
            const raw = typeof s.statusRaw === "string" ? s.statusRaw : "";
            return raw.includes("实战") || raw.toLowerCase().includes("active");
        };

        const isLearning = (s: any) => {
            const raw = typeof s.statusRaw === "string" ? s.statusRaw : "";
            // If not active, assume learning if explicitly marked or just fallback
            // Reuse StrategyList logic: empty = learning
            if (isActive(s)) return false;
            return true;
            // Ideally strictly match: learn, study, read, 学习, or empty
        };

        return strategies.filter(s => {
            if (activeFilter === "active") return isActive(s);
            if (activeFilter === "learning") return isLearning(s);
            if (activeFilter === "uses") return (strategyPerf.get(s.canonicalName)?.total ?? 0) > 0;
            return true;
        });
    }, [strategies, activeFilter, strategyPerf]);

    // Helper Styles
    const onTextBtnMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = "rgba(var(--mono-rgb-100), 0.05)";
    };
    const onTextBtnMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = "transparent";
    };
    const onTextBtnFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
        // focus style if needed
    };
    const onTextBtnBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
        // blur style
    };

    // Mini Cell Handlers
    const onMiniCellMouseEnter = React.useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            if (e.currentTarget.disabled) return;
            e.currentTarget.style.borderColor = "var(--interactive-accent)";
        },
        []
    );

    const onMiniCellMouseLeave = React.useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.borderColor = "var(--background-modifier-border)";
        },
        []
    );

    const onMiniCellFocus = React.useCallback(
        (e: React.FocusEvent<HTMLButtonElement>) => {
            if (e.currentTarget.disabled) return;
            e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";
        },
        []
    );

    const onMiniCellBlur = React.useCallback(
        (e: React.FocusEvent<HTMLButtonElement>) => {
            e.currentTarget.style.boxShadow = "none";
        },
        []
    );


    return (
        <>
            <div style={{ marginBottom: SPACE.xl }}>
                <HeadingM>
                    🎓 学习中心
                    <span
                        style={{
                            fontSize: "0.85em",
                            color: "var(--text-muted)",
                            fontWeight: "normal",
                            marginLeft: "8px",
                        }}
                    >
                        学习中心 (Learning Center)
                    </span>
                </HeadingM>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "20px",
                }}
            >
                {/* Course Syllabus */}
                <div>
                    <GlassCard style={{ marginBottom: "16px", height: "100%" }}>
                        <HeadingM style={{ marginBottom: "10px" }}>
                            课程进度
                            <span
                                style={{
                                    color: "var(--text-muted)",
                                    fontSize: "0.9em",
                                    fontWeight: "normal",
                                    marginLeft: "8px",
                                }}
                            >
                                (Syllabus)
                            </span>
                        </HeadingM>

                        {syllabuses.length > 0 ? (
                            <div style={{ display: "grid", gap: "10px" }}>
                                {syllabuses.map((course) => (
                                    <div key={course.path}>
                                        <details open>
                                            <summary
                                                style={{
                                                    cursor: "pointer",
                                                    fontWeight: 600,
                                                    marginBottom: "8px",
                                                }}
                                            >
                                                {course.title || "Unknown Course"}
                                            </summary>

                                            {/* Top Summary Stats */}
                                            {(() => {
                                                const link = course.path ? { path: course.path } : undefined;
                                                return (
                                                    <div
                                                        style={{
                                                            padding: "8px 12px",
                                                            background: "rgba(var(--mono-rgb-100), 0.03)",
                                                            borderRadius: "8px",
                                                            marginBottom: "12px",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            fontSize: "0.9em",
                                                        }}
                                                    >
                                                        <div style={{ display: "flex", gap: "16px" }}>
                                                            <span>
                                                                进度:{" "}
                                                                <strong>
                                                                    {course.progress.percent.toFixed(0)}%
                                                                </strong>
                                                            </span>
                                                            <span style={{ color: "var(--text-muted)" }}>|</span>
                                                            <span>
                                                                已完成:{" "}
                                                                <strong>
                                                                    {course.progress.doneCount}/
                                                                    {course.progress.totalCount}
                                                                </strong>
                                                            </span>
                                                            <span>
                                                                笔记:{" "}
                                                                <strong>{link ? "已创建" : "未创建"}</strong>
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Up Next Recommendation */}
                                            {course.upNext.length > 0 && (
                                                <div
                                                    style={{
                                                        color: "var(--text-muted)",
                                                        fontSize: "0.9em",
                                                        marginBottom: "8px",
                                                    }}
                                                >
                                                    接下来（窗口={recommendationWindow}）：{" "}
                                                    {course.upNext.map((x: any, idx: number) => {
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

                                            <div
                                                style={{
                                                    marginTop: "12px",
                                                    display: "grid",
                                                    gridTemplateColumns: "1fr 1fr",
                                                    gap: "20px",
                                                }}
                                            >
                                                {course.phases.map((ph) => (
                                                    <div
                                                        key={`ph-${ph.phase}`}
                                                        style={{ marginBottom: "12px" }}
                                                    >
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
                                                            style={{
                                                                display: "flex",
                                                                flexWrap: "wrap",
                                                                gap: "6px",
                                                            }}
                                                        >
                                                            {ph.items.map((c) => {
                                                                const bg = c.isDone
                                                                    ? V5_COLORS.win
                                                                    : c.hasNote
                                                                        ? V5_COLORS.accent
                                                                        : "rgba(var(--mono-rgb-100), 0.06)";
                                                                const fg = c.isDone
                                                                    ? "var(--background-primary)"
                                                                    : c.hasNote
                                                                        ? "var(--background-primary)"
                                                                        : "var(--text-faint)";
                                                                const title = `${c.item.id}: ${String(
                                                                    c.item.t ?? ""
                                                                )}`;
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
                                ))}
                            </div>
                        ) : (
                            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                                课程数据不可用。请检查 PA_Syllabus_Data.md 与 #PA/Course
                                相关笔记。
                            </div>
                        )}
                    </GlassCard>
                </div>

                {/* Strategy Repository */}
                <div>
                    <GlassCard style={{ marginBottom: "16px" }}>
                        <HeadingM style={{ marginBottom: "10px" }}>
                            策略仓库
                            <span
                                style={{
                                    color: "var(--text-muted)",
                                    fontSize: "0.9em",
                                    fontWeight: "normal",
                                    marginLeft: "8px",
                                }}
                            >
                                （作战手册/Playbook）
                            </span>
                        </HeadingM>

                        <div style={{ marginBottom: "10px" }}>
                            <StrategyStats
                                total={strategyStats.total}
                                activeCount={strategyStats.activeCount}
                                learningCount={strategyStats.learningCount}
                                totalUses={strategyStats.totalUses}
                                activeFilter={activeFilter}
                                onFilter={(f) => setActiveFilter(f)}
                            />
                        </div>

                        {(() => {
                            const cycle = (todayMarketCycle ?? "").trim();
                            if (!cycle) {
                                return (
                                    <GlassInset
                                        style={{
                                            margin: "-6px 0 10px 0",
                                            padding: "10px 12px",
                                            color: "var(--text-faint)",
                                            fontSize: "0.9em",
                                        }}
                                    >
                                        今日市场周期未设置（可在 交易/Trading 里补充）。
                                    </GlassInset>
                                );
                            }

                            const isActive = (statusRaw: unknown) => {
                                const s =
                                    typeof statusRaw === "string" ? statusRaw.trim() : "";
                                if (!s) return false;
                                return (
                                    s.includes("实战") || s.toLowerCase().includes("active")
                                );
                            };

                            const picks = matchStrategies(strategyIndex, {
                                marketCycle: cycle,
                                limit: 6,
                            }).filter((s) => isActive((s as any).statusRaw));

                            return (
                                <GlassInset
                                    style={{
                                        margin: "-6px 0 10px 0",
                                        padding: "10px 12px",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontWeight: 700,
                                            opacity: 0.75,
                                            marginBottom: 6,
                                        }}
                                    >
                                        🌊 今日市场周期：{" "}
                                        <span
                                            style={{
                                                color: "var(--text-accent)",
                                                fontWeight: 800,
                                            }}
                                        >
                                            {cycle}
                                        </span>
                                    </div>
                                    <div
                                        style={{ fontSize: "0.85em", color: "var(--text-muted)" }}
                                    >
                                        {picks.length > 0 ? (
                                            <>
                                                推荐优先关注：{" "}
                                                {picks.map((s, idx) => (
                                                    <React.Fragment key={`pb-pick-${s.path}`}>
                                                        {idx > 0 ? " · " : ""}
                                                        <button
                                                            type="button"
                                                            onClick={() => openFile(s.path)}
                                                            style={textButtonNoWrapStyle}
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
                                </GlassInset>
                            );
                        })()}

                        <div style={{ marginTop: "10px" }}>
                            {/* Unified Strategy List (New Design) */}
                            <StrategyList
                                strategies={filteredStrategies}
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
                            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                                <ButtonGhost
                                    onClick={() =>
                                        openFile(
                                            "策略仓库 (Strategy Repository)/太妃方案/太妃方案.md"
                                        )
                                    }
                                >
                                    📚 作战手册（Brooks Playbook）
                                </ButtonGhost>

                                <span
                                    style={{
                                        padding: "4px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--background-modifier-border)",
                                        background: "rgba(var(--mono-rgb-100), 0.03)",
                                        color: "var(--text-muted)",
                                        fontSize: "0.85em",
                                        fontWeight: 700,
                                        display: "inline-flex",
                                        alignItems: "center",
                                    }}
                                >
                                    📖 Al Brooks经典（即将推出）
                                </span>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Performance */}
                    <GlassCard style={{ marginTop: "20px" }}>
                        <HeadingM style={{ opacity: 0.7, marginBottom: "10px" }}>
                            🏆 实战表现 (Performance)
                        </HeadingM>

                        {playbookPerfRows.length === 0 ? (
                            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                                暂无可用的策略表现统计（需要交易记录与策略归因）。
                            </div>
                        ) : (
                            <GlassInset
                                style={{
                                    overflow: "hidden",
                                    padding: 0,
                                }}
                            >
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 72px 88px 60px",
                                        gap: "0px",
                                        padding: "8px 10px",
                                        borderBottom:
                                            "1px solid var(--background-modifier-border)",
                                        color: "var(--text-muted)",
                                        fontSize: "0.85em",
                                        fontWeight: 700,
                                        background: "rgba(var(--mono-rgb-100), 0.02)",
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
                                            ? V5_COLORS.win
                                            : r.pnl < 0
                                                ? V5_COLORS.loss
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
                                                style={{
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {r.path ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openFile(r.path!)}
                                                        style={{
                                                            ...textButtonStyle,
                                                            textAlign: "left",
                                                            padding: 0,
                                                        }}
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
                            </GlassInset>
                        )}
                    </GlassCard>
                </div>
            </div>
        </>
    );
};

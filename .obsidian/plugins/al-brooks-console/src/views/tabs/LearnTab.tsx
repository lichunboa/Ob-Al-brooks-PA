import * as React from "react";
import { HeadingM, GlassCard, GlassPanel, ButtonGhost, GlassInset, DisplayXL, StatusBadge } from "../../ui/components/DesignSystem";
import { SPACE } from "../../ui/styles/theme";
import { V5_COLORS } from "../../ui/tokens";
import { textButtonNoWrapStyle, textButtonStyle } from "../../ui/styles/dashboardPrimitives";
import { StrategyStats } from "../components";
import { StrategyList } from "../components/StrategyList";
import { matchStrategies } from "../../core/strategy-matcher";
import { StrategyIndex } from "../../core/strategy-index";
import { CourseSnapshot } from "../../core/course";
import { AlBrooksConsoleSettings } from "../../settings";

export interface LearnTabProps {
    course: CourseSnapshot;
    settings: AlBrooksConsoleSettings;
    todayMarketCycle?: string;
    strategyStats: {
        total: number;
        activeCount: number;
        learningCount: number;
        totalUses: number
    };
    strategies: any[];
    strategyPerf: Map<string, any>;
    playbookPerfRows: Array<{
        canonical: string;
        path?: string;
        total: number;
        wins: number;
        pnl: number;
        winRate: number;
    }>;
    strategyIndex: StrategyIndex;
    openFile: (path: string) => void;
    // Event handlers
    onTextBtnMouseEnter: (e: React.MouseEvent) => void;
    onTextBtnMouseLeave: (e: React.MouseEvent) => void;
    onTextBtnFocus: (e: React.FocusEvent) => void;
    onTextBtnBlur: (e: React.FocusEvent) => void;
    onMiniCellMouseEnter: (e: React.MouseEvent) => void;
    onMiniCellMouseLeave: (e: React.MouseEvent) => void;
    onMiniCellFocus: (e: React.FocusEvent) => void;
    onMiniCellBlur: (e: React.FocusEvent) => void;
}

export const LearnTab: React.FC<LearnTabProps> = ({
    course,
    settings,
    todayMarketCycle,
    strategyStats,
    strategies,
    strategyPerf,
    playbookPerfRows,
    strategyIndex,
    openFile,
    onTextBtnMouseEnter,
    onTextBtnMouseLeave,
    onTextBtnFocus,
    onTextBtnBlur,
    onMiniCellMouseEnter,
    onMiniCellMouseLeave,
    onMiniCellFocus,
    onMiniCellBlur,
}) => {
    return (
        <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                {/* Left Column: Course Progress */}
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {/* Main Course Progress Card */}
                    <GlassCard>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                            <HeadingM>系统化训练 (Training)</HeadingM>
                            {course.progress.totalCount > 0 && (
                                <StatusBadge
                                    label={`${course.progress.doneCount}/${course.progress.totalCount}`}
                                    color={course.progress.doneCount === course.progress.totalCount ? "win" : "neutral"}
                                />
                            )}
                        </div>

                        {course.current.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                {(() => {
                                    const rec = course.current[0]; // Primary focus
                                    const link = rec.link;
                                    const prefix = rec.data.id;
                                    return (
                                        <div style={{ padding: "12px", background: "rgba(var(--mono-rgb-100), 0.02)", borderRadius: "8px", border: "1px solid var(--background-modifier-border)" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div style={{ fontWeight: 600, fontSize: "1.05em" }}>
                                                    {link ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openFile(link.path)}
                                                            style={{ ...textButtonNoWrapStyle, fontWeight: 700 }}
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
                                                <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-monospace)", whiteSpace: "nowrap" }}>
                                                    {rec.data.id}
                                                </div>
                                            </div>
                                            <div style={{ marginTop: "6px", color: "var(--text-muted)", fontSize: "0.85em", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                                                <span>章节: <strong>{String(rec.data.p ?? "—")}</strong></span>
                                                <span>进度: <strong>{course.progress.doneCount}/{course.progress.totalCount}</strong></span>
                                                <span>笔记: <strong>{link ? "已创建" : "未创建"}</strong></span>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {course.upNext.length > 0 && (
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.9em", marginBottom: "8px" }}>
                                        接下来（窗口={settings.courseRecommendationWindow}）：{" "}
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
                                                    <span style={{ color: "var(--text-faint)" }}>{label}</span>
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                )}

                                <details>
                                    <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "0.9em", userSelect: "none" }}>
                                        展开课程矩阵
                                    </summary>
                                    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                                        {course.phases.map((ph: any) => (
                                            <div key={`ph-${ph.phase}`} style={{ marginBottom: "12px" }}>
                                                <div style={{ fontSize: "0.85em", color: "var(--text-muted)", marginBottom: "6px", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "4px" }}>
                                                    {ph.phase}
                                                </div>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                                    {ph.items.map((c: any) => {
                                                        const bg = c.isDone ? V5_COLORS.win : c.hasNote ? V5_COLORS.accent : "rgba(var(--mono-rgb-100), 0.06)";
                                                        const fg = c.isDone ? "var(--background-primary)" : c.hasNote ? "var(--background-primary)" : "var(--text-faint)";
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
                                                                    border: "1px solid var(--background-modifier-border)",
                                                                    background: bg,
                                                                    cursor: c.link ? "pointer" : "default",
                                                                    opacity: c.link ? 1 : 0.75,
                                                                    outline: "none",
                                                                    transition: "border-color 180ms ease, box-shadow 180ms ease",
                                                                }}
                                                            >
                                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", color: fg, fontSize: "0.65em", fontWeight: 700, letterSpacing: "-0.3px" }}>
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
                    </GlassCard>
                </div>

                {/* Right Column: Strategy Repository (Playbook) */}
                <GlassCard style={{ marginBottom: "16px" }}>
                    <HeadingM style={{ marginBottom: "10px" }}>
                        策略仓库
                        <span style={{ color: "var(--text-muted)", fontSize: "0.9em", fontWeight: "normal" }}>
                            {" "}（作战手册/Playbook）
                        </span>
                    </HeadingM>

                    <div style={{ marginBottom: "10px" }}>
                        <StrategyStats
                            total={strategyStats.total}
                            activeCount={strategyStats.activeCount}
                            learningCount={strategyStats.learningCount}
                            totalUses={strategyStats.totalUses}
                            onFilter={(f: string) => { console.log("策略过滤：", f); }}
                        />
                    </div>

                    {(() => {
                        const cycle = (todayMarketCycle ?? "").trim();
                        if (!cycle) {
                            return (
                                <GlassInset style={{ margin: "-6px 0 10px 0", padding: "10px 12px", color: "var(--text-faint)", fontSize: "0.9em" }}>
                                    今日市场周期未设置（可在 今日/Today 里补充）。
                                </GlassInset>
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
                            <GlassInset style={{ margin: "-6px 0 10px 0", padding: "10px 12px" }}>
                                <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: 6 }}>
                                    🌊 今日市场周期： <span style={{ color: "var(--text-accent)", fontWeight: 800 }}>{cycle}</span>
                                </div>
                                <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
                                    {picks.length > 0 ? (
                                        <>
                                            推荐优先关注：{" "}
                                            {picks.map((s: any, idx: number) => (
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
                        <StrategyList
                            strategies={strategies}
                            onOpenFile={openFile}
                            perf={strategyPerf}
                            showTitle={false}
                            showControls={false}
                        />
                    </div>

                    <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--background-modifier-border)" }}>
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                            <ButtonGhost onClick={() => openFile("策略仓库 (Strategy Repository)/太妃方案/太妃方案.md")}>
                                📚 作战手册（Brooks Playbook）
                            </ButtonGhost>
                            <span style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--background-modifier-border)", background: "rgba(var(--mono-rgb-100), 0.03)", color: "var(--text-muted)", fontSize: "0.85em", fontWeight: 700, display: "inline-flex", alignItems: "center" }}>
                                📖 Al Brooks经典（即将推出）
                            </span>
                        </div>
                    </div>
                </GlassCard>
            </div>

            <GlassCard style={{ marginTop: "20px" }}>
                <HeadingM style={{ opacity: 0.7, marginBottom: "10px" }}>
                    🏆 实战表现 (Performance)
                </HeadingM>

                {playbookPerfRows.length === 0 ? (
                    <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                        暂无可用的策略表现统计（需要交易记录与策略归因）。
                    </div>
                ) : (
                    <GlassInset style={{ overflow: "hidden", padding: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 88px 60px", gap: "0px", padding: "8px 10px", borderBottom: "1px solid var(--background-modifier-border)", color: "var(--text-muted)", fontSize: "0.85em", fontWeight: 700, background: "rgba(var(--mono-rgb-100), 0.02)" }}>
                            <div>策略</div>
                            <div>胜率</div>
                            <div>盈亏</div>
                            <div>次数</div>
                        </div>


                        {playbookPerfRows.map((r: any) => {
                            const pnlColor = r.pnl > 0 ? V5_COLORS.win : r.pnl < 0 ? V5_COLORS.loss : "var(--text-muted)";
                            return (
                                <div key={`pb-perf-${r.canonical}`} style={{ display: "grid", gridTemplateColumns: "1fr 72px 88px 60px", padding: "8px 10px", borderBottom: "1px solid var(--background-modifier-border)", fontSize: "0.9em", alignItems: "center" }}>
                                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {r.path ? (
                                            <button
                                                type="button"
                                                onClick={() => openFile(r.path!)}
                                                style={{ ...textButtonStyle, textAlign: "left", padding: 0 }}
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
                                    <div style={{ fontVariantNumeric: "tabular-nums" }}>{r.winRate}%</div>
                                    <div style={{ color: pnlColor, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                                        {r.pnl > 0 ? "+" : ""}{Math.round(r.pnl)}
                                    </div>
                                    <div style={{ fontVariantNumeric: "tabular-nums" }}>{r.total}</div>
                                </div>
                            );
                        })}
                    </GlassInset>
                )}
            </GlassCard >
        </>
    );
};

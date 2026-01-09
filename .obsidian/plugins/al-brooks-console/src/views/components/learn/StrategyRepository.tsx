import * as React from "react";
import { StrategyStats } from "../strategy/StrategyStats";
import { StrategyList } from "../strategy/StrategyList";
import { PlaybookPerformance } from "./PlaybookPerformance";
import { matchStrategies } from "../../../core/strategy-matcher";
import type { StrategyIndex } from "../../../core/strategy-index";

/**
 * StrategyRepository Props接口
 */
export interface StrategyRepositoryProps {
    // 数据Props
    strategyStats: any;
    strategyIndex: StrategyIndex;
    strategies: any[];
    strategyPerf: any;
    playbookPerfRows: any[];
    todayMarketCycle: string;

    // 函数Props
    openFile: (path: string) => void;
    isActive: (statusRaw: string) => boolean;

    // 样式Props
    textButtonStyle: React.CSSProperties;
    textButtonNoWrapStyle: React.CSSProperties;

    // 事件处理Props
    onTextBtnMouseEnter: (e: React.MouseEvent) => void;
    onTextBtnMouseLeave: (e: React.MouseEvent) => void;
    onTextBtnFocus: (e: React.FocusEvent) => void;
    onTextBtnBlur: (e: React.FocusEvent) => void;

    // 常量Props
    V5_COLORS: any;
}

/**
 * 策略仓库组件
 * 显示策略统计、今日推荐、策略列表和作战手册表现
 */
export const StrategyRepository: React.FC<StrategyRepositoryProps> = ({
    strategyStats,
    strategyIndex,
    strategies,
    strategyPerf,
    playbookPerfRows,
    todayMarketCycle,
    openFile,
    isActive,
    textButtonStyle,
    textButtonNoWrapStyle,
    onTextBtnMouseEnter,
    onTextBtnMouseLeave,
    onTextBtnFocus,
    onTextBtnBlur,
    V5_COLORS,
}) => {
    return (
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
                        <div
                            style={{ fontWeight: 700, opacity: 0.75, marginBottom: 6 }}
                        >
                            🌊 今日市场周期:{" "}
                            <span
                                style={{ color: "var(--text-accent)", fontWeight: 800 }}
                            >
                                {cycle}
                            </span>
                        </div>
                        <div
                            style={{ fontSize: "0.85em", color: "var(--text-muted)" }}
                        >
                            {picks.length > 0 ? (
                                <>
                                    推荐优先关注:{" "}
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

            <PlaybookPerformance
                playbookPerfRows={playbookPerfRows}
                openFile={openFile}
                textButtonStyle={textButtonStyle}
                onTextBtnMouseEnter={onTextBtnMouseEnter}
                onTextBtnMouseLeave={onTextBtnMouseLeave}
                onTextBtnFocus={onTextBtnFocus}
                onTextBtnBlur={onTextBtnBlur}
                V5_COLORS={V5_COLORS}
            />
        </div>
    );
};

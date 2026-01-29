import * as React from "react";

/**
 * 进度曲线 Props（优化版）
 */
export interface ProgressChartProps {
    // 总卡片数
    totalCards: number;
    // 已复习卡片数
    reviewedCards: number;
    // 到期卡片数
    dueCards: number;
    // 7天负载
    load7d: number;
    style?: React.CSSProperties;
}

/**
 * 进度曲线组件 - 优化版
 * 显示学习进度而非掌握度，更有激励作用
 */
export const ProgressChart: React.FC<ProgressChartProps> = ({
    totalCards,
    reviewedCards,
    dueCards,
    load7d,
    style,
}) => {
    // 学习进度（已复习/总数）
    const learningProgress = totalCards > 0
        ? Math.round((reviewedCards / totalCards) * 100)
        : 0;

    // 获取进度等级
    const getProgressLevel = (pct: number) => {
        if (pct >= 90) return { label: "完成", color: "#22c55e", emoji: "🏆" };
        if (pct >= 70) return { label: "进阶", color: "#3b82f6", emoji: "⭐" };
        if (pct >= 50) return { label: "过半", color: "#f59e0b", emoji: "📈" };
        if (pct >= 20) return { label: "学习中", color: "#f97316", emoji: "📚" };
        return { label: "起步", color: "#8b5cf6", emoji: "🚀" };
    };

    const level = getProgressLevel(learningProgress);

    // 今日状态
    const getTodayStatus = () => {
        if (dueCards === 0) return { label: "已完成", color: "#22c55e", emoji: "✅" };
        if (dueCards <= 5) return { label: "轻松", color: "#3b82f6", emoji: "💪" };
        if (dueCards <= 15) return { label: "适中", color: "#f59e0b", emoji: "📖" };
        return { label: "繁忙", color: "#ef4444", emoji: "🔥" };
    };

    const todayStatus = getTodayStatus();

    return (
        <div
            style={{
                padding: "12px",
                background: "var(--background-secondary)",
                borderRadius: "8px",
                ...style,
            }}
        >
            {/* 标题 */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
            }}>
                <div style={{ fontWeight: 600, fontSize: "0.9em" }}>
                    📚 学习进度
                </div>
                <div style={{
                    fontSize: "0.75em",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: `${level.color}20`,
                    color: level.color,
                    fontWeight: 600,
                }}>
                    {level.emoji} {level.label}
                </div>
            </div>

            {/* 学习进度条 */}
            <div style={{ marginBottom: "12px" }}>
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                    fontSize: "0.75em",
                    color: "var(--text-muted)",
                }}>
                    <span>已学习 <strong style={{ color: "var(--text-normal)" }}>{reviewedCards}</strong> / {totalCards} 张</span>
                    <span style={{ fontWeight: 700, color: level.color }}>{learningProgress}%</span>
                </div>
                <div style={{
                    height: "8px",
                    background: "var(--background-modifier-border)",
                    borderRadius: "4px",
                    overflow: "hidden",
                }}>
                    <div style={{
                        width: `${learningProgress}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, ${level.color}80, ${level.color})`,
                        borderRadius: "4px",
                        transition: "width 0.5s ease",
                    }} />
                </div>
            </div>

            {/* 今日状态 */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 10px",
                background: `${todayStatus.color}10`,
                borderRadius: "6px",
                border: `1px solid ${todayStatus.color}20`,
            }}>
                <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>
                    今日任务
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {dueCards > 0 ? (
                        <span style={{
                            fontSize: "0.9em",
                            fontWeight: 700,
                            color: todayStatus.color
                        }}>
                            {dueCards} 张待复习
                        </span>
                    ) : (
                        <span style={{
                            fontSize: "0.9em",
                            fontWeight: 600,
                            color: "#22c55e"
                        }}>
                            {todayStatus.emoji} 今日已完成！
                        </span>
                    )}
                </div>
            </div>

            {/* 7日负载指示器 */}
            {load7d > 0 && (
                <div style={{
                    marginTop: "8px",
                    fontSize: "0.7em",
                    color: "var(--text-faint)",
                    textAlign: "center",
                }}>
                    未来7天: {load7d} 张
                </div>
            )}
        </div>
    );
};

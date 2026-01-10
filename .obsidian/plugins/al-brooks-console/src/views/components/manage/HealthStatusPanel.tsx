import * as React from "react";
import { Card } from "../../../ui/components/Card";

/**
 * 健康状态面板组件
 * 显示系统健康分数、问题统计和系统诊断信息
 */

interface HealthStatusPanelProps {
    // 数据Props
    schemaIssues: any[];
    paTagSnapshot: any;
    trades: any[];
    enumPresets: any;
    schemaScanNote: string;

    // 样式Props
    V5_COLORS: any;
    SPACE: any;
}

export const HealthStatusPanel: React.FC<HealthStatusPanelProps> = ({
    schemaIssues,
    paTagSnapshot,
    trades,
    enumPresets,
    schemaScanNote,
    V5_COLORS,
    SPACE,
}) => {
    // 计算健康分数
    const issueCount = schemaIssues.length;
    const healthScore = Math.max(0, 100 - issueCount * 5);
    const healthColor =
        healthScore > 90
            ? V5_COLORS.win
            : healthScore > 60
                ? V5_COLORS.back
                : V5_COLORS.loss;

    // 计算文件和标签数量
    const files = paTagSnapshot?.files ?? 0;
    const tags = paTagSnapshot
        ? Object.keys(paTagSnapshot.tagMap).length
        : 0;

    // 按类型统计问题
    const issueByType = new Map<string, number>();
    for (const it of schemaIssues) {
        const k = (it.type ?? "未知").toString();
        issueByType.set(k, (issueByType.get(k) ?? 0) + 1);
    }
    const topTypes = [...issueByType.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    return (
        <div style={{ marginBottom: SPACE.md }}>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: SPACE.md,
                    marginBottom: SPACE.md,
                }}
            >
                {/* 系统健康度卡片 */}
                <Card variant="subtle-tight" style={{ flex: 1 }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: SPACE.md,
                            marginBottom: SPACE.sm,
                        }}
                    >
                        <div style={{ fontWeight: 800, color: healthColor }}>
                            ❤️ 系统健康度：{healthScore}
                        </div>
                        <div style={{ color: "var(--text-muted)" }}>
                            待修异常：{issueCount}
                        </div>
                    </div>

                    {topTypes.length ? (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: `${SPACE.xs} ${SPACE.xl}`,
                                fontSize: "0.9em",
                            }}
                        >
                            {topTypes.map(([t, c]) => (
                                <div
                                    key={t}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: SPACE.md,
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    <span
                                        style={{
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                        title={t}
                                    >
                                        {t}
                                    </span>
                                    <span
                                        style={{
                                            fontVariantNumeric: "tabular-nums",
                                        }}
                                    >
                                        {c}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: V5_COLORS.win }}>
                            ✅ 系统非常健康（All Clear）
                        </div>
                    )}
                </Card>

                {/* 系统诊断卡片 */}
                <Card variant="subtle-tight" style={{ flex: 1 }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: SPACE.md,
                            marginBottom: SPACE.sm,
                        }}
                    >
                        <div style={{ fontWeight: 800 }}>🧠 系统诊断</div>
                        <div style={{ color: "var(--text-muted)" }}>
                            {schemaScanNote ? "已扫描" : "未扫描"}
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: `${SPACE.xs} ${SPACE.xl}`,
                            fontSize: "0.9em",
                            color: "var(--text-muted)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: SPACE.md,
                            }}
                        >
                            <span>枚举预设</span>
                            <span>{enumPresets ? "✅ 已加载" : "—"}</span>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: SPACE.md,
                            }}
                        >
                            <span>标签扫描</span>
                            <span>{paTagSnapshot ? "✅ 正常" : "—"}</span>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: SPACE.md,
                            }}
                        >
                            <span>交易记录</span>
                            <span>{trades.length}</span>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "10px",
                            }}
                        >
                            <span>笔记档案</span>
                            <span>{files}</span>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "10px",
                            }}
                        >
                            <span>标签总数</span>
                            <span>{tags}</span>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "10px",
                            }}
                        >
                            <span>属性管理器</span>
                            <span>✅ 可用</span>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

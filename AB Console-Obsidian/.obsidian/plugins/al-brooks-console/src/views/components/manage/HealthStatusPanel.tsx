import { App } from "obsidian";
import * as React from "react";
import { Card } from "../../../ui/components/Card";
import { Button } from "../../../ui/components/Button";
import { MetadataDoctor, DiagnosisReport } from "../../../services/metadata-doctor";

/**
 * 健康状态面板组件
 * 显示系统健康分数、问题统计和系统诊断信息
 * [Merge Update]: Integrated MetadataDoctor for auto-fix capabilities.
 */

interface HealthStatusPanelProps {
    // 数据Props
    schemaIssues: any[];
    paTagSnapshot: any;
    trades: any[];
    enumPresets: any;
    schemaScanNote: string;
    app: App; // [New]: Required for DoctorService

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
    app,
    V5_COLORS,
    SPACE,
}) => {
    // --- Doctor Logic Integration ---
    const [scanning, setScanning] = React.useState(false);
    const [reports, setReports] = React.useState<DiagnosisReport[]>([]);
    const [fixedCount, setFixedCount] = React.useState(0);
    const doctor = React.useMemo(() => new MetadataDoctor(app), [app]);

    const handleScan = async () => {
        setScanning(true);
        setFixedCount(0);
        try {
            const results = await doctor.scan();
            setReports(results);
        } finally {
            setScanning(false);
        }
    };

    const handleFixAll = async () => {
        if (reports.length === 0) return;
        setScanning(true);
        try {
            await doctor.fixAll(reports);
            setFixedCount(reports.length);
            setReports([]);
        } finally {
            setScanning(false);
        }
    };
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

                {/* 系统诊断卡片 (Existing) */}
                <Card variant="subtle-tight" style={{ flex: 1 }}>
                    {/* ... Existing diagnostics content ... */}
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
                            marginBottom: SPACE.md,
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}>
                            <span>枚举预设</span>
                            <span>{enumPresets ? "✅ 已加载" : "—"}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}>
                            <span>标签扫描</span>
                            <span>{paTagSnapshot ? "✅ 正常" : "—"}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}>
                            <span>交易记录</span>
                            <span>{trades.length}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                            <span>笔记档案</span>
                            <span>{files}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                            <span>标签总数</span>
                            <span>{tags}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                            <span>属性管理器</span>
                            <span>✅ 可用</span>
                        </div>
                    </div>

                    {/* [Merged]: Metadata Doctor Controls */}
                    <div style={{ borderTop: "1px solid var(--background-modifier-border)", paddingTop: SPACE.md, marginTop: SPACE.sm }}>
                        <div style={{ fontWeight: 700, marginBottom: SPACE.xs, fontSize: "0.9em", color: "var(--text-normal)" }}>
                            🩺 元数据医生 (Metadata Doctor)
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: reports.length > 0 ? "8px" : "0" }}>
                            <Button onClick={handleScan} disabled={scanning} variant="small">
                                {scanning ? "诊断中..." : "开始诊断"}
                            </Button>
                            {reports.length > 0 && (
                                <Button onClick={handleFixAll} disabled={scanning} variant="small" style={{ backgroundColor: V5_COLORS.accent, color: "white" }}>
                                    💉 修复 ({reports.length})
                                </Button>
                            )}
                            {fixedCount > 0 && !scanning && (
                                <span style={{ fontSize: "0.85em", color: V5_COLORS.win }}>✅ 已修复 {fixedCount}</span>
                            )}
                        </div>
                        {reports.length > 0 && (
                            <div style={{ maxHeight: "100px", overflowY: "auto", fontSize: "0.8em", color: "var(--text-error)", marginTop: "8px" }}>
                                {reports.length} 个文件缺失关键字段(如 date/ticker)
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

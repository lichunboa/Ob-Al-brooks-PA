import * as React from "react";
import type { InspectorIssue } from "../../../core/inspector";
import { Button } from "../../../ui/components/Button";
import { V5_COLORS } from "../../../ui/tokens";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { SectionHeader } from "../../../ui/components/SectionHeader";

interface InspectorPanelProps {
    inspectorIssues: InspectorIssue[];
    fixPlanText?: string | null;
    showFixPlan?: boolean;
    setShowFixPlan?: (fn: (prev: boolean) => boolean) => void;
    openFile: (path: string) => void;
}

type SeverityFilter = "all" | "error" | "warn";

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
    inspectorIssues,
    fixPlanText,
    showFixPlan,
    setShowFixPlan,
    openFile,
}) => {
    const [severityFilter, setSeverityFilter] = React.useState<SeverityFilter>("all");
    const [searchTerm, setSearchTerm] = React.useState("");

    const errorCount = inspectorIssues.filter((i) => i.severity === "error").length;
    const warnCount = inspectorIssues.filter((i) => i.severity === "warn").length;

    // 筛选后的问题列表
    const filteredIssues = React.useMemo(() => {
        let result = inspectorIssues;

        // 严重程度筛选
        if (severityFilter !== "all") {
            result = result.filter((i) => i.severity === severityFilter);
        }

        // 搜索筛选
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter((i) =>
                i.title.toLowerCase().includes(term) ||
                i.path.toLowerCase().includes(term) ||
                (i.detail && i.detail.toLowerCase().includes(term))
            );
        }

        return result;
    }, [inspectorIssues, severityFilter, searchTerm]);

    return (
        <GlassPanel>
            <SectionHeader title="属性检查器" subtitle="Inspector" icon="🔍" />

            {/* 统计摘要 */}
            <div style={{
                display: "flex",
                gap: "12px",
                marginBottom: "12px",
                fontSize: "0.9em",
            }}>
                <span style={{ color: V5_COLORS.loss, fontWeight: 700 }}>
                    错误: {errorCount}
                </span>
                <span style={{ color: "#d97706", fontWeight: 700 }}>
                    警告: {warnCount}
                </span>
                <span style={{ opacity: 0.7 }}>总计: {inspectorIssues.length}</span>
            </div>

            {/* 筛选控制 */}
            <div style={{
                display: "flex",
                gap: "8px",
                marginBottom: "12px",
                flexWrap: "wrap",
                alignItems: "center",
            }}>
                {/* 严重程度筛选 */}
                <div style={{
                    display: "flex",
                    gap: "4px",
                    background: "var(--background-primary)",
                    padding: "2px",
                    borderRadius: "6px",
                    border: "1px solid var(--background-modifier-border)",
                }}>
                    {([
                        { key: "all", label: "全部", count: inspectorIssues.length },
                        { key: "error", label: "错误", count: errorCount },
                        { key: "warn", label: "警告", count: warnCount },
                    ] as const).map(({ key, label, count }) => (
                        <div
                            key={key}
                            onClick={() => setSeverityFilter(key)}
                            style={{
                                padding: "4px 10px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                background: severityFilter === key
                                    ? (key === "error" ? V5_COLORS.loss : key === "warn" ? "#d97706" : "#60A5FA")
                                    : "transparent",
                                color: severityFilter === key ? "white" : "var(--text-muted)",
                                fontSize: "0.85em",
                                fontWeight: 600,
                                transition: "all 0.15s",
                            }}
                        >
                            {label} ({count})
                        </div>
                    ))}
                </div>

                {/* 搜索框 */}
                <input
                    type="text"
                    placeholder="🔍 搜索问题..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        flex: 1,
                        minWidth: "150px",
                        padding: "6px 10px",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "6px",
                        background: "var(--background-primary)",
                        color: "var(--text-normal)",
                        fontSize: "0.85em",
                    }}
                />

                {setShowFixPlan && (
                    <Button
                        variant="small"
                        onClick={() => setShowFixPlan((prev) => !prev)}
                        style={{ fontSize: "0.85em", padding: "4px 10px" }}
                    >
                        {showFixPlan ? "隐藏修复方案" : "显示修复方案"}
                    </Button>
                )}
            </div>

            {/* 问题列表 */}
            <div style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                background: "var(--background-primary)",
                maxHeight: "300px",
                overflowY: "auto",
            }}>
                {filteredIssues.length === 0 ? (
                    <div style={{
                        color: inspectorIssues.length === 0 ? V5_COLORS.win : "var(--text-muted)",
                        textAlign: "center",
                        padding: "20px",
                    }}>
                        {inspectorIssues.length === 0 ? "✅ 无发现问题" : "无匹配结果"}
                    </div>
                ) : (
                    filteredIssues.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => openFile(item.path)}
                            className="nav-file-title"
                            style={{
                                borderBottom: "1px solid var(--background-modifier-border)",
                                padding: "10px 12px",
                                fontSize: "0.9em",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "10px",
                            }}
                        >
                            {/* 严重程度标记 */}
                            <div style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                background: item.severity === "error" ? V5_COLORS.loss : "#d97706",
                                marginTop: "5px",
                                flexShrink: 0,
                            }} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: "8px",
                                }}>
                                    <span style={{
                                        fontWeight: 600,
                                        color: "var(--text-normal)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}>
                                        {item.title}
                                    </span>
                                    <span style={{
                                        fontSize: "0.8em",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        background: item.severity === "error"
                                            ? "rgba(239, 68, 68, 0.15)"
                                            : "rgba(217, 119, 6, 0.15)",
                                        color: item.severity === "error" ? V5_COLORS.loss : "#d97706",
                                        fontWeight: 600,
                                        flexShrink: 0,
                                    }}>
                                        {item.severity === "error" ? "错误" : "警告"}
                                    </span>
                                </div>
                                <div style={{
                                    color: "var(--text-faint)",
                                    fontSize: "0.85em",
                                    marginTop: "2px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    {item.path.split("/").pop()}
                                    {item.detail && (
                                        <span style={{ marginLeft: "8px", opacity: 0.8 }}>
                                            ({item.detail})
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 修复方案预览 */}
            {showFixPlan && (
                <div style={{
                    marginTop: "12px",
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "8px",
                    padding: "10px",
                    background: "var(--background-primary)",
                }}>
                    <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "0.9em" }}>
                        只读: 仅报告问题; 修复方案 (FixPlan) 仅预览 (不会写入 vault)。
                    </div>
                    <pre style={{
                        fontSize: "0.8em",
                        whiteSpace: "pre-wrap",
                        color: "var(--text-muted)",
                        maxHeight: "150px",
                        overflowY: "auto",
                    }}>
                        {fixPlanText || "无需修复或修复计算未激活"}
                    </pre>
                </div>
            )}
        </GlassPanel>
    );
};


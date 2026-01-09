import * as React from "react";
import type { InspectorIssue } from "../../../core/inspector";
import { Button } from "../../../ui/components/Button";
import { V5_COLORS } from "../../../ui/tokens";

interface InspectorPanelProps {
    inspectorIssues: InspectorIssue[];
    fixPlanText?: string | null;
    showFixPlan?: boolean;
    setShowFixPlan?: (fn: (prev: boolean) => boolean) => void;
    openFile: (path: string) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
    inspectorIssues,
    fixPlanText,
    showFixPlan,
    setShowFixPlan,
    openFile,
}) => {
    const errorCount = inspectorIssues.filter((i) => i.severity === "error").length;
    const warnCount = inspectorIssues.filter((i) => i.severity === "warn").length;

    return (
        <details
            style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                background: "rgba(var(--mono-rgb-100), 0.03)",
                padding: "8px 12px",
            }}
        >
            <summary
                style={{
                    cursor: "pointer",
                    fontWeight: 700,
                    listStyle: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                }}
            >
                <span>🔍 检查器 (Inspector) 与修复方案预览 (可展开)</span>
                {inspectorIssues.length > 0 && (
                    <span
                        style={{
                            fontSize: "0.8em",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: errorCount > 0 ? V5_COLORS.loss : "var(--background-modifier-border)",
                            color: errorCount > 0 ? "white" : "var(--text-muted)",
                            fontWeight: 600,
                        }}
                    >
                        {inspectorIssues.length} issues
                    </span>
                )}
            </summary>

            <div style={{ marginTop: "12px" }}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "12px",
                    }}
                >
                    <div style={{ fontWeight: 700 }}>检查器问题列表</div>
                    {setShowFixPlan && (
                        <Button
                            variant="small"
                            onClick={() => setShowFixPlan((prev) => !prev)}
                            style={{ fontSize: "0.9em", padding: "4px 12px" }}
                        >
                            {showFixPlan ? "隐藏修复方案" : "显示修复方案"}
                        </Button>
                    )}
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: "12px",
                        marginBottom: "12px",
                        fontSize: "0.95em",
                    }}
                >
                    <span style={{ color: V5_COLORS.loss, fontWeight: 700 }}>
                        错误: {errorCount}
                    </span>
                    <span style={{ color: "#d97706", fontWeight: 700 }}>
                        警告: {warnCount}
                    </span>
                    <span style={{ opacity: 0.7 }}>总计: {inspectorIssues.length}</span>
                </div>

                <div
                    style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        background: "var(--background-primary)",
                        maxHeight: "300px",
                        overflowY: "auto",
                        padding: "8px",
                        marginBottom: "12px",
                    }}
                >
                    {inspectorIssues.length === 0 ? (
                        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
                            ✅ 无发现问题
                        </div>
                    ) : (
                        inspectorIssues.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => openFile(item.path)}
                                className="nav-file-title"
                                style={{
                                    borderBottom: "1px solid var(--background-modifier-border)",
                                    padding: "8px 0",
                                    fontSize: "0.9em",
                                    cursor: "pointer",
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span
                                        style={{
                                            fontWeight: 700,
                                            color: item.severity === "error" ? V5_COLORS.loss : "#d97706",
                                        }}
                                    >
                                        {item.severity === "error" ? "错误" : "警告"}
                                    </span>
                                    <span style={{ fontWeight: 600, color: "var(--text-normal)" }}>{item.title}</span>
                                </div>
                                <div style={{ color: "var(--text-faint)", fontSize: "0.85em", marginTop: "2px" }}>
                                    {item.path.split("/").pop()}
                                    {item.detail && <span style={{ marginLeft: "8px", opacity: 0.8 }}>({item.detail})</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {showFixPlan && (
                    <div
                        style={{
                            marginTop: "12px",
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "8px",
                            padding: "10px",
                            background: "var(--background-primary)",
                        }}
                    >
                        <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                            只读: 仅报告问题; 修复方案 (FixPlan) 仅预览 (不会写入 vault)。
                        </div>
                        <pre
                            style={{
                                fontSize: "0.85em",
                                whiteSpace: "pre-wrap",
                                color: "var(--text-muted)",
                                maxHeight: "200px",
                                overflowY: "auto",
                            }}
                        >
                            {fixPlanText || "无需修复或修复计算未激活"}
                        </pre>
                    </div>
                )}
            </div>
        </details>
    );
};

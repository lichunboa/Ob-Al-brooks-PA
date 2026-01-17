import * as React from "react";
import { Button } from "../../../ui/components/Button";

/**
 * 导出面板组件
 * 提供数据导出功能
 */

interface ExportPanelProps {
    // 函数Props
    runCommand?: (commandId: string) => void;

    // 样式Props
    buttonStyle: React.CSSProperties;
    disabledButtonStyle: React.CSSProperties;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
    runCommand,
    buttonStyle,
    disabledButtonStyle,
}) => {
    return (
        <>
            <div
                style={{
                    margin: "18px 0 10px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid var(--background-modifier-border)",
                    display: "flex",
                    alignItems: "baseline",
                    gap: "10px",
                    flexWrap: "wrap",
                }}
            >
                <div style={{ fontWeight: 700 }}>📥 导出</div>
            </div>

            <div
                style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "12px",
                    marginBottom: "16px",
                    background: "var(--background-primary)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "10px",
                    }}
                >
                    <Button
                        variant="default"
                        disabled={!runCommand}
                        onClick={() =>
                            runCommand?.("al-brooks-console:export-legacy-snapshot")
                        }
                    >
                        导出旧版兼容快照 (pa-db-export.json)
                    </Button>
                    <Button
                        variant="default"
                        disabled={!runCommand}
                        onClick={() =>
                            runCommand?.("al-brooks-console:export-index-snapshot")
                        }
                    >
                        导出索引快照 (Index Snapshot)
                    </Button>
                </div>

                <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                    v5.0 在页面底部提供"一键备份数据库"按钮（写入
                    pa-db-export.json）。插件版 目前提供两类导出：旧版兼容快照（写入
                    vault 根目录 pa-db-export.json）与索引快照（导出到
                    Exports/al-brooks-console/）。
                </div>
            </div>
        </>
    );
};

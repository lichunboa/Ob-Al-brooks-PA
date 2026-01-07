import * as React from "react";
import { GlassCard, GlassPanel, ButtonGhost, HeadingM } from "../../ui/components/DesignSystem";
import { SPACE } from "../../ui/styles/dashboardPrimitives";
import { FrontmatterFile } from "../../core/manager";
import { V5_COLORS } from "../../ui/tokens";

export interface ManagerFileInspectorProps {
    files: FrontmatterFile[];
    label?: string;
    onClose: () => void;
    onOpenFile: (path: string) => void;
}

export const ManagerFileInspector: React.FC<ManagerFileInspectorProps> = ({
    files,
    label,
    onClose,
    onOpenFile
}) => {
    return (
        <GlassCard
            style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                border: `1px solid ${V5_COLORS.accent}`,
                background: "rgba(0,0,0,0.4)"
            }}
        >
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: SPACE.md,
                borderBottom: "1px solid var(--background-modifier-border)",
                paddingBottom: SPACE.sm
            }}>
                <div>
                    <HeadingM style={{ margin: 0, fontSize: "1.1em" }}>📂 关联文件 ({files.length})</HeadingM>
                    {label && (
                        <div style={{ fontSize: "0.85em", color: "var(--text-accent)", marginTop: "4px" }}>
                            {label}
                        </div>
                    )}
                </div>
                <ButtonGhost onClick={onClose} style={{ color: "var(--text-muted)" }}>✖ 关闭</ButtonGhost>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {files.map(f => (
                    <button
                        key={f.path}
                        onClick={() => onOpenFile(f.path)}
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.05)",
                            borderRadius: "8px",
                            padding: SPACE.sm,
                            textAlign: "left",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}
                    >
                        <div style={{ overflow: "hidden" }}>
                            <div style={{ fontWeight: 600, color: "var(--text-normal)" }}>{f.path.split("/").pop()}</div>
                            <div style={{ fontSize: "0.75em", color: "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", direction: "rtl", textAlign: "left" }}>
                                {f.path}
                            </div>
                        </div>
                        <span style={{ fontSize: "0.8em", color: "var(--text-accent)" }}>↗</span>
                    </button>
                ))}
                {files.length === 0 && (
                    <div style={{ color: "var(--text-faint)", textAlign: "center", padding: SPACE.xl }}>
                        暂无文件
                    </div>
                )}
            </div>
        </GlassCard>
    );
};

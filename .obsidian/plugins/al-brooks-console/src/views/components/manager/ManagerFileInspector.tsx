import * as React from "react";
import { HeadingM, GlassInset, ButtonGhost } from "../../../ui/components/DesignSystem";
import { FrontmatterFile } from "../../../core/manager";

export interface ManagerFileInspectorProps {
    files: FrontmatterFile[];
    title: string;
    onOpenFile: (path: string) => void;
}

export const ManagerFileInspector: React.FC<ManagerFileInspectorProps> = ({
    files, title, onOpenFile
}) => {
    return (
        <div>
            <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <HeadingM>{title} ({files.length})</HeadingM>
            </div>

            <GlassInset style={{ maxHeight: "400px", overflowY: "auto", padding: "0" }}>
                {files.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                        No files found.
                    </div>
                ) : (
                    <div style={{ display: "grid", gap: "1px", background: "var(--background-modifier-border)" }}>
                        {files.map(f => {
                            const basename = f.path.split("/").pop() ?? f.path;
                            const folder = f.path.substring(0, f.path.lastIndexOf("/"));
                            return (
                                <div key={f.path} style={{ background: "var(--background-primary)", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        <div style={{ fontSize: "0.9em", fontWeight: 700 }}>{basename}</div>
                                        <div style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>{folder}</div>
                                    </div>
                                    <ButtonGhost onClick={() => onOpenFile(f.path)}>GenericOpen</ButtonGhost>
                                </div>
                            );
                        })}
                    </div>
                )}
            </GlassInset>
        </div>
    );
};

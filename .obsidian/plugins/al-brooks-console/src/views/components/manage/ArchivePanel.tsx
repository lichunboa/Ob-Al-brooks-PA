import * as React from "react";
import { App, TFile } from "obsidian";
import { Button } from "../../../ui/components/Button";
import { SectionHeader } from "../../../ui/components/SectionHeader";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { ArchiveService } from "../../../services/archive-service";

interface ArchivePanelProps {
    app: App;
}

export const ArchivePanel: React.FC<ArchivePanelProps> = ({ app }) => {
    const [daysOld, setDaysOld] = React.useState(30);
    const [scanning, setScanning] = React.useState(false);
    const [candidates, setCandidates] = React.useState<TFile[]>([]);

    const archiveService = React.useMemo(() => new ArchiveService(app), [app]);

    const handleScan = async () => {
        setScanning(true);
        setCandidates([]);
        try {
            const results = await archiveService.scanForArchive(daysOld);
            setCandidates(results);
        } finally {
            setScanning(false);
        }
    };

    const handleArchive = async () => {
        if (candidates.length === 0) return;
        if (!window.confirm(`Are you sure you want to archive ${candidates.length} files?`)) return;

        setScanning(true);
        try {
            await archiveService.archiveFiles(candidates);
            setCandidates([]); // Clear after success
        } finally {
            setScanning(false);
        }
    };

    return (
        <GlassPanel style={{ marginBottom: "16px", padding: "16px" }}>
            <SectionHeader title="Auto Archive (自动归档)" icon="📦" />

            <div style={{ marginBottom: "12px", color: "var(--text-muted)", fontSize: "0.9em" }}>
                将久远的交易日记（默认 {daysOld} 天前）移动到 "已归档/YYYY/MM/" 目录。
            </div>

            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.9em" }}>归档阈值:</span>
                    <input
                        type="number"
                        value={daysOld}
                        onChange={(e) => setDaysOld(parseInt(e.target.value) || 0)}
                        style={{ width: "60px", padding: "4px" }}
                    />
                    <span style={{ fontSize: "0.9em" }}>天</span>
                </div>

                <Button onClick={handleScan} disabled={scanning} variant="default">
                    {scanning ? "扫描中..." : "🔍 扫描过期文件"}
                </Button>

                {candidates.length > 0 && (
                    <Button onClick={handleArchive} disabled={scanning} variant="default" style={{ backgroundColor: "var(--interactive-accent)", color: "var(--text-on-accent)" }}>
                        📦 执行归档 ({candidates.length} 个文件)
                    </Button>
                )}
            </div>

            {candidates.length > 0 && (
                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--background-modifier-border)", borderRadius: "8px", padding: "8px" }}>
                    <div style={{ fontWeight: "bold", marginBottom: "8px", position: "sticky", top: 0, background: "var(--background-primary)" }}>
                        候选文件 ({candidates.length}):
                    </div>
                    {candidates.slice(0, 50).map((f, i) => (
                        <div key={i} style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
                            {f.path}
                        </div>
                    ))}
                    {candidates.length > 50 && <div style={{ fontStyle: "italic" }}>...and {candidates.length - 50} more</div>}
                </div>
            )}
        </GlassPanel>
    );
};

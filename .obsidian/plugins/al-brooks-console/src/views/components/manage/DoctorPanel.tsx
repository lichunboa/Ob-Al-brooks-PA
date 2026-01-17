import * as React from "react";
import { App, TFile } from "obsidian";
import { Button } from "../../../ui/components/Button";
import { SectionHeader } from "../../../ui/components/SectionHeader";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { MetadataDoctor, DiagnosisReport } from "../../../services/metadata-doctor";

interface DoctorPanelProps {
    app: App;
}

export const DoctorPanel: React.FC<DoctorPanelProps> = ({ app }) => {
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
            setReports([]); // Clear reports after fix
        } finally {
            setScanning(false);
        }
    };

    return (
        <GlassPanel style={{ marginBottom: "16px", padding: "16px" }}>
            <SectionHeader title="Metadata Doctor (元数据医生)" icon="🩺" />

            <div style={{ marginBottom: "12px", color: "var(--text-muted)", fontSize: "0.9em" }}>
                自动扫描交易笔记，找出缺失的标准元数据字段，并支持一键修复（补全默认值）。
            </div>

            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
                <Button onClick={handleScan} disabled={scanning} variant="default">
                    {scanning ? "诊断中..." : "🚑 开始诊断"}
                </Button>

                {reports.length > 0 && (
                    <Button onClick={handleFixAll} disabled={scanning} variant="default" style={{ backgroundColor: "var(--interactive-accent)", color: "var(--text-on-accent)" }}>
                        💉 一键修复 ({reports.length} 个问题)
                    </Button>
                )}
            </div>

            {scanning && <div>诊断中...</div>}

            {!scanning && fixedCount > 0 && (
                <div style={{ color: "var(--text-success)", marginBottom: "12px" }}>
                    ✅ 成功修复了 {fixedCount} 个文件!
                </div>
            )}

            {!scanning && reports.length === 0 && fixedCount === 0 && (
                // Just initial state or clean scan?
                // We can distinguish by state? but keeping simple.
                null
            )}

            {reports.length > 0 && (
                <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid var(--background-modifier-border)", borderRadius: "8px", padding: "8px" }}>
                    <div style={{ fontWeight: "bold", marginBottom: "8px", position: "sticky", top: 0, background: "var(--background-primary)" }}>
                        发现 {reports.length} 个文件缺失字段:
                    </div>
                    {reports.map((r, i) => (
                        <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--background-modifier-border)", fontSize: "0.85em" }}>
                            <span style={{ color: "var(--text-accent)" }}>{r.file.basename}</span>
                            <div style={{ color: "var(--text-error)", marginLeft: "8px" }}>
                                Missing: {r.missingKeys.slice(0, 5).join(", ")} {r.missingKeys.length > 5 ? `... (+${r.missingKeys.length - 5})` : ""}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </GlassPanel>
    );
};

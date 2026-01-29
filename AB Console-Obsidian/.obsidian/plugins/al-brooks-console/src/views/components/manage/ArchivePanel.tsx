import * as React from "react";
import { App, TFile, moment } from "obsidian";
import { Button } from "../../../ui/components/Button";
import { SectionHeader } from "../../../ui/components/SectionHeader";
import { ArchiveService } from "../../../services/archive-service";

interface ArchivePanelProps {
    app: App;
}

type ArchiveScope = "trades" | "all";

export const ArchivePanel: React.FC<ArchivePanelProps> = ({ app }) => {
    const [daysOld, setDaysOld] = React.useState(30);
    const [scope, setScope] = React.useState<ArchiveScope>("trades");
    const [scanning, setScanning] = React.useState(false);
    const [candidates, setCandidates] = React.useState<TFile[]>([]);
    const [excludedPaths, setExcludedPaths] = React.useState<Set<string>>(new Set());

    const archiveService = React.useMemo(() => new ArchiveService(app), [app]);

    const handleScan = async () => {
        setScanning(true);
        setCandidates([]);
        setExcludedPaths(new Set());
        try {
            const results = await archiveService.scanForArchive(daysOld);
            // 根据 scope 筛选
            const filtered = scope === "trades"
                ? results.filter(f => f.path.startsWith("Daily/") || f.path.includes("Trade"))
                : results;
            setCandidates(filtered);
        } finally {
            setScanning(false);
        }
    };

    const handleArchive = async () => {
        const toArchive = candidates.filter(f => !excludedPaths.has(f.path));
        if (toArchive.length === 0) return;
        if (!window.confirm(`⚠️ 确定要归档 ${toArchive.length} 个文件吗？\n\n文件将被移动到 "已归档/YYYY/MM/" 目录。`)) return;

        setScanning(true);
        try {
            await archiveService.archiveFiles(toArchive);
            setCandidates([]);
            setExcludedPaths(new Set());
        } finally {
            setScanning(false);
        }
    };

    const toggleExclude = (path: string) => {
        setExcludedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const activeCount = candidates.filter(f => !excludedPaths.has(f.path)).length;

    return (
        <div style={{ padding: "16px" }}>
            <SectionHeader title="数据归档" subtitle="Archive" icon="🗃️" />

            {/* 危险操作警告 */}
            <div style={{
                padding: "10px 12px",
                marginBottom: "12px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
            }}>
                <span style={{ fontSize: "1.2em" }}>⚠️</span>
                <span style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "0.85em" }}>
                    此操作会移动文件，请确认后再执行
                </span>
            </div>

            {/* 设置区域 */}
            <div style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "16px",
            }}>
                {/* 归档范围 */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.9em", color: "var(--text-muted)" }}>范围:</span>
                    <div style={{
                        display: "flex",
                        gap: "4px",
                        background: "var(--background-primary)",
                        padding: "2px",
                        borderRadius: "6px",
                        border: "1px solid var(--background-modifier-border)",
                    }}>
                        {([
                            { key: "trades", label: "交易日记" },
                            { key: "all", label: "全部笔记" },
                        ] as const).map(({ key, label }) => (
                            <div
                                key={key}
                                onClick={() => setScope(key)}
                                style={{
                                    padding: "4px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    background: scope === key ? "#60A5FA" : "transparent",
                                    color: scope === key ? "white" : "var(--text-muted)",
                                    fontSize: "0.85em",
                                    fontWeight: 600,
                                    transition: "all 0.15s",
                                }}
                            >
                                {label}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 天数阈值 */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.9em", color: "var(--text-muted)" }}>超过</span>
                    <input
                        type="number"
                        value={daysOld}
                        onChange={(e) => setDaysOld(parseInt(e.target.value) || 0)}
                        style={{
                            width: "60px",
                            padding: "4px 8px",
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "4px",
                            background: "var(--background-primary)",
                            color: "var(--text-normal)",
                            textAlign: "center",
                        }}
                    />
                    <span style={{ fontSize: "0.9em", color: "var(--text-muted)" }}>天</span>
                </div>

                {/* 扫描按钮 */}
                <Button onClick={handleScan} disabled={scanning} variant="default">
                    {scanning ? "扫描中..." : "🔍 扫描过期文件"}
                </Button>
            </div>

            {/* 候选文件列表 */}
            {candidates.length > 0 && (
                <div style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "8px",
                    overflow: "hidden",
                }}>
                    {/* 列表头部 */}
                    <div style={{
                        padding: "10px 12px",
                        background: "var(--background-secondary)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderBottom: "1px solid var(--background-modifier-border)",
                    }}>
                        <span style={{ fontWeight: 700 }}>
                            候选文件 ({activeCount}/{candidates.length})
                        </span>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <Button
                                variant="text"
                                onClick={() => setExcludedPaths(new Set())}
                                style={{ fontSize: "0.8em", padding: "2px 8px" }}
                            >
                                全选
                            </Button>
                            <Button
                                variant="text"
                                onClick={() => setExcludedPaths(new Set(candidates.map(f => f.path)))}
                                style={{ fontSize: "0.8em", padding: "2px 8px" }}
                            >
                                全不选
                            </Button>
                        </div>
                    </div>

                    {/* 文件列表 */}
                    <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                        {candidates.slice(0, 50).map((f) => {
                            const isExcluded = excludedPaths.has(f.path);
                            const mtime = f.stat?.mtime ? moment(f.stat.mtime).format("YYYY-MM-DD") : "-";
                            const size = f.stat?.size ? `${(f.stat.size / 1024).toFixed(1)}KB` : "-";

                            return (
                                <div
                                    key={f.path}
                                    onClick={() => toggleExclude(f.path)}
                                    style={{
                                        padding: "8px 12px",
                                        borderBottom: "1px solid var(--background-modifier-border)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        cursor: "pointer",
                                        background: isExcluded ? "rgba(128, 128, 128, 0.1)" : "transparent",
                                        opacity: isExcluded ? 0.5 : 1,
                                    }}
                                >
                                    {/* 选择框 */}
                                    <div style={{
                                        width: "16px",
                                        height: "16px",
                                        borderRadius: "3px",
                                        border: `2px solid ${isExcluded ? "var(--text-muted)" : "#60A5FA"}`,
                                        background: isExcluded ? "transparent" : "#60A5FA",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "white",
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}>
                                        {!isExcluded && "✓"}
                                    </div>

                                    {/* 文件信息 */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: "0.9em",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            textDecoration: isExcluded ? "line-through" : "none",
                                        }}>
                                            {f.basename}
                                        </div>
                                        <div style={{
                                            fontSize: "0.8em",
                                            color: "var(--text-faint)",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}>
                                            {f.path}
                                        </div>
                                    </div>

                                    {/* 元数据 */}
                                    <div style={{
                                        display: "flex",
                                        gap: "12px",
                                        fontSize: "0.8em",
                                        color: "var(--text-muted)",
                                        flexShrink: 0,
                                    }}>
                                        <span>{mtime}</span>
                                        <span>{size}</span>
                                    </div>
                                </div>
                            );
                        })}
                        {candidates.length > 50 && (
                            <div style={{
                                padding: "10px",
                                textAlign: "center",
                                color: "var(--text-faint)",
                                fontSize: "0.85em",
                            }}>
                                ...还有 {candidates.length - 50} 个文件
                            </div>
                        )}
                    </div>

                    {/* 执行归档按钮 */}
                    <div style={{
                        padding: "12px",
                        background: "var(--background-secondary)",
                        borderTop: "1px solid var(--background-modifier-border)",
                        display: "flex",
                        justifyContent: "flex-end",
                    }}>
                        <Button
                            onClick={handleArchive}
                            disabled={scanning || activeCount === 0}
                            variant="default"
                            style={{
                                background: activeCount > 0 ? "rgba(239, 68, 68, 0.8)" : undefined,
                                color: activeCount > 0 ? "white" : undefined,
                            }}
                        >
                            📦 执行归档 ({activeCount} 个文件)
                        </Button>
                    </div>
                </div>
            )}

            {/* 空状态 */}
            {candidates.length === 0 && !scanning && (
                <div style={{
                    padding: "24px",
                    textAlign: "center",
                    color: "var(--text-faint)",
                    fontSize: "0.9em",
                }}>
                    点击"扫描过期文件"开始检测
                </div>
            )}
        </div>
    );
};


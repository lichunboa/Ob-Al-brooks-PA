import * as React from "react";
import { Button } from "../../../ui/components/Button";
import { SectionHeader } from "../../../ui/components/SectionHeader";
import { SPACE } from "../../../ui/styles/dashboardPrimitives";
import { V5_COLORS } from "../../../ui/tokens";
import type { TradeRecord } from "../../../core/contracts";
import type { ActionService } from "../../../core/action/action-service";
import { TRADE_SCHEMA } from "../../../core/action/schema-validator";

interface BatchEditPanelProps {
    trades: TradeRecord[];
    // We need actionService instance or a bound function.
    // Dashboard passes down helpers. Let's ask for a batchUpdate function.
    // But ActionService is wrapped in hooks usually.
    // We can pass a callback `onBatchUpdate`.
    onBatchUpdate: (
        items: Array<{ path: string; updates: Partial<TradeRecord> }>,
        options: { dryRun: boolean }
    ) => Promise<any>;
    openFile: (path: string) => void;
}

export const BatchEditPanel: React.FC<BatchEditPanelProps> = ({
    trades,
    onBatchUpdate,
    openFile
}) => {
    const [selectedFiles, setSelectedFiles] = React.useState<string[]>([]);
    const [selectedField, setSelectedField] = React.useState<string>("");
    const [newValue, setNewValue] = React.useState<string>("");
    const [isDryRun, setIsDryRun] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [result, setResult] = React.useState<any>(null);

    // Filtering logic (Simple ticker/date filter for now?)
    const [filterText, setFilterText] = React.useState("");

    const filteredTrades = React.useMemo(() => {
        if (!filterText) return trades;
        const lower = filterText.toLowerCase();
        return trades.filter(t =>
            t.ticker?.toLowerCase().includes(lower) ||
            t.path.toLowerCase().includes(lower)
        );
    }, [trades, filterText]);

    const handleSelectAll = () => {
        if (selectedFiles.length === filteredTrades.length) {
            setSelectedFiles([]);
        } else {
            setSelectedFiles(filteredTrades.map(t => t.path));
        }
    };

    const handleExecute = async () => {
        if (!selectedField) return;
        setBusy(true);
        setResult(null);

        try {
            // Construct Batch Items
            const items = selectedFiles.map(path => ({
                path,
                updates: {
                    [selectedField]: parseValue(selectedField, newValue)
                }
            }));

            const res = await onBatchUpdate(items, { dryRun: isDryRun });
            setResult(res);
        } catch (e) {
            setResult({ success: false, message: String(e) });
        } finally {
            setBusy(false);
        }
    };

    const parseValue = (field: string, val: string) => {
        const schema = TRADE_SCHEMA[field];
        if (schema?.type === "number") return Number(val);
        if (schema?.type === "date") return new Date(val); // Simple parser
        return val;
    };

    const schemaFields = Object.entries(TRADE_SCHEMA)
        .filter(([_, s]) => !s.required) // Allow editing optional fields mostly? Or all.
        .map(([k, s]) => ({ key: k, label: s.canonicalName }));

    return (
        <div style={{
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            padding: "16px",
            marginBottom: "24px",
            background: "var(--background-primary)"
        }}>
            <SectionHeader title="批量编辑器 (Batch Editor)" icon="⚡" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                {/* Left: File Selection */}
                <div>
                    <div style={{ marginBottom: "8px", fontWeight: "bold" }}>1. 选择文件 ({selectedFiles.length}/{filteredTrades.length})</div>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                        <input
                            type="text"
                            placeholder="搜索 Ticker/Path..."
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <Button onClick={handleSelectAll} variant="small">
                            {selectedFiles.length === filteredTrades.length ? "全不选" : "全选"}
                        </Button>
                    </div>
                    <div style={{
                        height: "300px",
                        overflowY: "auto",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "4px"
                    }}>
                        {filteredTrades.map(t => (
                            <div key={t.path} style={{
                                padding: "4px 8px",
                                borderBottom: "1px solid var(--background-modifier-border)",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px"
                            }}>
                                <input
                                    type="checkbox"
                                    checked={selectedFiles.includes(t.path)}
                                    onChange={e => {
                                        if (e.target.checked) setSelectedFiles(p => [...p, t.path]);
                                        else setSelectedFiles(p => p.filter(x => x !== t.path));
                                    }}
                                />
                                <span style={{ fontSize: "0.9em", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {t.path.split('/').pop()}
                                </span>
                                <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>{t.dateIso ? new Date(t.dateIso).toLocaleDateString() : ""}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Operation */}
                <div>
                    <div style={{ marginBottom: "8px", fontWeight: "bold" }}>2. 设置更新内容</div>
                    <div style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "0.9em" }}>目标字段</label>
                        <select
                            value={selectedField}
                            onChange={e => setSelectedField(e.target.value)}
                            style={{ width: "100%", padding: "6px" }}
                        >
                            <option value="">-- 选择字段 --</option>
                            {schemaFields.map(f => (
                                <option key={f.key} value={f.key}>{f.key} ({f.label})</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "0.9em" }}>新值 (New Value)</label>
                        <input
                            type="text"
                            value={newValue}
                            onChange={e => setNewValue(e.target.value)}
                            style={{ width: "100%", padding: "6px" }}
                            placeholder={TRADE_SCHEMA[selectedField]?.type === "number" ? "输入数字..." : "输入文本..."}
                        />
                        <div style={{ fontSize: "0.8em", color: "var(--text-muted)", marginTop: "4px" }}>
                            Type: {TRADE_SCHEMA[selectedField]?.type || "unknown"}
                        </div>
                    </div>

                    <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--background-modifier-border)" }}>
                        <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <input
                                    type="checkbox"
                                    checked={isDryRun}
                                    onChange={e => setIsDryRun(e.target.checked)}
                                />
                                Dry Run (仅预览)
                            </label>
                            <div style={{ flex: 1 }}></div>
                            <Button
                                onClick={handleExecute}
                                disabled={busy || selectedFiles.length === 0 || !selectedField}
                                variant={isDryRun ? "text" : "default"}
                            >
                                {busy ? "Executing..." : (isDryRun ? "Preview Actions" : "⚠️ Commit Changes")}
                            </Button>
                        </div>

                        {result && (
                            <div style={{
                                background: "var(--background-secondary)",
                                padding: "10px",
                                borderRadius: "4px",
                                fontSize: "0.9em",
                                maxHeight: "150px",
                                overflowY: "auto"
                            }}>
                                <div>Status: {result.success ? "Success" : "Failed"}</div>
                                <div>Total: {result.total}, Succeeded: {result.succeeded}, Failed: {result.failed}</div>
                                <hr style={{ margin: "8px 0", borderColor: "var(--background-modifier-border)" }} />
                                {result.results?.slice(0, 10).map((r: any, i: number) => (
                                    <div key={i} style={{ color: r.success ? "var(--text-normal)" : "var(--text-error)" }}>
                                        {r.changes?.after ? `Updated: ${JSON.stringify(r.changes.after[selectedField])}` : r.message}
                                    </div>
                                ))}
                                {result.results?.length > 10 && <div>...and {result.results.length - 10} more</div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

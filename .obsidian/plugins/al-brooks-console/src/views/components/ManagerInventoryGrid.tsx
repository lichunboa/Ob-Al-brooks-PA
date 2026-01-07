import * as React from "react";
import {
    GlassPanel,
    ButtonGhost,
    HeadingM
} from "../../ui/components/DesignSystem";
import { COLORS, SPACE } from "../../ui/styles/theme";
import type { FrontmatterInventory, FrontmatterInventoryKey } from "../../core/manager";

// Local Input component since DesignSystem doesn't export one yet
const Input = ({ value, onChange, placeholder, style }: any) => (
    <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
            background: "rgba(0,0,0,0.2)",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "8px",
            padding: "8px 12px",
            color: "var(--text-normal)",
            outline: "none",
            fontSize: "0.9em",
            ...style
        }}
    />
);

interface ManagerInventoryGridProps {
    inventory: FrontmatterInventory;
    onRenameKey: (oldKey: string, newKey: string) => void;
    onDeleteKey: (key: string) => void;
    onUpdateVal: (key: string, oldVal: string, newVal: string) => void;
    onDeleteVal: (key: string, val: string) => void;
    onSelectFiles: (paths: string[]) => void;
}

export const ManagerInventoryGrid: React.FC<ManagerInventoryGridProps> = ({
    inventory,
    onRenameKey,
    onDeleteKey,
    onUpdateVal,
    onDeleteVal,
    onSelectFiles,
}) => {
    const [search, setSearch] = React.useState("");
    const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
    const [valSearch, setValSearch] = React.useState("");

    // Filter keys
    const filteredKeys = React.useMemo(() => {
        if (!inventory?.keys) return [];
        const q = search.trim().toLowerCase();
        if (!q) return inventory.keys;
        return inventory.keys.filter(k => k.key.toLowerCase().includes(q));
    }, [inventory, search]);

    // Derived val stats for selected key
    const valStats = React.useMemo(() => {
        if (!selectedKey || !inventory?.valPaths?.[selectedKey]) return [];
        const valMap = inventory.valPaths[selectedKey];
        return Object.entries(valMap).map(([val, paths]) => ({
            val,
            count: paths.length,
            paths
        })).sort((a, b) => b.count - a.count);
    }, [inventory, selectedKey]);

    const filteredVals = React.useMemo(() => {
        const q = valSearch.trim().toLowerCase();
        if (!q) return valStats;
        return valStats.filter(v => v.val.toLowerCase().includes(q));
    }, [valStats, valSearch]);

    if (!inventory) {
        return <div style={{ padding: SPACE.lg, textAlign: "center", color: "var(--text-muted)" }}>Inventory not loaded.</div>;
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: SPACE.md, height: "600px" }}>
            {/* Left Col: Keys */}
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, height: "100%", overflow: "hidden" }}>
                <Input
                    placeholder="🔍 搜索属性键..."
                    value={search}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                    style={{ width: "100%" }}
                />
                <GlassPanel style={{ flex: 1, overflow: "auto", padding: "0" }}>
                    {filteredKeys.map((k: FrontmatterInventoryKey) => (
                        <div
                            key={k.key}
                            onClick={() => { setSelectedKey(k.key); setValSearch(""); }}
                            style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                borderLeft: selectedKey === k.key ? `3px solid ${COLORS.accent}` : "3px solid transparent",
                                background: selectedKey === k.key ? "rgba(var(--mono-rgb-100), 0.05)" : "transparent",
                                fontSize: "0.9em",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center"
                            }}
                        >
                            <span style={{ fontWeight: selectedKey === k.key ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis" }} title={k.key}>{k.key}</span>
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>{k.files}</span>
                        </div>
                    ))}
                    {filteredKeys.length === 0 && (
                        <div style={{ padding: "10px", color: "var(--text-faint)", textAlign: "center", fontSize: "0.9em" }}>
                            无匹配键
                        </div>
                    )}
                </GlassPanel>
            </div>

            {/* Right Col: Values & Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, height: "100%", overflow: "hidden" }}>
                {!selectedKey ? (
                    <GlassPanel style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                        <div>Select a property key to manage values</div>
                    </GlassPanel>
                ) : (
                    <>
                        <GlassPanel>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SPACE.sm }}>
                                <HeadingM>{selectedKey}</HeadingM>
                                <div style={{ display: "flex", gap: SPACE.xs }}>
                                    <ButtonGhost onClick={() => {
                                        const newKey = window.prompt("重命名键 (Rename Key):", selectedKey);
                                        if (newKey && newKey !== selectedKey) {
                                            onRenameKey(selectedKey, newKey);
                                        }
                                    }}>✏️ 重命名键</ButtonGhost>
                                    <ButtonGhost onClick={() => onDeleteKey(selectedKey)} style={{ color: COLORS.loss }}>🗑 删除键</ButtonGhost>
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: SPACE.md, fontSize: "0.85em", color: "var(--text-muted)" }}>
                                <div>涉及文件: <strong style={{ color: "var(--text-normal)" }}>{inventory.keyPaths[selectedKey]?.length ?? 0}</strong></div>
                                <div>唯一值: <strong style={{ color: "var(--text-normal)" }}>{valStats.length}</strong></div>
                            </div>
                        </GlassPanel>

                        <div style={{ display: "flex", gap: SPACE.sm }}>
                            <Input
                                placeholder={`🔍 搜索 ${selectedKey} 的值...`}
                                value={valSearch}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValSearch(e.target.value)}
                                style={{ flex: 1 }}
                            />
                        </div>

                        <GlassPanel style={{ flex: 1, overflow: "auto", padding: 0 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
                                <thead style={{ position: "sticky", top: 0, background: "var(--background-primary)", zIndex: 1 }}>
                                    <tr>
                                        <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--background-modifier-border)" }}>Value ({filteredVals.length})</th>
                                        <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid var(--background-modifier-border)" }}>Count</th>
                                        <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid var(--background-modifier-border)" }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredVals.map((v) => (
                                        <tr key={v.val} style={{ borderBottom: "1px solid var(--background-modifier-border)" }}>
                                            <td style={{ padding: "8px 12px" }}>
                                                <span
                                                    onClick={() => onSelectFiles(v.paths)}
                                                    style={{ cursor: "pointer", color: COLORS.accent, textDecoration: "underline", textUnderlineOffset: "2px" }}
                                                    title="Click to view files"
                                                >
                                                    {v.val === "" ? "(Empty/Null)" : v.val}
                                                </span>
                                            </td>
                                            <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                                {v.count}
                                            </td>
                                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                                                    <button
                                                        onClick={() => {
                                                            const newVal = window.prompt("修改属性值 (Rename Value):", v.val);
                                                            if (newVal !== null && newVal !== v.val) {
                                                                onUpdateVal(selectedKey, v.val, newVal);
                                                            }
                                                        }}
                                                        style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6, fontSize: "1.1em" }}
                                                        title="Rename Value"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() => onDeleteVal(selectedKey, v.val)}
                                                        style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6, fontSize: "1.1em" }}
                                                        title="Delete Value"
                                                    >
                                                        🗑
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredVals.length === 0 && (
                                        <tr>
                                            <td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "var(--text-faint)" }}>
                                                No values found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </GlassPanel>
                    </>
                )}
            </div>
        </div>
    );
};

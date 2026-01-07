import { ButtonGhost, GlassInset } from "../../../ui/components/DesignSystem";
import { FrontmatterInventory } from "../../../core/manager";
import { COLORS } from "../../../ui/styles/theme";

export interface ManagerInventoryGridProps {
    inventory?: FrontmatterInventory;
    search: string;
    onSearch: (s: string) => void;
    onSelectFiles: (paths: string[]) => void;
    onRenameKey: (oldKey: string) => void;
    onDeleteKey: (key: string) => void;
    onUpdateVal: (key: string, oldVal: string) => void;
    onDeleteVal: (key: string, val: string) => void;
}

export const ManagerInventoryGrid: React.FC<ManagerInventoryGridProps> = ({
    inventory, search, onSearch, onSelectFiles,
    onRenameKey, onDeleteKey, onUpdateVal, onDeleteVal
}) => {
    if (!inventory) return null;

    const dataMap = inventory.valPaths || {};
    const keys = Object.keys(dataMap).sort();
    const filteredKeys = keys.filter(k => k.toLowerCase().includes(search.toLowerCase()));

    return (
        <div>
            <div style={{ marginBottom: "12px" }}>
                {/* ... */}
                <input
                    type="text"
                    placeholder="🔍 搜索属性..."
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid var(--background-modifier-border)",
                        background: "var(--background-primary)",
                        color: "var(--text-normal)"
                    }}
                />
            </div>

            {filteredKeys.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                    没有找到匹配的属性。
                </div>
            ) : (
                <div style={{ display: "grid", gap: "16px" }}>
                    {filteredKeys.map(key => {
                        const values = dataMap[key] || {};
                        const valKeys = Object.keys(values).sort((a, b) => values[b].length - values[a].length); // Sort by frequency

                        return (
                            <div key={key} style={{ borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "12px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                    <div style={{ fontWeight: 700, color: "var(--text-normal)" }}>{key}</div>
                                    <div style={{ display: "flex", gap: "4px" }}>
                                        <ButtonGhost onClick={() => onRenameKey(key)}>✏️</ButtonGhost>
                                        <ButtonGhost onClick={() => onDeleteKey(key)} style={{ color: COLORS.loss }}>🗑</ButtonGhost>
                                    </div>
                                </div>
                                <GlassInset style={{ padding: "8px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                    {valKeys.map(val => (
                                        <div key={val} style={{
                                            display: "flex", alignItems: "center", gap: "6px",
                                            background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: "4px",
                                            fontSize: "0.85em"
                                        }}>
                                            <span
                                                style={{ cursor: "pointer", color: "var(--text-accent)" }}
                                                onClick={() => onSelectFiles(values[val])}
                                                title={`View ${values[val].length} files`}
                                            >
                                                {val === "" ? "(Empty)" : val}
                                                <span style={{ opacity: 0.6, marginLeft: "4px" }}>({values[val].length})</span>
                                            </span>
                                            <ButtonGhost onClick={() => onUpdateVal(key, val)} style={{ padding: "2px", height: "auto" }}>✏️</ButtonGhost>
                                            <ButtonGhost onClick={() => onDeleteVal(key, val)} style={{ padding: "2px", height: "auto", color: COLORS.loss }}>×</ButtonGhost>
                                        </div>
                                    ))}
                                </GlassInset>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

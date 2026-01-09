import * as React from "react";
import type { FrontmatterInventory } from "../../../core/manager";
import { SPACE } from "../../../ui/styles/dashboardPrimitives";
import { prettyVal } from "../../../utils/format-utils";
import {
    canonicalizeSearch,
    matchKeyToGroup,
} from "../../../utils/search-utils";
import { MANAGER_GROUPS } from "../../../core/manager-groups";

export interface PropertyGridProps {
    inventory: FrontmatterInventory | undefined;
    scope: "trade" | "strategy";
    search: string;
    title?: string;
    onSelectKey: (key: string) => void;
}

export const PropertyGrid: React.FC<PropertyGridProps> = ({
    inventory,
    scope,
    search,
    title = "📂 属性列表",
    onSelectKey,
}) => {
    if (!inventory) return null;

    const q = search.trim().toLowerCase();
    const qCanon = canonicalizeSearch(q);
    const groups = MANAGER_GROUPS;
    const othersTitle = "📂 其他属性 (Other)";

    const matchesSearch = (key: string) => {
        if (!q) return true;
        const kl = key.toLowerCase();
        if (kl.includes(q)) return true;
        if (qCanon && canonicalizeSearch(kl).includes(qCanon))
            return true;

        // Also check values
        const vals = Object.keys(inventory.valPaths[key] ?? {});
        return vals.some((v) => {
            const vl = v.toLowerCase();
            if (vl.includes(q)) return true;
            if (!qCanon) return false;
            return canonicalizeSearch(vl).includes(qCanon);
        });
    };

    const bucketed = new Map<string, string[]>();
    for (const g of groups) bucketed.set(g.title, []);
    bucketed.set(othersTitle, []);

    const visibleKeys = inventory.keys
        .map((k) => k.key)
        .filter((k) => matchesSearch(k));

    for (const key of visibleKeys) {
        const g = matchKeyToGroup(key);
        const bucket = bucketed.get(g);
        if (bucket) {
            bucket.push(key);
        }
    }

    const groupEntries: Array<{
        name: string;
        keys: string[];
    }> = [
        {
            name: groups[0]?.title ?? "",
            keys: bucketed.get(groups[0]?.title ?? "") ?? [],
        },
        {
            name: groups[1]?.title ?? "",
            keys: bucketed.get(groups[1]?.title ?? "") ?? [],
        },
        {
            name: groups[2]?.title ?? "",
            keys: bucketed.get(groups[2]?.title ?? "") ?? [],
        },
        {
            name: othersTitle,
            keys: bucketed.get(othersTitle) ?? [],
        },
    ].filter((x) => x.name && x.keys.length > 0);

    return (
        <div style={{ marginBottom: "14px" }}>
            <div style={{ fontWeight: 700, margin: "8px 0" }}>
                {title}
            </div>
            {groupEntries.length === 0 ? (
                <div
                    style={{
                        color: "var(--text-faint)",
                        fontSize: "0.9em",
                    }}
                >
                    无匹配属性。
                </div>
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(240px, 1fr))",
                        gap: SPACE.md,
                    }}
                >
                    {groupEntries.map((g) => (
                        <div
                            key={`${scope}:${g.name}`}
                            style={{
                                border:
                                    "1px solid var(--background-modifier-border)",
                                borderRadius: "12px",
                                padding: "10px",
                                background: "var(--background-secondary)",
                            }}
                        >
                            <div
                                style={{
                                    fontWeight: 700,
                                    marginBottom: "8px",
                                }}
                            >
                                {g.name}
                            </div>
                            <div
                                style={{ display: "grid", gap: "6px" }}
                            >
                                {g.keys.slice(0, 18).map((key) => {
                                    const countFiles = (
                                        inventory.keyPaths[key] ?? []
                                    ).length;
                                    const vals = Object.keys(
                                        inventory.valPaths[key] ?? {}
                                    );
                                    const topVals = vals
                                        .map((v) => ({
                                            v,
                                            c: (inventory.valPaths[key]?.[v] ?? [])
                                                .length,
                                        }))
                                        .sort((a, b) => b.c - a.c)
                                        .slice(0, 2);
                                    return (
                                        <div
                                            key={`${scope}:${key}`}
                                            onClick={() => onSelectKey(key)}
                                            style={{
                                                border:
                                                    "1px solid var(--background-modifier-border)",
                                                borderRadius: "10px",
                                                padding: "8px 10px",
                                                background:
                                                    "var(--background-primary)",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontWeight: 650,
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: "8px",
                                                }}
                                            >
                                                <span>{key}</span>
                                                <span
                                                    style={{
                                                        color: "var(--text-faint)",
                                                    }}
                                                >
                                                    {countFiles}
                                                </span>
                                            </div>
                                            <div
                                                style={{
                                                    color: "var(--text-faint)",
                                                    fontSize: "0.85em",
                                                    marginTop: "2px",
                                                    display: "flex",
                                                    gap: "8px",
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                {topVals.length ? (
                                                    topVals.map((x) => (
                                                        <span key={x.v}>
                                                            {prettyVal(x.v)} · {x.c}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span>（无值）</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {g.keys.length > 18 ? (
                                    <div
                                        style={{ color: "var(--text-faint)" }}
                                    >
                                        还有 {g.keys.length - 18} 个…
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

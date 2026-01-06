import * as React from "react";
import {
    SPACE,
    buttonStyle,
    disabledButtonStyle,
    glassCardStyle,
    glassPanelStyle,
} from "../../ui/styles/dashboardPrimitives";
import { V5_COLORS } from "../../ui/tokens";
import {
    GlassCard,
    GlassPanel,
    GlassInset,
    HeadingM,
    DisplayXL,
    StatusBadge,
    ButtonGhost,
    Label,
    Body,
    EmptyState,
} from "../../ui/components/DesignSystem";
import { COLORS } from "../../ui/styles/theme";
import type { TradeRecord } from "../../core/contracts";
import type { EnumPresets } from "../../core/enum-presets";
import { type FixPlan } from "../../core/inspector";
import {
    buildRenameKeyPlan,
    buildDeleteKeyPlan,
    buildDeleteValPlan,
    buildUpdateValPlan,
    buildAppendValPlan,
    buildInjectPropPlan,
    type ManagerApplyResult,
    type FrontmatterFile,
    type FrontmatterInventory,
} from "../../core/manager";
import { MANAGER_GROUPS, managerKeyTokens } from "../../core/manager-groups";

// Duplicate types for now (step 1 isolation)
export type SchemaIssueItem = {
    path: string;
    name: string;
    key: string;
    type: string;
    severity?: "error" | "warn";
    val?: string;
};

export type PaTagSnapshot = {
    files: number;
    tagMap: Record<string, number>;
};

export interface ManageTabProps {
    schemaIssues: SchemaIssueItem[];
    schemaScanNote?: string;
    paTagSnapshot?: PaTagSnapshot;
    trades: TradeRecord[];
    enumPresets?: EnumPresets;
    openFile: (path: string) => void;
    openGlobalSearch?: (query: string) => void;
    // State from Dashboard
    managerDeleteKeys: boolean;
    setManagerDeleteKeys: (v: boolean) => void;
    managerBackups?: Record<string, string>;
    setManagerBackups: (v: Record<string, string> | undefined) => void;
    managerTradeInventory?: FrontmatterInventory;
    managerTradeInventoryFiles?: FrontmatterFile[];
    managerStrategyInventory?: FrontmatterInventory;
    managerStrategyInventoryFiles?: FrontmatterFile[];

    // Actions
    scanManagerInventory: () => Promise<void>;
    runManagerPlan: (plan: FixPlan, options?: any) => Promise<void>;

    // Manager UI State
    managerSearch: string;
    setManagerSearch: (v: string) => void;
    managerScope: "trade" | "strategy";
    setManagerScope: (v: "trade" | "strategy") => void;
    managerInspectorKey?: string;
    setManagerInspectorKey: (v: string | undefined) => void;
    managerInspectorTab: "vals" | "files";
    setManagerInspectorTab: (v: "vals" | "files") => void;
    managerInspectorFileFilter?: { paths: string[]; label?: string };
    setManagerInspectorFileFilter: (v: { paths: string[]; label?: string } | undefined) => void;

    managerBusy: boolean;
    managerPlan?: FixPlan;
    managerResult?: ManagerApplyResult;
    fixPlanText?: string;
    showFixPlan: boolean;
    setShowFixPlan: (v: React.SetStateAction<boolean>) => void;

    inspectorIssues: SchemaIssueItem[];

    promptText?: (options: any) => Promise<string | null>;
    confirmDialog?: (options: any) => Promise<boolean>;
    runCommand?: (id: string) => void;
}

export const ManageTab: React.FC<ManageTabProps> = ({
    schemaIssues,
    schemaScanNote,
    paTagSnapshot,
    trades,
    enumPresets,
    openFile,
    openGlobalSearch,
    managerDeleteKeys,
    setManagerDeleteKeys,
    managerBackups,
    setManagerBackups,
    managerTradeInventory,
    managerTradeInventoryFiles,
    managerStrategyInventory,
    managerStrategyInventoryFiles,
    scanManagerInventory,
    runManagerPlan,
    managerSearch,
    setManagerSearch,
    managerScope,
    setManagerScope,
    managerInspectorKey,
    setManagerInspectorKey,
    managerInspectorTab,
    setManagerInspectorTab,
    managerInspectorFileFilter,
    setManagerInspectorFileFilter,
    managerBusy,
    managerPlan,
    managerResult,
    fixPlanText,
    showFixPlan,
    setShowFixPlan,
    inspectorIssues,
    promptText,
    confirmDialog,
    runCommand
}) => {

    // Event Handlers for buttons (local helpers)
    const onBtnMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
    };
    const onBtnMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
    };
    const onBtnFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
        e.currentTarget.style.borderColor = "var(--interactive-accent)";
    };
    const onBtnBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
        e.currentTarget.style.borderColor = "var(--background-modifier-border)";
    };

    const onTextBtnMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = "rgba(var(--mono-rgb-100), 0.05)";
    };
    const onTextBtnMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = "transparent";
    };
    const onTextBtnFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
        // text button focus style
    };
    const onTextBtnBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
        // text button blur style
    };

    // Helper Logic
    const issueCount = schemaIssues.length;
    const healthScore = Math.max(0, 100 - issueCount * 5);
    const healthColor =
        healthScore > 90
            ? V5_COLORS.win
            : healthScore > 60
                ? V5_COLORS.back
                : V5_COLORS.loss;
    const files = paTagSnapshot?.files ?? 0;
    const tags = paTagSnapshot
        ? Object.keys(paTagSnapshot.tagMap).length
        : 0;

    const issueByType = new Map<string, number>();
    for (const it of schemaIssues) {
        const k = (it.type ?? "未知").toString();
        issueByType.set(k, (issueByType.get(k) ?? 0) + 1);
    }
    const topTypes = [...issueByType.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    const topTags = paTagSnapshot
        ? Object.entries(paTagSnapshot.tagMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 60)
        : [];

    const hasCJK = (str: string) => /[\u4e00-\u9fff]/.test(str);

    const prettySchemaVal = (val?: string) => {
        let s = (val ?? "").toString().trim();
        if (!s) return "";
        const low = s.toLowerCase();
        if (s === "Unknown" || low === "unknown") return "未知/Unknown";
        if (s === "Empty" || low === "empty") return "空/Empty";
        if (low === "null") return "空/null";

        // 中文(English) -> 中文/English
        if (s.includes("(") && s.endsWith(")")) {
            const parts = s.split("(");
            const cn = (parts[0] || "").trim();
            const en = parts
                .slice(1)
                .join("(")
                .replace(/\)\s*$/, "")
                .trim();
            if (cn && en) return `${cn}/${en}`;
            if (cn) return cn;
            if (en) return `待补充/${en}`;
        }

        // 已是 pair，尽量保证中文在左
        if (s.includes("/")) {
            const parts = s.split("/");
            const left = (parts[0] || "").trim();
            const right = parts.slice(1).join("/").trim();
            if (hasCJK(left)) return s;
            if (hasCJK(right)) return `${right}/${left}`;
            return `待补充/${s}`;
        }

        if (!hasCJK(s) && /[a-zA-Z]/.test(s)) return `待补充/${s}`;
        return s;
    };

    const prettyExecVal = (val?: string) => {
        const s0 = (val ?? "").toString().trim();
        if (!s0) return "未知/Unknown";
        const low = s0.toLowerCase();
        if (low.includes("unknown") || low === "null")
            return "未知/Unknown";
        if (low.includes("perfect") || s0.includes("完美"))
            return "🟢 完美";
        if (low.includes("fomo") || s0.includes("FOMO"))
            return "🔴 FOMO";
        if (low.includes("tight") || s0.includes("止损太紧"))
            return "🔴 止损太紧";
        if (low.includes("scratch") || s0.includes("主动"))
            return "🟡 主动离场";
        if (
            low.includes("normal") ||
            low.includes("none") ||
            s0.includes("正常")
        )
            return "🟢 正常";
        return prettySchemaVal(s0) || "未知/Unknown";
    };

    const topN = (
        getter: (t: TradeRecord) => string | undefined,
        pretty?: (v?: string) => string
    ) => {
        const map = new Map<string, number>();
        for (const t of trades) {
            const raw = getter(t);
            const base = (raw ?? "").toString().trim();
            const v = (pretty ? pretty(base) : base) || "Unknown";
            if (!v) continue;
            map.set(v, (map.get(v) ?? 0) + 1);
        }
        return [...map.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
    };

    const distTicker = topN((t) => t.ticker, prettySchemaVal);
    const distSetup = topN(
        (t) => t.setupKey ?? t.setupCategory,
        prettySchemaVal
    );
    const distExec = topN((t) => t.executionQuality, prettyExecVal);

    const sortedRecent = [...trades]
        .sort((a, b) => ((b.dateIso ?? "") > (a.dateIso ?? "") ? 1 : -1))
        .slice(0, 50);

    // Inspector Logic
    const canonicalizeSearch = (str: string) => {
        return str.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
    };

    const q = managerSearch.trim().toLowerCase();
    const qCanon = canonicalizeSearch(q);
    const groups = MANAGER_GROUPS;
    const othersTitle = "📂 其他属性 (Other)";

    const prettyVal = (val: string) => {
        let s = (val ?? "").toString().trim();
        if (!s) return "";
        const low = s.toLowerCase();
        if (s === "Unknown" || low === "unknown")
            return "未知/Unknown";
        if (s === "Empty" || low === "empty") return "空/Empty";
        if (low === "null") return "空/null";
        return s;
    };

    const matchKeyToGroup = (key: string) => {
        const tokens = managerKeyTokens(key);
        for (const g of groups) {
            for (const kw of g.keywords) {
                const needle = String(kw ?? "")
                    .trim()
                    .toLowerCase();
                if (!needle) continue;
                if (
                    tokens.some(
                        (t) => t === needle || t.includes(needle)
                    )
                ) {
                    return g.title;
                }
            }
        }
        return othersTitle;
    };

    // Actions wrapped
    const doRenameKey = async () => {
        if (!managerInspectorKey) return;
        const key = managerInspectorKey;
        const allPaths = managerScope === "trade"
            ? (managerTradeInventory?.keyPaths[key] ?? [])
            : (managerStrategyInventory?.keyPaths[key] ?? []);

        const selectManagerFiles = (paths: string[]) => {
            const invFiles = managerScope === "trade" ? managerTradeInventoryFiles : managerStrategyInventoryFiles;
            if (!invFiles) return [];
            const map = new Map<string, FrontmatterFile>();
            for (const f of invFiles) map.set(f.path, f);
            return paths.map(p => map.get(p)).filter((x): x is FrontmatterFile => !!x);
        };

        const n =
            (await promptText?.({
                title: `重命名 ${key}`,
                defaultValue: key,
                placeholder: "输入新属性名",
                okText: "重命名",
                cancelText: "取消",
            })) ?? "";
        const nextKey = n.trim();
        if (!nextKey || nextKey === key) return;
        const ok =
            (await confirmDialog?.({
                title: "确认重命名",
                message: `将属性\n${key}\n重命名为\n${nextKey}`,
                okText: "确认",
                cancelText: "取消",
            })) ?? false;
        if (!ok) return;
        const plan = buildRenameKeyPlan(
            selectManagerFiles(allPaths),
            key,
            nextKey,
            { overwrite: true }
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            forceDeleteKeys: true,
            refreshInventory: true,
        });
    };

    const doDeleteKey = async () => {
        if (!managerInspectorKey) return;
        const key = managerInspectorKey;
        const allPaths = managerScope === "trade"
            ? (managerTradeInventory?.keyPaths[key] ?? [])
            : (managerStrategyInventory?.keyPaths[key] ?? []);

        const selectManagerFiles = (paths: string[]) => {
            const invFiles = managerScope === "trade" ? managerTradeInventoryFiles : managerStrategyInventoryFiles;
            if (!invFiles) return [];
            const map = new Map<string, FrontmatterFile>();
            for (const f of invFiles) map.set(f.path, f);
            return paths.map(p => map.get(p)).filter((x): x is FrontmatterFile => !!x);
        };

        const ok =
            (await confirmDialog?.({
                title: "确认删除属性",
                message: `⚠️ 将从所有关联文件中删除属性：\n${key}`,
                okText: "删除",
                cancelText: "取消",
            })) ?? false;
        if (!ok) return;
        const plan = buildDeleteKeyPlan(
            selectManagerFiles(allPaths),
            key
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            forceDeleteKeys: true,
            refreshInventory: true,
        });
    };

    const doAppendVal = async () => {
        if (!managerInspectorKey) return;
        const key = managerInspectorKey;
        const allPaths = managerScope === "trade"
            ? (managerTradeInventory?.keyPaths[key] ?? [])
            : (managerStrategyInventory?.keyPaths[key] ?? []);

        const selectManagerFiles = (paths: string[]) => {
            const invFiles = managerScope === "trade" ? managerTradeInventoryFiles : managerStrategyInventoryFiles;
            if (!invFiles) return [];
            const map = new Map<string, FrontmatterFile>();
            for (const f of invFiles) map.set(f.path, f);
            return paths.map(p => map.get(p)).filter((x): x is FrontmatterFile => !!x);
        };

        const v =
            (await promptText?.({
                title: `追加新值 → ${key}`,
                placeholder: "输入要追加的值",
                okText: "追加",
                cancelText: "取消",
            })) ?? "";
        const val = v.trim();
        if (!val) return;
        const ok =
            (await confirmDialog?.({
                title: "确认追加",
                message: `向属性\n${key}\n追加值：\n${val}`,
                okText: "确认",
                cancelText: "取消",
            })) ?? false;
        if (!ok) return;
        const plan = buildAppendValPlan(
            selectManagerFiles(allPaths),
            key,
            val
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            refreshInventory: true,
        });
    };

    const doInjectProp = async () => {
        // Current filtered paths in inspector
        // Wait, logic for currentPaths is inside renderInventoryGrid... it's somewhat nested.
        // To fix this cleanly, `doInjectProp` should probably rely on the filtered state `managerInspectorFileFilter` or `currentPaths` computed in render.
        // But `currentPaths` is derived inside the render.
        // For Step 1, I'll copy the logic OR access the props.
        // Since these actions were defined inside the `renderInventoryGrid` closure in original code, they had access to `currentPaths`.
        // I need to reconstruct `currentPaths` here or pass it?
        // Actually, `doInjectProp` uses `currentPaths` which comes from `managerInspectorFileFilter?.paths` or fallback.
        // Let's see Dashboard logic.
        // In Dashboard, `currentPaths` was calculated right before these handlers.
        // I will duplicate the `currentPaths` calculation here.
        const key = managerInspectorKey!;
        const allPaths = managerScope === "trade"
            ? (managerTradeInventory?.keyPaths[key] ?? [])
            : (managerStrategyInventory?.keyPaths[key] ?? []);

        let currentPaths = allPaths;
        if (managerInspectorFileFilter) {
            currentPaths = managerInspectorFileFilter.paths;
        }

        const selectManagerFiles = (paths: string[]) => {
            const invFiles = managerScope === "trade" ? managerTradeInventoryFiles : managerStrategyInventoryFiles;
            if (!invFiles) return [];
            const map = new Map<string, FrontmatterFile>();
            for (const f of invFiles) map.set(f.path, f);
            return paths.map(p => map.get(p)).filter((x): x is FrontmatterFile => !!x);
        };

        const k =
            (await promptText?.({
                title: "注入属性：属性名",
                placeholder: "例如：市场周期/market_cycle",
                okText: "下一步",
                cancelText: "取消",
            })) ?? "";
        const newKey = k.trim();
        if (!newKey) return;
        const v =
            (await promptText?.({
                title: `注入属性：${newKey} 的值`,
                placeholder: "输入要注入的值",
                okText: "注入",
                cancelText: "取消",
            })) ?? "";
        const newVal = v.trim();
        if (!newVal) return;
        const ok =
            (await confirmDialog?.({
                title: "确认注入",
                message:
                    `将向 ${currentPaths.length} 个文件注入：\n` +
                    `${newKey}: ${newVal}`,
                okText: "确认",
                cancelText: "取消",
            })) ?? false;
        if (!ok) return;
        const plan = buildInjectPropPlan(
            selectManagerFiles(currentPaths),
            newKey,
            newVal
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            refreshInventory: true,
        });
    };

    const doUpdateVal = async (val: string, paths: string[]) => {
        const key = managerInspectorKey!;
        const selectManagerFiles = (paths: string[]) => {
            const invFiles = managerScope === "trade" ? managerTradeInventoryFiles : managerStrategyInventoryFiles;
            if (!invFiles) return [];
            const map = new Map<string, FrontmatterFile>();
            for (const f of invFiles) map.set(f.path, f);
            return paths.map(p => map.get(p)).filter((x): x is FrontmatterFile => !!x);
        };

        const n =
            (await promptText?.({
                title: `修改值 → ${key}`,
                defaultValue: val,
                placeholder: "输入新的值",
                okText: "修改",
                cancelText: "取消",
            })) ?? "";
        const next = n.trim();
        if (!next || next === val) return;
        const ok =
            (await confirmDialog?.({
                title: "确认修改",
                message:
                    `将 ${paths.length} 个文件中的\n` +
                    `${key}: ${val}\n` +
                    `修改为\n` +
                    `${key}: ${next}`,
                okText: "确认",
                cancelText: "取消",
            })) ?? false;
        if (!ok) return;
        const plan = buildUpdateValPlan(
            selectManagerFiles(paths),
            key,
            val,
            next
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            refreshInventory: true,
        });
    };

    const doDeleteVal = async (val: string, paths: string[]) => {
        const key = managerInspectorKey!;
        const selectManagerFiles = (paths: string[]) => {
            const invFiles = managerScope === "trade" ? managerTradeInventoryFiles : managerStrategyInventoryFiles;
            if (!invFiles) return [];
            const map = new Map<string, FrontmatterFile>();
            for (const f of invFiles) map.set(f.path, f);
            return paths.map(p => map.get(p)).filter((x): x is FrontmatterFile => !!x);
        };

        const ok =
            (await confirmDialog?.({
                title: "确认移除值",
                message:
                    `将从 ${paths.length} 个文件中移除：\n` +
                    `${key}: ${val}`,
                okText: "移除",
                cancelText: "取消",
            })) ?? false;
        if (!ok) return;
        const plan = buildDeleteValPlan(
            selectManagerFiles(paths),
            key,
            val,
            {
                deleteKeyIfEmpty: true,
            }
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            forceDeleteKeys: true,
            refreshInventory: true,
        });
    };

    const renderInventoryGrid = (
        inv: FrontmatterInventory | undefined,
        scope: "trade" | "strategy",
        title: string
    ) => {
        if (!inv) return null;

        const matchesSearch = (key: string) => {
            if (!q) return true;
            const kl = key.toLowerCase();
            if (kl.includes(q)) return true;
            if (qCanon && canonicalizeSearch(kl).includes(qCanon))
                return true;
            const vals = Object.keys(inv.valPaths[key] ?? {});
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

        const visibleKeys = inv.keys
            .map((k) => k.key)
            .filter((k) => matchesSearch(k));

        for (const key of visibleKeys) {
            const g = matchKeyToGroup(key);
            bucketed.get(g)!.push(key);
        }

        const groupEntries = [
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
                    <EmptyState
                        title="无匹配属性"
                        icon="🔍"
                        style={{ padding: SPACE.lg }}
                    />
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
                            <GlassPanel
                                key={`${scope}:${g.name}`}
                                style={{
                                    padding: "10px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: SPACE.sm,
                                }}
                            >
                                <div
                                    style={{
                                        fontWeight: 700,
                                        marginBottom: "4px",
                                        color: COLORS.text.muted,
                                        fontSize: "0.9em",
                                        paddingLeft: "4px"
                                    }}
                                >
                                    {g.name}
                                </div>
                                <div style={{ display: "grid", gap: "6px" }}>
                                    {g.keys.slice(0, 18).map((key) => {
                                        const countFiles = (inv.keyPaths[key] ?? []).length;
                                        const vals = Object.keys(inv.valPaths[key] ?? {});
                                        const topVals = vals
                                            .map((v) => ({
                                                v,
                                                c: (inv.valPaths[key]?.[v] ?? []).length,
                                            }))
                                            .sort((a, b) => b.c - a.c)
                                            .slice(0, 2);
                                        return (
                                            <button
                                                key={`${scope}:${key}`}
                                                type="button"
                                                onClick={() => {
                                                    setManagerScope(scope);
                                                    setManagerInspectorKey(key);
                                                    setManagerInspectorTab("vals");
                                                    setManagerInspectorFileFilter(undefined);
                                                }}
                                                onMouseEnter={onBtnMouseEnter}
                                                onMouseLeave={onBtnMouseLeave}
                                                onFocus={onBtnFocus}
                                                onBlur={onBtnBlur}
                                                style={{
                                                    border: `1px solid ${COLORS.border}`,
                                                    borderRadius: "10px",
                                                    padding: "10px",
                                                    background: "rgba(255,255,255,0.03)",
                                                    cursor: "pointer",
                                                    width: "100%",
                                                    textAlign: "left",
                                                    transition: "all 0.2s ease"
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontWeight: 650,
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        gap: "8px",
                                                        color: COLORS.text.normal,
                                                        marginBottom: "6px"
                                                    }}
                                                >
                                                    <span>{key}</span>
                                                    <span
                                                        style={{
                                                            fontSize: "0.85em",
                                                            color: COLORS.text.muted,
                                                            background: "rgba(0,0,0,0.2)",
                                                            padding: "2px 6px",
                                                            borderRadius: "4px"
                                                        }}
                                                    >
                                                        {countFiles}
                                                    </span>
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: "0.85em",
                                                        color: COLORS.text.faint,
                                                        display: "flex",
                                                        gap: "6px",
                                                        flexWrap: "wrap",
                                                        lineHeight: 1.3
                                                    }}
                                                >
                                                    {topVals.map((tv) => (
                                                        <span
                                                            key={tv.v}
                                                            style={{
                                                                background: "rgba(255,255,255,0.1)",
                                                                padding: "1px 5px",
                                                                borderRadius: "4px",
                                                            }}
                                                        >
                                                            {prettyVal(tv.v)} ({tv.c})
                                                        </span>
                                                    ))}
                                                    {vals.length > 2 ? (
                                                        <span>...</span>
                                                    ) : null}
                                                    {vals.length === 0 ? <span>(无值)</span> : null}
                                                </div>
                                            </button>
                                        );
                                    })}
                                    {g.keys.length > 18 ? (
                                        <div style={{ color: COLORS.text.faint, fontSize: "0.85em", paddingLeft: "4px" }}>
                                            及其他 {g.keys.length - 18} 个属性...
                                        </div>
                                    ) : null}
                                </div>
                            </GlassPanel>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <div style={{ marginBottom: SPACE.xl }}>
                <HeadingM>
                    📉 管理模块
                    <span
                        style={{
                            fontSize: "0.85em",
                            color: "var(--text-muted)",
                            fontWeight: "normal",
                            marginLeft: SPACE.md,
                        }}
                    >
                        Manage & Health
                    </span>
                </HeadingM>
            </div>

            <GlassCard style={{ marginBottom: SPACE.lg }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.md, marginBottom: SPACE.md }}>
                    <GlassPanel>
                        <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                            🏥 系统健康度 (System Health)
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                            <div style={{ fontSize: "2.4em", fontWeight: 800, color: healthColor, lineHeight: 1 }}>
                                {healthScore}
                            </div>
                            <div style={{ color: healthColor, fontWeight: 600 }}>
                                {issueCount === 0 ? "Excellent" : "Needs Review"}
                                <span style={{ marginLeft: "6px", fontSize: "0.8em", opacity: 0.8 }}>
                                    (V5 Standard)
                                </span>
                            </div>
                        </div>
                    </GlassPanel>

                    <GlassPanel>
                        <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                            🔍 系统诊断 (Diagnostics)
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.9em" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: COLORS.text.muted }}>Enum 预设:</span>
                                <span style={{ fontWeight: 600 }}>
                                    {enumPresets ? "✅ 有效" : "⚠️ 未加载"}
                                </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: COLORS.text.muted }}>Tag 扫描:</span>
                                <span style={{ fontWeight: 600 }}>{tags} 个标签</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: COLORS.text.muted }}>交易记录:</span>
                                <span style={{ fontWeight: 600 }}>{trades.length} 笔</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: COLORS.text.muted }}>笔记档案:</span>
                                <span style={{ fontWeight: 600 }}>{files} 个文件</span>
                            </div>
                        </div>
                    </GlassPanel>
                </div>

                {topTypes.length > 0 && (
                    <GlassPanel style={{ marginBottom: "12px" }}>
                        <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                            ⚠️ 异常类型分布
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {topTypes.map(([type, count]) => (
                                <div
                                    key={type}
                                    style={{
                                        background: "rgba(255, 50, 50, 0.1)",
                                        border: "1px solid rgba(255, 50, 50, 0.2)",
                                        borderRadius: "4px",
                                        padding: "2px 6px",
                                        fontSize: "0.85em",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px"
                                    }}
                                >
                                    <span style={{ color: V5_COLORS.loss }}>{type}</span>
                                    <span style={{ fontWeight: 700, opacity: 0.8 }}>{count}</span>
                                </div>
                            ))}
                        </div>
                    </GlassPanel>
                )}

                <div style={{ color: COLORS.text.muted, fontSize: "0.9em", lineHeight: 1.5 }}>
                    {schemaScanNote ?? "系统正在监控数据一致性..."}
                </div>
            </GlassCard>

            <GlassPanel style={{ marginBottom: SPACE.lg }}>
                <div style={{ marginBottom: "8px", fontWeight: 700 }}>
                    🔖 标签体系概览 (Tag System)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {topTags.map(([tag, count]) => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => openGlobalSearch?.(`tag:#${tag}`)}
                            style={buttonStyle}
                            title={`搜索 #${tag}`}
                        >
                            #{tag} <span style={{ opacity: 0.6 }}>({count})</span>
                        </button>
                    ))}
                </div>
            </GlassPanel>

            <GlassCard style={{ marginBottom: "12px" }}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: "10px",
                        marginBottom: "10px",
                    }}
                >
                    <div style={{ fontWeight: 800 }}>
                        📄 原始数据明细（Raw Data）
                    </div>
                    <div
                        style={{
                            color: "var(--text-faint)",
                            fontSize: "0.9em",
                        }}
                    >
                        最近 {sortedRecent.length} 笔
                    </div>
                </div>

                <GlassPanel
                    style={{
                        overflow: "auto",
                        maxHeight: "260px",
                    }}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "90px 110px 120px 1fr 100px 120px",
                            gap: "10px",
                            padding: "10px",
                            borderBottom:
                                "1px solid var(--background-modifier-border)",
                            color: "var(--text-faint)",
                            fontSize: "0.85em",
                            background: "var(--background-primary)",
                        }}
                    >
                        <div>日期</div>
                        <div>品种</div>
                        <div>周期</div>
                        <div>策略</div>
                        <div>结果</div>
                        <div>执行</div>
                    </div>

                    {sortedRecent.map((t) => (
                        <button
                            key={t.path}
                            type="button"
                            onClick={() => openFile(t.path)}
                            title={t.path}
                            onMouseEnter={onTextBtnMouseEnter}
                            onMouseLeave={onTextBtnMouseLeave}
                            onFocus={onTextBtnFocus}
                            onBlur={onTextBtnBlur}
                            style={{
                                width: "100%",
                                textAlign: "left",
                                padding: 0,
                                border: "none",
                                borderBottom:
                                    "1px solid var(--background-modifier-border)",
                                background: "transparent",
                                cursor: "pointer",
                                outline: "none",
                            }}
                        >
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "90px 110px 120px 1fr 100px 120px",
                                    gap: "10px",
                                    padding: "10px",
                                    alignItems: "baseline",
                                    fontSize: "0.9em",
                                }}
                            >
                                <div style={{ color: "var(--text-muted)" }}>
                                    {t.dateIso}
                                </div>
                                <div style={{ fontWeight: 650 }}>
                                    {t.ticker ?? "—"}
                                </div>
                                <div style={{ color: "var(--text-muted)" }}>
                                    {t.timeframe ?? "—"}
                                </div>
                                <div
                                    style={{
                                        color: "var(--text-muted)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                    title={t.setupKey ?? t.setupCategory ?? ""}
                                >
                                    {prettySchemaVal(t.setupKey ?? t.setupCategory) ||
                                        "—"}
                                </div>
                                <div style={{ color: "var(--text-muted)" }}>
                                    {t.outcome ?? "unknown"}
                                </div>
                                <div style={{ color: "var(--text-muted)" }}>
                                    {prettyExecVal(t.executionQuality) || "—"}
                                </div>
                            </div>
                        </button>
                    ))}
                </GlassPanel>
            </GlassCard>

            <GlassPanel style={{ marginBottom: "12px" }}>
                <details>
                    <summary
                        style={{
                            cursor: "pointer",
                            color: "var(--text-muted)",
                            fontWeight: 700,
                        }}
                    >
                        📊 分布统计 (Distribution Summary)
                    </summary>
                    <div style={{ marginTop: "12px" }}>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr 1fr",
                                gap: "16px",
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        marginBottom: "6px",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    品种 (Ticker)
                                </div>
                                {distTicker.map(([k, v]) => (
                                    <div
                                        key={k}
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            fontSize: "0.9em",
                                        }}
                                    >
                                        <span>{k}</span>
                                        <span style={{ opacity: 0.7 }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        marginBottom: "6px",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    策略 (Setup)
                                </div>
                                {distSetup.map(([k, v]) => (
                                    <div
                                        key={k}
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            fontSize: "0.9em",
                                        }}
                                    >
                                        <span>{k}</span>
                                        <span style={{ opacity: 0.7 }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        marginBottom: "6px",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    执行 (Exec)
                                </div>
                                {distExec.map(([k, v]) => (
                                    <div
                                        key={k}
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            fontSize: "0.9em",
                                        }}
                                    >
                                        <span>{k}</span>
                                        <span style={{ opacity: 0.7 }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </details>
            </GlassPanel>

            <GlassCard style={{ marginBottom: "10px" }}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "8px",
                    }}
                >
                    <div style={{ fontWeight: 800 }}>⚠️ 异常详情 (Exception Details)</div>
                    <div
                        style={{
                            color: "var(--text-faint)",
                            fontSize: "0.9em",
                        }}
                    >
                        {schemaIssues.length} 个待处理
                    </div>
                </div>

                {schemaIssues.length === 0 ? (
                    <EmptyState
                        title="系统运行正常"
                        message="未发现需要修复的元数据问题"
                        icon="✅"
                        style={{ padding: SPACE.md }}
                    />
                ) : (
                    <GlassPanel
                        style={{
                            maxHeight: "260px",
                            overflow: "auto",
                        }}
                    >
                        {schemaIssues.map((issue, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => openFile(issue.path)}
                                title={issue.path}
                                onMouseEnter={onTextBtnMouseEnter}
                                onMouseLeave={onTextBtnMouseLeave}
                                onFocus={onTextBtnFocus}
                                onBlur={onTextBtnBlur}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 140px 140px",
                                    gap: "10px",
                                    padding: "6px 8px",
                                    border: "none",
                                    borderBottom:
                                        "1px solid var(--background-modifier-border)",
                                    fontSize: "0.9em",
                                    textAlign: "left",
                                    width: "100%",
                                    background: "transparent",
                                    color: "var(--text-normal)",
                                    cursor: "pointer",
                                    outline: "none",
                                }}
                            >
                                <div
                                    style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {issue.name}
                                </div>
                                <div style={{ color: "var(--text-error)" }}>
                                    {issue.type}
                                </div>
                                <div style={{ color: "var(--text-muted)" }}>
                                    {issue.key}
                                </div>
                            </button>
                        ))}
                    </GlassPanel>
                )}
            </GlassCard>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: SPACE.md,
                    marginBottom: SPACE.md,
                }}
            >
                {[
                    {
                        title: "系统健康度",
                        value: String(healthScore),
                        color: healthColor,
                    },
                    {
                        title: "待修异常",
                        value: String(issueCount),
                        color:
                            issueCount > 0 ? COLORS.loss : COLORS.text.muted,
                    },
                    {
                        title: "标签总数",
                        value: String(tags),
                        color: COLORS.accent,
                    },
                    {
                        title: "笔记档案",
                        value: String(files),
                        color: COLORS.accent,
                    },
                ].map((c) => (
                    <GlassPanel key={c.title} style={{ textAlign: "center" }}>
                        <div style={{ color: COLORS.text.muted, fontSize: "0.9em", marginBottom: SPACE.xs }}>
                            {c.title}
                        </div>
                        <DisplayXL style={{ color: c.color }}>
                            {c.value}
                        </DisplayXL>
                    </GlassPanel>
                ))}
            </div>

            <GlassPanel style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: SPACE.md }}>
                <div style={{ fontWeight: 800, color: healthColor, display: "flex", alignItems: "center", gap: SPACE.md }}>
                    <span>{issueCount === 0 ? "✅ 系统非常健康" : "⚠️ 系统需要修复"}</span>
                    <StatusBadge
                        label={issueCount === 0 ? "AI Clear" : "Needs Attention"}
                        tone={issueCount === 0 ? "success" : "warn"}
                    />
                </div>
                <div style={{ color: COLORS.text.muted, fontSize: "0.9em" }}>
                    {issueCount === 0
                        ? "所有关键属性已规范填写"
                        : "建议优先处理异常详情中的缺失字段"}
                </div>
            </GlassPanel>

            <details style={{ marginTop: "12px" }}>
                <summary
                    style={{
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontWeight: 700,
                    }}
                >
                    🔎 检查器（Inspector）与修复方案预览（可展开）
                </summary>

                <div style={{ marginTop: "12px" }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            marginBottom: "8px",
                        }}
                    >
                        <div style={{ fontWeight: 700 }}>检查器问题列表</div>
                        <ButtonGhost
                            onClick={() => setShowFixPlan((v) => !v)}
                            disabled={!enumPresets}
                        >
                            {showFixPlan ? "隐藏修复方案" : "预览修复方案"}
                        </ButtonGhost>
                    </div>

                    <div
                        style={{
                            background: "var(--background-primary)",
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "8px",
                            padding: "10px",
                            maxHeight: "300px",
                            overflow: "auto",
                            fontSize: "0.9em",
                        }}
                    >
                        {inspectorIssues.length === 0 ? (
                            <div style={{ color: "var(--text-muted)" }}>
                                （无检查器警告）
                            </div>
                        ) : (
                            inspectorIssues.map((it, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        borderBottom:
                                            "1px solid var(--background-modifier-border)",
                                        marginBottom: "4px",
                                        paddingBottom: "4px",
                                    }}
                                >
                                    <div style={{ fontWeight: 600 }}>{it.key}</div>
                                    <div style={{ display: "flex", gap: "8px" }}>
                                        <span style={{ opacity: 0.7 }}>
                                            {it.path.split("/").pop()}
                                        </span>
                                        <span
                                            style={{
                                                color:
                                                    it.type.includes("❌") ||
                                                        it.type.includes("Invalid")
                                                        ? "var(--text-error)"
                                                        : "var(--text-warning)",
                                            }}
                                        >
                                            {it.type}
                                        </span>
                                    </div>
                                    {it.val ? (
                                        <div style={{ fontFamily: "monospace", opacity: 0.8 }}>
                                            Current: {it.val}
                                        </div>
                                    ) : null}
                                </div>
                            ))
                        )}
                    </div>

                    {showFixPlan && enumPresets ? (
                        <div style={{ marginTop: "16px" }}>
                            <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                                自动修复方案 (Preview)
                            </div>
                            <pre
                                style={{
                                    background: "var(--background-primary)",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    overflow: "auto",
                                    maxHeight: "400px",
                                    fontSize: "0.85em",
                                }}
                            >
                                {fixPlanText ?? "Generating..."}
                            </pre>
                        </div>
                    ) : !enumPresets ? (
                        <div style={{ marginTop: "16px", color: "var(--text-error)" }}>
                            枚举预设不可用，无法生成修复方案。
                        </div>
                    ) : null}
                </div>
            </details>

            <GlassCard style={{ marginTop: SPACE.xl, marginBottom: SPACE.xl }}>
                <div style={{ marginBottom: "16px" }}>
                    <HeadingM>🛠️ 属性管理器 (Property Manager v5.0)</HeadingM>
                    <div
                        style={{
                            color: COLORS.text.muted,
                            marginTop: "4px",
                            fontSize: "0.9em",
                        }}
                    >
                        直接管理 Vault 内的 Frontmatter 属性。危险操作，请谨慎。
                    </div>
                </div>

                <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                    <ButtonGhost
                        disabled={managerBusy}
                        onClick={() => void scanManagerInventory()}
                    >
                        🔄 扫描属性
                    </ButtonGhost>
                    <div
                        style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                            padding: "0 10px",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: "8px",
                            background:
                                managerDeleteKeys && !managerBackups
                                    ? "rgba(255, 50, 50, 0.1)"
                                    : "transparent",
                        }}
                    >
                        <input
                            type="checkbox"
                            id="mgr-del-confirm"
                            checked={managerDeleteKeys}
                            onChange={(e) => setManagerDeleteKeys(e.target.checked)}
                            disabled={managerBusy}
                        />
                        <label
                            htmlFor="mgr-del-confirm"
                            style={{
                                fontSize: "0.9em",
                                color: managerDeleteKeys
                                    ? COLORS.loss
                                    : COLORS.text.muted,
                                fontWeight: managerDeleteKeys ? 700 : 400,
                            }}
                        >
                            允许执行删除/覆写操作
                        </label>
                    </div>
                </div>

                {managerBusy && (
                    <div style={{ color: COLORS.accent, marginBottom: "10px" }}>
                        ⏳ 正在处理...
                    </div>
                )}

                {managerResult ? (
                    <GlassPanel
                        style={{
                            marginBottom: "16px",
                            background:
                                managerResult.failed > 0
                                    ? "rgba(255, 50, 50, 0.1)"
                                    : "rgba(50, 255, 50, 0.1)",
                        }}
                    >
                        <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                            执行结果
                        </div>
                        <div>成功: {managerResult.applied}</div>
                        <div>失败: {managerResult.failed}</div>
                        {managerResult.errors && managerResult.errors.length > 0 && (
                            <div
                                style={{
                                    marginTop: "8px",
                                    maxHeight: "120px",
                                    overflow: "auto",
                                    color: COLORS.loss,
                                }}
                            >
                                {managerResult.errors.slice(0, 5).map((e, i) => (
                                    <div key={i}>
                                        {e.path}: {e.message}
                                    </div>
                                ))}
                            </div>
                        )}
                        {managerBackups && (
                            <div style={{ marginTop: "10px" }}>
                                <ButtonGhost
                                    disabled={true}
                                    onClick={() => window.alert("Restore not implemented in this UI yet")}
                                >
                                    (备份已建立，需手动恢复)
                                </ButtonGhost>
                            </div>
                        )}
                    </GlassPanel>
                ) : null}

                <div style={{ display: "flex", gap: SPACE.md, marginBottom: SPACE.md }}>
                    <input
                        type="text"
                        placeholder="搜索属性 (Search Keys)..."
                        value={managerSearch}
                        onChange={(e) => setManagerSearch(e.target.value)}
                        style={{
                            flex: 1,
                            padding: "8px",
                            borderRadius: "8px",
                            border: `1px solid ${COLORS.border}`,
                            background: "var(--background-primary)",
                            color: "var(--text-normal)",
                        }}
                    />
                </div>

                {managerInspectorKey ? (
                    <div style={{ marginBottom: "16px" }}>
                        <GlassPanel
                            style={{
                                border: `1px solid ${COLORS.accent}`,
                                background: "rgba(var(--mono-rgb-100), 0.05)",
                                display: "flex",
                                flexDirection: "column",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "12px 16px",
                                    borderBottom: `1px solid ${COLORS.border}`,
                                    background: "rgba(0,0,0,0.1)",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        gap: "8px",
                                        alignItems: "baseline",
                                    }}
                                >
                                    <span style={{ fontWeight: 700, fontSize: "1.1em" }}>
                                        {managerInspectorKey}
                                    </span>
                                    <span style={{ fontSize: "0.85em", opacity: 0.7 }}>
                                        (Key Inspector)
                                    </span>
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <ButtonGhost
                                        disabled={managerBusy}
                                        onClick={() => void doRenameKey()}
                                    >
                                        ✏️ 重命名 Key
                                    </ButtonGhost>
                                    <ButtonGhost
                                        disabled={managerBusy}
                                        onClick={() => void doDeleteKey()}
                                        style={{ color: COLORS.loss, borderColor: COLORS.loss }}
                                    >
                                        🗑️ 删除 Key
                                    </ButtonGhost>
                                    <ButtonGhost
                                        onClick={() => {
                                            setManagerInspectorKey(undefined);
                                            setManagerInspectorTab("vals");
                                            setManagerInspectorFileFilter(undefined);
                                        }}
                                    >
                                        ✕ 关闭
                                    </ButtonGhost>
                                </div>
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    borderBottom: `1px solid ${COLORS.border}`,
                                }}
                            >
                                <button
                                    type="button"
                                    style={{
                                        flex: 1,
                                        padding: "10px",
                                        background:
                                            managerInspectorTab === "vals"
                                                ? "rgba(255,255,255,0.1)"
                                                : "transparent",
                                        border: "none",
                                        color:
                                            managerInspectorTab === "vals"
                                                ? COLORS.text.normal
                                                : COLORS.text.muted,
                                        cursor: "pointer",
                                        fontWeight: managerInspectorTab === "vals" ? 700 : 400,
                                    }}
                                    onClick={() => setManagerInspectorTab("vals")}
                                >
                                    值分布 (Values)
                                </button>
                                <button
                                    type="button"
                                    style={{
                                        flex: 1,
                                        padding: "10px",
                                        background:
                                            managerInspectorTab === "files"
                                                ? "rgba(255,255,255,0.1)"
                                                : "transparent",
                                        border: "none",
                                        color:
                                            managerInspectorTab === "files"
                                                ? COLORS.text.normal
                                                : COLORS.text.muted,
                                        cursor: "pointer",
                                        fontWeight: managerInspectorTab === "files" ? 700 : 400,
                                    }}
                                    onClick={() => setManagerInspectorTab("files")}
                                >
                                    文件列表 (Files)
                                </button>
                            </div>

                            <div style={{ padding: "16px" }}>
                                {(() => {
                                    const key = managerInspectorKey;
                                    const inv =
                                        managerScope === "trade"
                                            ? managerTradeInventory
                                            : managerStrategyInventory;
                                    const allPaths = inv?.keyPaths[key] ?? [];
                                    const valMap = inv?.valPaths[key] ?? {};
                                    const vals = Object.keys(valMap).sort((a, b) =>
                                        valMap[b].length - valMap[a].length
                                    );

                                    // Computed logic for filtered paths
                                    const filterLabel = managerInspectorFileFilter?.label;
                                    const currentPaths = managerInspectorFileFilter?.paths ?? allPaths;

                                    if (managerInspectorTab === "vals") {
                                        return (
                                            <div>
                                                {vals.length === 0 ? (
                                                    <div style={{ opacity: 0.7 }}>
                                                        此属性存在，但所有文件中均无值（null/empty）。
                                                    </div>
                                                ) : (
                                                    vals.map((val) => {
                                                        const paths = valMap[val] ?? [];
                                                        const pct = Math.round(
                                                            (paths.length / allPaths.length) * 100
                                                        );
                                                        return (
                                                            <GlassPanel
                                                                key={val}
                                                                style={{
                                                                    marginBottom: "8px",
                                                                    display: "flex",
                                                                    justifyContent: "space-between",
                                                                    alignItems: "center",
                                                                    padding: "8px 12px",
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        gap: "10px",
                                                                        alignItems: "baseline",
                                                                        flex: 1,
                                                                        overflow: "hidden",
                                                                    }}
                                                                >
                                                                    <span
                                                                        style={{
                                                                            fontFamily: "monospace",
                                                                            fontWeight: 600,
                                                                            overflow: "hidden",
                                                                            textOverflow: "ellipsis",
                                                                            whiteSpace: "nowrap",
                                                                        }}
                                                                        title={val}
                                                                    >
                                                                        {prettyVal(val) || val}
                                                                    </span>
                                                                    <span style={{ color: COLORS.text.muted, fontVariantNumeric: "tabular-nums" }}>
                                                                        {paths.length}
                                                                    </span>
                                                                </div>
                                                                <div style={{ display: "flex", gap: SPACE.sm }}>
                                                                    <ButtonGhost
                                                                        disabled={managerBusy}
                                                                        onClick={() => void doUpdateVal(val, paths)}
                                                                        title="修改"
                                                                    >
                                                                        ✏️
                                                                    </ButtonGhost>
                                                                    <ButtonGhost
                                                                        disabled={managerBusy}
                                                                        onClick={() => void doDeleteVal(val, paths)}
                                                                        title="删除"
                                                                    >
                                                                        🗑️
                                                                    </ButtonGhost>
                                                                    <ButtonGhost
                                                                        onClick={() => {
                                                                            setManagerInspectorFileFilter({
                                                                                paths,
                                                                                label: `${key} = ${val}`
                                                                            });
                                                                            setManagerInspectorTab("files");
                                                                        }}
                                                                        title="查看文件"
                                                                    >
                                                                        👁️
                                                                    </ButtonGhost>
                                                                </div>
                                                            </GlassPanel>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        );
                                    } else {
                                        return (
                                            <div style={{ display: "grid", gap: SPACE.sm }}>
                                                {filterLabel ? (
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "center",
                                                            color: COLORS.accent,
                                                            fontWeight: 700,
                                                            padding: "8px 12px",
                                                            border: `1px solid ${COLORS.border}`,
                                                            borderRadius: "8px",
                                                            background: "rgba(0,0,0,0.1)",
                                                        }}
                                                    >
                                                        <span>🔍 筛选: {filterLabel}</span>
                                                        <ButtonGhost onClick={() => setManagerInspectorFileFilter(undefined)}>
                                                            ✕ 重置
                                                        </ButtonGhost>
                                                    </div>
                                                ) : null}

                                                {currentPaths.slice(0, 200).map((p) => (
                                                    <button
                                                        key={`mgr-v5-file-${p}`}
                                                        type="button"
                                                        onClick={() => void openFile?.(p)}
                                                        title={p}
                                                        onMouseEnter={onBtnMouseEnter}
                                                        onMouseLeave={onBtnMouseLeave}
                                                        onFocus={onBtnFocus}
                                                        onBlur={onBtnBlur}
                                                        style={{
                                                            textAlign: "left",
                                                            border: `1px solid ${COLORS.border}`,
                                                            borderRadius: "8px",
                                                            padding: "10px",
                                                            background: "rgba(255,255,255,0.03)",
                                                            cursor: "pointer",
                                                            color: COLORS.text.normal,
                                                            width: "100%"
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: 700 }}>{p.split("/").pop()}</div>
                                                        <div style={{ color: COLORS.text.muted, fontSize: "0.85em", opacity: 0.8 }}>{p}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    }
                                })()}
                            </div>

                            <div
                                style={{
                                    padding: "12px 16px",
                                    borderTop: `1px solid ${COLORS.border}`,
                                    display: "flex",
                                    gap: SPACE.sm,
                                    justifyContent: "flex-end",
                                    background: "rgba(0,0,0,0.1)",
                                }}
                            >
                                {managerInspectorTab === "vals" ? (
                                    <>
                                        <ButtonGhost
                                            disabled={managerBusy}
                                            onClick={() => void doRenameKey()}
                                        >
                                            ✏️ 重命名
                                        </ButtonGhost>
                                        <ButtonGhost
                                            disabled={managerBusy}
                                            onClick={() => void doAppendVal()}
                                        >
                                            ➕ 追加新值
                                        </ButtonGhost>
                                    </>
                                ) : (
                                    <ButtonGhost
                                        disabled={managerBusy}
                                        onClick={() => void doInjectProp()}
                                    >
                                        💉 注入属性
                                    </ButtonGhost>
                                )}
                            </div>
                        </GlassPanel>
                    </div>
                ) : null}

                {renderInventoryGrid(managerTradeInventory, "trade", "交易笔记 (Trades)")}
            </GlassCard>

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
                <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                    导出
                </div>
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
                    <button
                        type="button"
                        disabled={!runCommand}
                        onClick={() =>
                            runCommand?.("al-brooks-console:export-legacy-snapshot")
                        }
                        style={runCommand ? buttonStyle : disabledButtonStyle}
                    >
                        导出旧版兼容快照 (pa-db-export.json)
                    </button>
                    <button
                        type="button"
                        disabled={!runCommand}
                        onClick={() =>
                            runCommand?.("al-brooks-console:export-index-snapshot")
                        }
                        style={runCommand ? buttonStyle : disabledButtonStyle}
                    >
                        导出索引快照 (Index Snapshot)
                    </button>
                </div>

                <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                    v5.0 在页面底部提供“一键备份数据库”按钮（写入
                    pa-db-export.json）。插件版 目前提供两类导出：旧版兼容快照（写入
                    vault 根目录 pa-db-export.json）与索引快照（导出到
                    Exports/al-brooks-console/）。
                </div>
            </div>
        </>
    );
};

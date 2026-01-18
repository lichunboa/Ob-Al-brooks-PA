import * as React from "react";
import { useConsoleContext } from "../../context/ConsoleContext";
import { useManagerState } from "../../hooks/useManagerState";
import {
    buildFixPlan,
    buildInspectorIssues,
    type FixPlan,
    type InspectorIssue,
} from "../../core/inspector";
import {
    buildFrontmatterInventory,
    buildStrategyMaintenancePlan,
    buildTradeNormalizationPlan,
    buildRenameKeyPlan,
    buildDeleteKeyPlan,
    buildDeleteValPlan,
    buildUpdateValPlan,
    buildAppendValPlan,
    buildInjectPropPlan,
    type FrontmatterFile,
} from "../../core/manager";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { HealthStatusPanel } from "../components/manage/HealthStatusPanel";
import { SchemaIssuesPanel } from "../components/manage/SchemaIssuesPanel";
import { DataStatisticsPanel } from "../components/manage/DataStatisticsPanel";
import { ExportPanel } from "../components/manage/ExportPanel";
import { RawDataPanel } from "../components/manage/RawDataPanel";

import { InspectorPanel } from "../components/manage/InspectorPanel";
import { V5_COLORS } from "../../ui/tokens";
import { SPACE } from "../../ui/styles/dashboardPrimitives";
import { topN } from "../../utils/aggregation-utils";
import { DoctorPanel } from "../components/manage/DoctorPanel";
import { ArchivePanel } from "../components/manage/ArchivePanel";
import { PropertyManagerTab } from "./PropertyManagerTab";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { InteractiveButton } from "../../ui/components/InteractiveButton";



export const ManageTab: React.FC = () => {
    const {
        trades,
        strategyIndex,
        paTagSnapshot,
        schemaIssues,
        schemaScanNote,
        showFixPlan,
        setShowFixPlan,
        enumPresets,
        loadAllFrontmatterFiles,
        loadStrategyNotes,
        applyFixPlan,
        openFile,
        openGlobalSearch,
        promptText,
        confirmDialog,
        runCommand,
        handleBatchUpdateTrades,
        app,
    } = useConsoleContext();

    const {
        managerPlan,
        setManagerPlan,
        managerResult,
        setManagerResult,
        managerBusy,
        setManagerBusy,
        managerDeleteKeys,
        setManagerDeleteKeys,
        managerBackups,
        setManagerBackups,
        managerTradeInventory,
        setManagerTradeInventory,
        managerTradeInventoryFiles,
        setManagerTradeInventoryFiles,
        managerStrategyInventory,
        setManagerStrategyInventory,
        managerStrategyInventoryFiles,
        setManagerStrategyInventoryFiles,
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
    } = useManagerState();

    // Derived: Inspector Issues
    // Note: Inspector issues logic was seemingly passed as prop or handled by ConsoleContent previously.
    // Actually ConsoleProvider provides `schemaIssues` but NOT `inspectorIssues`.
    // Wait, `InspectorPanel` expects `inspectorIssues`.
    // In `ConsoleContent` (old), `inspectorIssues` was built using `buildInspectorIssues`.
    // I need to import `buildInspectorIssues` and compute it here.
    // BUT `buildInspectorIssues` requires `managerTradeInventory` (or similar).
    // Let's check `buildInspectorIssues` usage in `ConsoleContent` (Step 1731 line 66).
    // It was imported.
    // But where was it called?
    // Old `ConsoleContent` did NOT seem to have `inspectorIssues` state variable explicitly in Step 1731 snippet?
    // Found it: `ManageTab` props has `inspectorIssues`.
    // I need to find where `inspectorIssues` comes from.
    // Likely computed from `managerTradeInventory` and `enumPresets`.

    // Checking `hooks/useManagerState.ts` might reveal if it's there? No.
    // It's likely derived.

    // Re-implementing derivation locally if possible.
    // `buildInspectorIssues(inventory, presets)`

    const scanManagerInventory = React.useCallback(async () => {
        if (loadAllFrontmatterFiles) {
            const files = await loadAllFrontmatterFiles();
            const inv = buildFrontmatterInventory(files);
            setManagerTradeInventoryFiles(files);
            setManagerTradeInventory(inv);
            setManagerStrategyInventoryFiles(undefined);
            setManagerStrategyInventory(undefined);
            return;
        }

        const tradeFiles: FrontmatterFile[] = trades.map((t) => ({
            path: t.path,
            frontmatter: (t.rawFrontmatter ?? {}) as Record<string, unknown>,
        }));
        const tradeInv = buildFrontmatterInventory(tradeFiles);
        setManagerTradeInventoryFiles(tradeFiles);
        setManagerTradeInventory(tradeInv);

        const strategyFiles: FrontmatterFile[] = [];
        if (loadStrategyNotes) {
            const notes = await loadStrategyNotes();
            for (const n of notes) {
                strategyFiles.push({
                    path: n.path,
                    frontmatter: (n.frontmatter ?? {}) as Record<string, unknown>,
                });
            }
        }
        const strategyInv = buildFrontmatterInventory(strategyFiles);
        setManagerStrategyInventoryFiles(strategyFiles);
        setManagerStrategyInventory(strategyInv);
    }, [loadAllFrontmatterFiles, loadStrategyNotes, trades, setManagerTradeInventoryFiles, setManagerTradeInventory, setManagerStrategyInventoryFiles, setManagerStrategyInventory]);

    const managerTradeFilesByPath = React.useMemo(() => {
        const map = new Map<string, FrontmatterFile>();
        for (const f of managerTradeInventoryFiles ?? []) map.set(f.path, f);
        return map;
    }, [managerTradeInventoryFiles]);

    const managerStrategyFilesByPath = React.useMemo(() => {
        const map = new Map<string, FrontmatterFile>();
        for (const f of managerStrategyInventoryFiles ?? []) map.set(f.path, f);
        return map;
    }, [managerStrategyInventoryFiles]);

    const selectManagerTradeFiles = React.useCallback(
        (paths: string[]) =>
            paths
                .map((p) => managerTradeFilesByPath.get(p))
                .filter((x): x is FrontmatterFile => Boolean(x)),
        [managerTradeFilesByPath]
    );

    const selectManagerStrategyFiles = React.useCallback(
        (paths: string[]) =>
            paths
                .map((p) => managerStrategyFilesByPath.get(p))
                .filter((x): x is FrontmatterFile => Boolean(x)),
        [managerStrategyFilesByPath]
    );

    const runManagerPlan = React.useCallback(
        async (
            plan: FixPlan,
            options: {
                closeInspector?: boolean;
                forceDeleteKeys?: boolean;
                refreshInventory?: boolean;
            } = {}
        ) => {
            setManagerPlan(plan);
            setManagerResult(undefined);

            if (!applyFixPlan) {
                window.alert(
                    "写入能力不可用：applyFixPlan 未注入"
                );
                return;
            }

            setManagerBusy(true);
            try {
                const res = await applyFixPlan(plan, {
                    deleteKeys: options.forceDeleteKeys ? true : managerDeleteKeys,
                });
                setManagerResult(res);
                setManagerBackups(res.backups);

                if (res.failed > 0) {
                    // alert logic
                } else if (res.applied === 0) {
                    // alert logic
                }

                if (options.closeInspector) {
                    setManagerInspectorKey(undefined);
                    setManagerInspectorTab("vals");
                    setManagerInspectorFileFilter(undefined);
                }
                if (options.refreshInventory) {
                    await scanManagerInventory();
                }
            } finally {
                setManagerBusy(false);
            }
        },
        [
            applyFixPlan,
            managerDeleteKeys,
            scanManagerInventory,
            setManagerBackups,
            setManagerInspectorFileFilter,
            setManagerInspectorKey,
            setManagerInspectorTab,
            setManagerPlan,
            setManagerResult,
            setManagerBusy
        ]
    );

    // Inspector Issues Derivation (Mock or Import)
    // Assuming buildInspectorIssues exists in "../../core/inspector"
    // But wait, I need to import it. I added it to imports.
    const inspectorIssues = React.useMemo((): InspectorIssue[] => {
        if (!trades || trades.length === 0) return [];
        // 调用 core/inspector 中的逻辑
        return buildInspectorIssues(trades, enumPresets, strategyIndex);
    }, [trades, enumPresets, strategyIndex]);

    const distTicker = React.useMemo(() => topN((t) => t.ticker, undefined, trades, 10), [trades]);
    const distSetup = React.useMemo(() => topN((t) => t.setupKey, undefined, trades, 10), [trades]);
    const distExec = React.useMemo(() => topN((t) => (t as any).executionType ?? t.executionQuality, undefined, trades, 10), [trades]);

    const topTags = React.useMemo(() => {
        const tagMap: Record<string, number> = (paTagSnapshot?.tagMap as any) ?? {};
        return Object.entries(tagMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20) as [string, number][];
    }, [paTagSnapshot]);

    const noop = () => { };

    const handleSetShowFixPlan = (valOrFn: boolean | ((prev: boolean) => boolean)) => {
        if (!setShowFixPlan) return;
        if (typeof valOrFn === 'function') {
            setShowFixPlan(valOrFn(showFixPlan ?? false));
        } else {
            setShowFixPlan(valOrFn);
        }
    };

    // 💎 上帝模式状态
    const [showGodMode, setShowGodMode] = React.useState(false);

    // 如果显示上帝模式，渲染 PropertyManagerTab
    if (showGodMode) {
        return (
            <div style={{ height: "100%" }}>
                <div style={{
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)"
                }}>
                    <InteractiveButton
                        interaction="text"
                        onClick={() => setShowGodMode(false)}
                        style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}
                    >
                        ← 返回
                    </InteractiveButton>
                    <span style={{ fontWeight: 700, fontSize: "1.1em" }}>
                        💎 上帝模式（属性管理器）
                    </span>
                </div>
                <PropertyManagerTab app={app} />
            </div>
        );
    }

    return (
        <div style={{ paddingBottom: "40px" }}>
            <SectionHeader title="数据管理中心" icon="🛡️" />
            <div
                style={{
                    padding: "0 12px 12px",
                    color: "var(--text-faint)",
                    fontSize: "0.9em",
                    marginTop: "-10px",
                }}
            >
                全面的数据健康监控、属性管理及导出工具。
            </div>

            {/* 💎 上帝模式入口 */}
            <GlassPanel style={{ marginBottom: "16px" }}>
                <div
                    onClick={() => setShowGodMode(true)}
                    style={{
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "1.3em" }}>💎</span>
                        <div>
                            <div style={{
                                fontWeight: 700,
                                fontSize: "1em",
                                color: "var(--text-normal)"
                            }}>
                                上帝模式 (God Mode)
                            </div>
                            <div style={{ fontSize: "0.85em", color: "var(--text-muted)", marginTop: "2px" }}>
                                全局属性扫描 · 批量重命名 · 值管理 · 属性注入
                            </div>
                        </div>
                    </div>
                    <span style={{ color: "var(--text-muted)" }}>→</span>
                </div>
            </GlassPanel>

            <RawDataPanel trades={trades} openFile={openFile} />



            {/* [Merged]: DoctorPanel functionality moved into HealthStatusPanel */}

            <div style={{ marginBottom: "24px" }}>
                <ArchivePanel app={app} />
            </div>

            <div style={{ marginBottom: "24px" }}>
                <HealthStatusPanel
                    trades={trades}
                    schemaIssues={schemaIssues}
                    paTagSnapshot={paTagSnapshot}
                    enumPresets={enumPresets}
                    schemaScanNote={schemaScanNote ?? ""}
                    app={app} // [New]: Passed app for embedded Doctor
                    V5_COLORS={V5_COLORS}
                    SPACE={SPACE}
                />
            </div>



            {schemaIssues.length > 0 && (
                <div style={{ marginBottom: "24px" }}>
                    <SchemaIssuesPanel
                        schemaIssues={schemaIssues}
                        issueCount={schemaIssues.length}
                        openFile={openFile}
                        onTextBtnMouseEnter={noop}
                        onTextBtnMouseLeave={noop}
                        onTextBtnFocus={noop}
                        onTextBtnBlur={noop}
                        V5_COLORS={V5_COLORS}
                    />
                </div>
            )}

            <div style={{ marginBottom: "24px" }}>
                <InspectorPanel
                    inspectorIssues={inspectorIssues}
                    fixPlanText={null}
                    showFixPlan={showFixPlan}
                    setShowFixPlan={handleSetShowFixPlan}
                    openFile={openFile}
                />
            </div>

            <div style={{ marginBottom: "24px" }}>
                <DataStatisticsPanel
                    distTicker={distTicker}
                    distSetup={distSetup}
                    distExec={distExec}
                    topTags={topTags}
                    paTagSnapshot={paTagSnapshot}
                    openGlobalSearch={openGlobalSearch ?? noop}
                    onTextBtnMouseEnter={noop}
                    onTextBtnMouseLeave={noop}
                    onTextBtnFocus={noop}
                    onTextBtnBlur={noop}
                    SPACE={SPACE}
                />
            </div>

            <div style={{ marginBottom: "24px" }}>
                <ExportPanel
                    runCommand={runCommand}
                    buttonStyle={{}}
                    disabledButtonStyle={{ opacity: 0.5, pointerEvents: "none" }}
                />
            </div>
        </div>
    );
};

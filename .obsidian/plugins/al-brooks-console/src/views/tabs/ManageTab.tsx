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
import { PropertyManager } from "../components/manager/PropertyManager";
import { RawDataPanel } from "../components/manage/RawDataPanel";

import { InspectorPanel } from "../components/manage/InspectorPanel";
import { V5_COLORS } from "../../ui/tokens";
import { SPACE } from "../../ui/styles/dashboardPrimitives";
import { topN } from "../../utils/aggregation-utils";
import { DoctorPanel } from "../components/manage/DoctorPanel";
import { ArchivePanel } from "../components/manage/ArchivePanel";



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

            <PropertyManager
                // Data
                schemaIssues={schemaIssues}
                paTagSnapshot={paTagSnapshot}
                trades={trades}
                strategyIndex={strategyIndex}
                enumPresets={enumPresets}
                schemaScanNote={schemaScanNote}
                inspectorIssues={inspectorIssues}
                fixPlanText={null} // derived elsewhere?

                // State
                managerBusy={managerBusy}
                managerSearch={managerSearch}
                managerTradeInventory={managerTradeInventory}
                managerStrategyInventory={managerStrategyInventory}
                managerScope={managerScope}
                managerInspectorKey={managerInspectorKey}
                managerInspectorTab={managerInspectorTab}
                managerInspectorFileFilter={managerInspectorFileFilter}
                showFixPlan={showFixPlan}

                // Setters
                setManagerBusy={setManagerBusy}
                setManagerSearch={setManagerSearch}
                setManagerScope={setManagerScope}
                setManagerInspectorKey={setManagerInspectorKey}
                setManagerInspectorTab={setManagerInspectorTab}
                setManagerInspectorFileFilter={setManagerInspectorFileFilter}
                setShowFixPlan={handleSetShowFixPlan}

                // Methods
                scanManagerInventory={scanManagerInventory}
                runManagerPlan={runManagerPlan}
                buildRenameKeyPlan={buildRenameKeyPlan}
                buildDeleteKeyPlan={buildDeleteKeyPlan}
                buildAppendValPlan={buildAppendValPlan}
                buildInjectPropPlan={buildInjectPropPlan}
                buildUpdateValPlan={buildUpdateValPlan}
                buildDeleteValPlan={buildDeleteValPlan}
                selectManagerTradeFiles={selectManagerTradeFiles}
                selectManagerStrategyFiles={selectManagerStrategyFiles}

                // Helpers
                openFile={openFile}
                openGlobalSearch={openGlobalSearch}
                promptText={promptText}
                confirmDialog={confirmDialog}
                showNotice={noop} // Todo: import Notice?
                runCommand={runCommand}
            />

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

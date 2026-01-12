import * as React from "react";
import type { TradeRecord } from "../../core/contracts";
import type { EnumPresets } from "../../core/enum-presets";
import type { FrontmatterInventory } from "../../core/manager";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { HealthStatusPanel } from "../components/manage/HealthStatusPanel";
import { SchemaIssuesPanel } from "../components/manage/SchemaIssuesPanel";
import { DataStatisticsPanel } from "../components/manage/DataStatisticsPanel";
import { ExportPanel } from "../components/manage/ExportPanel";
import { PropertyManager } from "../components/manager/PropertyManager";
import { RawDataPanel } from "../components/manage/RawDataPanel";
import { InspectorPanel } from "../components/manage/InspectorPanel";
import { ActionServiceTestPanel } from "../components/manage/ActionServiceTestPanel";
import { BatchUpdateTestPanel } from "../components/manage/BatchUpdateTestPanel";
import { BatchEditPanel } from "../components/manage/BatchEditPanel";
import { HistoryViewer } from "../components/manage/HistoryViewer";
import { QuickActionsPanel } from "../components/manage/QuickActionsPanel";
import type { InspectorIssue } from "../../core/inspector";
import type { PaTagSnapshot, SchemaIssueItem } from "../../types";
import { V5_COLORS } from "../../ui/tokens";
import { SPACE } from "../../ui/styles/dashboardPrimitives";
import { topN } from "../../utils/aggregation-utils";

/**
 * ManageTab Props接口
 */
export interface ManageTabProps {
    // TradeIndex (用于ActionService测试)
    index?: any;

    // 数据
    schemaIssues: SchemaIssueItem[];
    paTagSnapshot: PaTagSnapshot | undefined;
    trades: TradeRecord[];
    strategyIndex: any; // StrategyIndex类型
    enumPresets?: EnumPresets | undefined;
    schemaScanNote?: string;
    inspectorIssues: InspectorIssue[];
    fixPlanText?: string | null;

    // Manager状态
    managerBusy: boolean;
    managerSearch: string;
    managerTradeInventory: FrontmatterInventory | undefined;
    managerStrategyInventory: FrontmatterInventory | undefined;
    managerScope: "trade" | "strategy";
    managerInspectorKey: string | undefined;
    managerInspectorTab: "vals" | "files";
    managerInspectorFileFilter:
    | { paths: string[]; label?: string }
    | undefined;
    showFixPlan?: boolean;

    // 方法
    setManagerBusy: (busy: boolean) => void;
    setManagerSearch: (search: string) => void;
    setManagerScope: (scope: "trade" | "strategy") => void;
    setManagerInspectorKey: (key: string | undefined) => void;
    setManagerInspectorTab: (tab: "vals" | "files") => void;
    setManagerInspectorFileFilter: (
        filter: { paths: string[]; label: string } | undefined
    ) => void;
    setShowFixPlan?: (show: (prev: boolean) => boolean) => void;
    scanManagerInventory: () => Promise<void>;
    runManagerPlan: (
        plan: any,
        options: {
            closeInspector?: boolean;
            forceDeleteKeys?: boolean;
            refreshInventory?: boolean;
        }
    ) => Promise<void>;
    buildRenameKeyPlan: (files: any[], oldKey: string, newKey: string, options?: any) => any;
    buildDeleteKeyPlan: (files: any[], key: string) => any;
    buildAppendValPlan: (files: any[], key: string, valueToAppend: string) => any;
    buildInjectPropPlan: (files: any[], newKey: string, newVal: string) => any;
    buildUpdateValPlan: (files: any[], key: string, oldVal: string, newVal: string) => any;
    buildDeleteValPlan: (files: any[], key: string, valueToDelete: string, options?: any) => any;
    selectManagerTradeFiles: (paths: string[]) => any[];
    selectManagerStrategyFiles: (paths: string[]) => any[];

    // 辅助函数
    openFile: (path: string) => void;
    openGlobalSearch?: (query: string) => void;
    promptText?: (options: {
        title: string;
        defaultValue?: string;
        placeholder?: string;
        okText?: string;
        cancelText?: string;
    }) => Promise<string | null>;
    confirmDialog?: (options: {
        title: string;
        message: string;
        okText?: string;
        cancelText?: string;
    }) => Promise<boolean>;
    showNotice?: (msg: string) => void;
    runCommand?: (commandId: string) => void;
}

export const ManageTab: React.FC<ManageTabProps> = (props) => {
    // 准备数据统计 - 必须在所有条件渲染之前调用
    const distTicker = React.useMemo(() => topN((t) => t.ticker, undefined, props.trades, 10), [props.trades]);
    const distSetup = React.useMemo(() => topN((t) => t.setupKey, undefined, props.trades, 10), [props.trades]);
    const distExec = React.useMemo(() => topN((t) => (t as any).executionType ?? t.executionQuality, undefined, props.trades, 10), [props.trades]);

    const topTags = React.useMemo(() => {
        const tagMap: Record<string, number> = (props.paTagSnapshot?.tagMap as any) ?? {};
        return Object.entries(tagMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20) as [string, number][];
    }, [props.paTagSnapshot]);

    // 占位交互函数 (Dashboard未传递这些,但在Panel中需要)
    const noop = () => { };

    return (
        <div style={{ paddingBottom: "40px" }}>
            <SectionHeader
                title="数据管理中心"
                icon="shield-check"
            />
            <div style={{ padding: "0 12px 12px", color: "var(--text-faint)", fontSize: "0.9em", marginTop: "-10px" }}>
                全面的数据健康监控、属性管理及导出工具。
            </div>

            {/* Week 3: 批量修改面板 */}
            {props.index && <BatchEditPanel index={props.index} trades={props.trades} />}

            {/* Week 3: 操作历史查看器 */}
            {props.index && <HistoryViewer index={props.index} />}

            {/* Week 3: 快捷操作面板 */}
            {props.index && <QuickActionsPanel index={props.index} trades={props.trades} />}



            {/* 原始数据明细 (恢复) */}
            <RawDataPanel trades={props.trades} openFile={props.openFile} />

            {/* 健康状态检查 */}
            <div style={{ marginBottom: "24px" }}>
                <HealthStatusPanel
                    trades={props.trades}
                    schemaIssues={props.schemaIssues}
                    paTagSnapshot={props.paTagSnapshot}
                    enumPresets={props.enumPresets}
                    schemaScanNote={props.schemaScanNote ?? ""}
                    V5_COLORS={V5_COLORS}
                    SPACE={SPACE}
                />
            </div>

            {/* 属性管理器 */}
            <PropertyManager {...props} />

            {/* 模式验证问题 */}
            {props.schemaIssues.length > 0 && (
                <div style={{ marginBottom: "24px" }}>
                    <SchemaIssuesPanel
                        schemaIssues={props.schemaIssues}
                        issueCount={props.schemaIssues.length}
                        openFile={props.openFile}
                        onTextBtnMouseEnter={noop}
                        onTextBtnMouseLeave={noop}
                        onTextBtnFocus={noop}
                        onTextBtnBlur={noop}
                        V5_COLORS={V5_COLORS}
                    />
                </div>
            )}

            {/* 检查器 (恢复) */}
            <div style={{ marginBottom: "24px" }}>
                <InspectorPanel
                    inspectorIssues={props.inspectorIssues}
                    fixPlanText={props.fixPlanText}
                    showFixPlan={props.showFixPlan}
                    setShowFixPlan={props.setShowFixPlan}
                    openFile={props.openFile}
                />
            </div>

            {/* 数据统计 */}
            <div style={{ marginBottom: "24px" }}>
                <DataStatisticsPanel
                    distTicker={distTicker}
                    distSetup={distSetup}
                    distExec={distExec}
                    topTags={topTags}
                    paTagSnapshot={props.paTagSnapshot}
                    openGlobalSearch={props.openGlobalSearch ?? noop}
                    onTextBtnMouseEnter={noop}
                    onTextBtnMouseLeave={noop}
                    onTextBtnFocus={noop}
                    onTextBtnBlur={noop}
                    SPACE={SPACE}
                />
            </div>

            {/* 导出工具 */}
            <div style={{ marginBottom: "24px" }}>
                <ExportPanel
                    runCommand={props.runCommand}
                    buttonStyle={{}} // 传入空样式对象或具体样式
                    disabledButtonStyle={{ opacity: 0.5, pointerEvents: "none" }}
                />
            </div>
        </div>
    );
};

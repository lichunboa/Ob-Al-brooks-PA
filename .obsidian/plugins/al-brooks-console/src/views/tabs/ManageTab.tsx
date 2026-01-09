import * as React from "react";
import type { TradeRecord } from "../../core/contracts";
import type { EnumPresets } from "../../core/enum-presets";
import type { FrontmatterInventory } from "../../core/manager";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { Button } from "../../ui/components/Button";
import { HealthStatusPanel } from "../components/manage/HealthStatusPanel";
import { SchemaIssuesPanel } from "../components/manage/SchemaIssuesPanel";
import { DataStatisticsPanel } from "../components/manage/DataStatisticsPanel";
import { ExportPanel } from "../components/manage/ExportPanel";
import { V5_COLORS } from "../../ui/tokens";
import { SPACE } from "../../ui/styles/dashboardPrimitives";
import {
    prettySchemaVal,
    prettyExecVal,
    prettyManagerVal,
    prettyVal,
} from "../../utils/format-utils";
import {
    canonicalizeSearch,
    matchKeyToGroup,
} from "../../utils/search-utils";
import { topN } from "../../utils/aggregation-utils";
import { sortTradesByDateDesc } from "../../utils/performance-utils";
import { MANAGER_GROUPS } from "../../core/manager-groups";
import {
    buildRenameKeyPlan,
    buildDeleteKeyPlan,
    buildAppendValPlan,
    buildInjectPropPlan,
    buildUpdateValPlan,
    buildDeleteValPlan,
} from "../../core/manager";
import type { PaTagSnapshot, SchemaIssueItem } from "../../types";

/**
 * ManageTab Props接口
 */
export interface ManageTabProps {
    // 数据
    schemaIssues: SchemaIssueItem[];
    paTagSnapshot: PaTagSnapshot | undefined;
    trades: TradeRecord[];
    enumPresets: EnumPresets | undefined;
    schemaScanNote: string;
    inspectorIssues: any[];
    fixPlanText: string | null;

    // Manager状态
    managerBusy: boolean;
    managerSearch: string;
    managerTradeInventory: FrontmatterInventory | undefined;
    managerStrategyInventory: FrontmatterInventory | undefined;
    managerScope: "trade" | "strategy";
    managerInspectorKey: string | undefined;
    managerInspectorTab: "vals" | "files";
    managerInspectorFileFilter:
    | { paths: string[]; label: string }
    | undefined;
    showFixPlan: boolean;

    // 方法
    setManagerBusy: (busy: boolean) => void;
    setManagerSearch: (search: string) => void;
    setManagerScope: (scope: "trade" | "strategy") => void;
    setManagerInspectorKey: (key: string | undefined) => void;
    setManagerInspectorTab: (tab: "vals" | "files") => void;
    setManagerInspectorFileFilter: (
        filter: { paths: string[]; label: string } | undefined
    ) => void;
    setShowFixPlan: (show: (prev: boolean) => boolean) => void;
    scanManagerInventory: () => Promise<void>;
    runManagerPlan: (
        plan: any,
        options: {
            closeInspector?: boolean;
            forceDeleteKeys?: boolean;
            refreshInventory?: boolean;
        }
    ) => Promise<void>;
    selectManagerTradeFiles: (paths: string[]) => any[];
    selectManagerStrategyFiles: (paths: string[]) => any[];

    // 辅助函数
    openFile: (path: string) => void;
    openGlobalSearch: (query: string) => void;
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

    // 样式
    cardTightStyle: React.CSSProperties;
    cardSubtleTightStyle: React.CSSProperties;
    buttonStyle: React.CSSProperties;
    disabledButtonStyle: React.CSSProperties;
    textButtonStyle: React.CSSProperties;

    // 事件处理器
    onTextBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onTextBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onTextBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
    onTextBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;
    onBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
    onBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;

    // 其他
    runCommand: (commandId: string) => void;
}

/**
 * Manage Tab组件
 * 管理模块 - 健康状态、数据统计、属性管理器、导出功能
 */
export function ManageTab(props: ManageTabProps): JSX.Element {
    const {
        schemaIssues,
        paTagSnapshot,
        trades,
        enumPresets,
        schemaScanNote,
        inspectorIssues,
        fixPlanText,
        managerBusy,
        managerSearch,
        managerTradeInventory,
        managerStrategyInventory,
        managerScope,
        managerInspectorKey,
        managerInspectorTab,
        managerInspectorFileFilter,
        showFixPlan,
        setManagerBusy,
        setManagerSearch,
        setManagerScope,
        setManagerInspectorKey,
        setManagerInspectorTab,
        setManagerInspectorFileFilter,
        setShowFixPlan,
        scanManagerInventory,
        runManagerPlan,
        selectManagerTradeFiles,
        selectManagerStrategyFiles,
        openFile,
        openGlobalSearch,
        promptText,
        confirmDialog,
        cardTightStyle,
        cardSubtleTightStyle,
        buttonStyle,
        disabledButtonStyle,
        textButtonStyle,
        onTextBtnMouseEnter,
        onTextBtnMouseLeave,
        onTextBtnFocus,
        onTextBtnBlur,
        onBtnMouseEnter,
        onBtnMouseLeave,
        onBtnFocus,
        onBtnBlur,
        runCommand,
    } = props;

    // 数据计算逻辑 (从Dashboard移动过来)
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

    const distTicker = topN((t) => t.ticker, prettySchemaVal, trades);
    const distSetup = topN(
        (t) => t.setupKey ?? t.setupCategory,
        prettySchemaVal,
        trades
    );
    const distExec = topN((t) => t.executionQuality, prettyExecVal, trades);

    const sortedRecent = sortTradesByDateDesc(trades).slice(0, 15);

    return (
        <>
            <SectionHeader
                title="管理模块"
                subtitle="管理（Management）"
                icon="📉"
                style={{
                    margin: `${SPACE.xxl} 0 ${SPACE.sm}`,
                    paddingBottom: SPACE.xs,
                    gap: SPACE.sm,
                }}
            />

            <div style={{ ...cardTightStyle, marginBottom: SPACE.xl }}>
                <div style={{ marginBottom: SPACE.md }}>
                    <HealthStatusPanel
                        schemaIssues={schemaIssues}
                        paTagSnapshot={paTagSnapshot}
                        trades={trades}
                        enumPresets={enumPresets}
                        schemaScanNote={schemaScanNote}
                        V5_COLORS={V5_COLORS}
                        SPACE={SPACE}
                        cardSubtleTightStyle={cardSubtleTightStyle}
                    />

                    <SchemaIssuesPanel
                        schemaIssues={schemaIssues}
                        issueCount={issueCount}
                        openFile={openFile}
                        onTextBtnMouseEnter={onTextBtnMouseEnter}
                        onTextBtnMouseLeave={onTextBtnMouseLeave}
                        onTextBtnFocus={onTextBtnFocus}
                        onTextBtnBlur={onTextBtnBlur}
                        V5_COLORS={V5_COLORS}
                    />

                    <DataStatisticsPanel
                        distTicker={distTicker}
                        distSetup={distSetup}
                        distExec={distExec}
                        topTags={topTags}
                        paTagSnapshot={paTagSnapshot}
                        openGlobalSearch={openGlobalSearch}
                        onTextBtnMouseEnter={onTextBtnMouseEnter}
                        onTextBtnMouseLeave={onTextBtnMouseLeave}
                        onTextBtnFocus={onTextBtnFocus}
                        onTextBtnBlur={onTextBtnBlur}
                        SPACE={SPACE}
                    />

                    {/* 原始数据明细表格 */}
                    <div
                        style={{
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "10px",
                            padding: "12px",
                            background: "var(--background-primary)",
                            marginBottom: "12px",
                        }}
                    >
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

                        <div
                            style={{
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "10px",
                                overflow: "auto",
                                maxHeight: "260px",
                                background: "rgba(var(--mono-rgb-100), 0.03)",
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
                                <Button
                                    key={t.path}
                                    variant="text"
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
                                        borderBottom:
                                            "1px solid var(--background-modifier-border)",
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
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* 系统健康度KPI卡片 */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr 1fr",
                            gap: "12px",
                            marginBottom: "12px",
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
                                    issueCount > 0 ? V5_COLORS.loss : "var(--text-muted)",
                            },
                            {
                                title: "标签总数",
                                value: String(tags),
                                color: "var(--text-accent)",
                            },
                            {
                                title: "笔记档案",
                                value: String(files),
                                color: "var(--text-accent)",
                            },
                        ].map((c) => (
                            <div
                                key={c.title}
                                style={{
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "10px",
                                    padding: "12px",
                                    background: "rgba(var(--mono-rgb-100), 0.03)",
                                }}
                            >
                                <div style={{ color: "var(--text-faint)" }}>
                                    {c.title}
                                </div>
                                <div
                                    style={{
                                        marginTop: "6px",
                                        fontSize: "1.4em",
                                        fontWeight: 900,
                                        color: c.color,
                                    }}
                                >
                                    {c.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 健康状态提示 */}
                    <div
                        style={{
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "12px",
                            padding: "12px",
                            background: "rgba(var(--mono-rgb-100), 0.03)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "10px",
                        }}
                    >
                        <div style={{ fontWeight: 800, color: healthColor }}>
                            {issueCount === 0 ? "✅ 系统非常健康" : "⚠️ 系统需要修复"}
                            <span
                                style={{
                                    marginLeft: "10px",
                                    color: "var(--text-faint)",
                                    fontWeight: 600,
                                }}
                            >
                                {issueCount === 0 ? "(All Clear)" : "(Needs Attention)"}
                            </span>
                        </div>
                        <div
                            style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                        >
                            {issueCount === 0
                                ? "所有关键属性已规范填写"
                                : "建议优先处理异常详情中的缺失字段"}
                        </div>
                    </div>

                    {/* 检查器与修复方案 */}
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
                                <Button
                                    variant="small"
                                    onClick={() => setShowFixPlan((v) => !v)}
                                    disabled={!enumPresets}
                                    onMouseEnter={onBtnMouseEnter}
                                    onMouseLeave={onBtnMouseLeave}
                                    onFocus={onBtnFocus}
                                    onBlur={onBtnBlur}
                                    title={
                                        !enumPresets ? "枚举预设不可用" : "切换修复方案预览"
                                    }
                                >
                                    {showFixPlan ? "隐藏修复方案" : "显示修复方案"}
                                </Button>
                            </div>

                            <div
                                style={{
                                    color: "var(--text-faint)",
                                    fontSize: "0.9em",
                                    marginBottom: "10px",
                                }}
                            >
                                只读：仅报告问题；修复方案（FixPlan）仅预览（不会写入
                                vault）。
                                <span style={{ marginLeft: "8px" }}>
                                    枚举预设：{enumPresets ? "已加载" : "不可用"}
                                </span>
                            </div>

                            {schemaScanNote ? (
                                <div
                                    style={{
                                        color: "var(--text-faint)",
                                        fontSize: "0.85em",
                                        marginBottom: "10px",
                                    }}
                                >
                                    {schemaScanNote}
                                </div>
                            ) : null}

                            {(() => {
                                const errorCount = inspectorIssues.filter(
                                    (i) => i.severity === "error"
                                ).length;
                                const warnCount = inspectorIssues.filter(
                                    (i) => i.severity === "warn"
                                ).length;
                                return (
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: "12px",
                                            flexWrap: "wrap",
                                            marginBottom: "10px",
                                        }}
                                    >
                                        <div style={{ color: V5_COLORS.loss }}>
                                            错误：{errorCount}
                                        </div>
                                        <div style={{ color: V5_COLORS.back }}>
                                            警告：{warnCount}
                                        </div>
                                        <div style={{ color: "var(--text-muted)" }}>
                                            总计：{inspectorIssues.length}
                                        </div>
                                    </div>
                                );
                            })()}

                            {inspectorIssues.length === 0 ? (
                                <div
                                    style={{
                                        color: "var(--text-faint)",
                                        fontSize: "0.9em",
                                    }}
                                >
                                    未发现问题。
                                </div>
                            ) : (
                                <div
                                    style={{
                                        maxHeight: "240px",
                                        overflow: "auto",
                                        border:
                                            "1px solid var(--background-modifier-border)",
                                        borderRadius: "8px",
                                    }}
                                >
                                    {inspectorIssues.slice(0, 50).map((issue) => (
                                        <Button
                                            key={issue.id}
                                            variant="text"
                                            onClick={() => openFile(issue.path)}
                                            title={issue.path}
                                            onMouseEnter={onTextBtnMouseEnter}
                                            onMouseLeave={onTextBtnMouseLeave}
                                            onFocus={onTextBtnFocus}
                                            onBlur={onTextBtnBlur}
                                            style={{
                                                width: "100%",
                                                textAlign: "left",
                                                padding: "8px 10px",
                                                borderBottom:
                                                    "1px solid var(--background-modifier-border)",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: "10px",
                                                    alignItems: "baseline",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: "60px",
                                                        color:
                                                            issue.severity === "error"
                                                                ? V5_COLORS.loss
                                                                : V5_COLORS.back,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {issue.severity === "error"
                                                        ? "错误"
                                                        : issue.severity === "warn"
                                                            ? "警告"
                                                            : "—"}
                                                </div>
                                                <div style={{ flex: "1 1 auto" }}>
                                                    <div style={{ fontWeight: 600 }}>
                                                        {issue.title}
                                                    </div>
                                                    <div
                                                        style={{
                                                            color: "var(--text-faint)",
                                                            fontSize: "0.85em",
                                                            marginTop: "4px",
                                                        }}
                                                    >
                                                        {issue.path}
                                                    </div>
                                                </div>
                                            </div>
                                        </Button>
                                    ))}
                                    {inspectorIssues.length > 50 ? (
                                        <div
                                            style={{
                                                padding: "8px 10px",
                                                color: "var(--text-faint)",
                                                fontSize: "0.85em",
                                            }}
                                        >
                                            仅显示前 50 条问题。
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {showFixPlan && enumPresets ? (
                                <div style={{ marginTop: "12px" }}>
                                    <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                                        修复方案预览（FixPlan）
                                    </div>
                                    <pre
                                        style={{
                                            margin: 0,
                                            padding: "10px",
                                            border:
                                                "1px solid var(--background-modifier-border)",
                                            borderRadius: "8px",
                                            background: "rgba(var(--mono-rgb-100), 0.03)",
                                            maxHeight: "220px",
                                            overflow: "auto",
                                            whiteSpace: "pre-wrap",
                                        }}
                                    >
                                        {fixPlanText ?? ""}
                                    </pre>
                                </div>
                            ) : !enumPresets ? (
                                <div
                                    style={{
                                        marginTop: "12px",
                                        color: "var(--text-faint)",
                                        fontSize: "0.9em",
                                    }}
                                >
                                    枚举预设不可用，已禁用修复方案生成。
                                </div>
                            ) : null}
                        </div>
                    </details>

                    {/* 属性管理器 - 待添加 */}
                    <div>属性管理器 - 待实现</div>
                </div>
            </div>

            <ExportPanel
                runCommand={runCommand}
                buttonStyle={buttonStyle}
                disabledButtonStyle={disabledButtonStyle}
            />
        </>
    );
}

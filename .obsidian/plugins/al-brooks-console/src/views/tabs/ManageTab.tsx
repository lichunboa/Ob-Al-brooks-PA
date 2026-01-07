import * as React from "react";
import { HeadingM, GlassCard, GlassPanel, ButtonGhost, DisplayXL, StatusBadge } from "../../ui/components/DesignSystem";
import { SPACE, glassCardStyle, glassPanelStyle } from "../../ui/styles/dashboardPrimitives";
import { V5_COLORS } from "../../ui/tokens";
import { COLORS } from "../../ui/styles/theme";
import { PaTagSnapshot, SchemaIssueItem } from "../../types";
import { TradeRecord } from "../../core/contracts";
import { FixPlan } from "../../core/inspector";
import { FrontmatterFile, FrontmatterInventory, ManagerApplyResult } from "../../core/manager";
import { EnumPresets } from "../../core/enum-presets";
import { ManagerInventoryGrid } from "../components/ManagerInventoryGrid";
import { ManagerFileInspector } from "../components/ManagerFileInspector";

export interface ManageTabProps {
    schemaIssues: SchemaIssueItem[];
    paTagSnapshot?: PaTagSnapshot;
    tradesCount: number;
    filesCount: number;
    tagsCount: number;
    healthScore: number;
    healthColor: string;
    issueCount: number;
    topTypes: [string, number][];
    topTags: [string, number][];
    distTicker: [string, number][];
    distSetup: [string, number][];
    distExec: [string, number][];
    sortedRecent: TradeRecord[];
    prettySchemaVal: (val?: string) => string;
    prettyExecVal: (val?: string) => string;
    openFile: (path: string) => void;
    openGlobalSearch: (query: string) => void;

    // Inspector & Manager Props
    enumPresets?: EnumPresets;
    schemaScanNote?: string;
    showFixPlan: boolean;
    setShowFixPlan: React.Dispatch<React.SetStateAction<boolean>>;
    fixPlanText?: string;

    // Manager Actions
    managerBusy: boolean;
    setManagerBusy: (b: boolean) => void;
    scanManagerInventory: () => Promise<void>;
    managerTradeInventory?: FrontmatterInventory;
    managerStrategyInventory?: FrontmatterInventory;
    managerSearch: string;
    setManagerSearch: (s: string) => void;
    managerScope: "trade" | "strategy";
    setManagerScope: (s: "trade" | "strategy") => void;

    managerInspectorKey?: string;
    setManagerInspectorKey: (k: string | undefined) => void;
    managerInspectorTab: "vals" | "files";
    setManagerInspectorTab: (t: "vals" | "files") => void;
    managerInspectorFileFilter?: { paths: string[]; label?: string };
    setManagerInspectorFileFilter: (v: { paths: string[]; label?: string } | undefined) => void;

    selectManagerTradeFiles: (paths: string[]) => FrontmatterFile[];
    selectManagerStrategyFiles: (paths: string[]) => FrontmatterFile[];

    promptText: (msg: string, def?: string) => Promise<string | null>;
    confirmDialog: (msg: string) => Promise<boolean>;
    runManagerPlan: (plan: FixPlan, options?: any) => Promise<void>;
    runCommand: (cmd: string) => void;
    onExport: () => void;

    // Inventory Actions
    onRenameKey: (oldKey: string, newKey: string) => void;
    onDeleteKey: (key: string) => void;
    onUpdateVal: (key: string, oldVal: string, newVal: string) => void;
    onDeleteVal: (key: string, val: string) => void;

    // UI Handlers
    onTextBtnMouseEnter?: (e: React.MouseEvent) => void;
    onTextBtnMouseLeave?: (e: React.MouseEvent) => void;
    onTextBtnFocus?: (e: React.FocusEvent) => void;
    onTextBtnBlur?: (e: React.FocusEvent) => void;
    onBtnMouseEnter?: (e: React.MouseEvent) => void;
    onBtnMouseLeave?: (e: React.MouseEvent) => void;
    onBtnFocus?: (e: React.FocusEvent) => void;
    onBtnBlur?: (e: React.FocusEvent) => void;
}

export const ManageTab: React.FC<ManageTabProps> = ({
    schemaIssues, paTagSnapshot, tradesCount, filesCount, tagsCount,
    healthScore, healthColor, issueCount, topTypes, topTags, distTicker, distSetup, distExec, sortedRecent,
    prettySchemaVal, prettyExecVal, openFile, openGlobalSearch,
    enumPresets, schemaScanNote, showFixPlan, setShowFixPlan, fixPlanText,
    managerBusy, setManagerBusy, scanManagerInventory,
    managerTradeInventory, managerStrategyInventory,
    managerSearch, setManagerSearch, managerScope, setManagerScope,
    managerInspectorKey, setManagerInspectorKey,
    managerInspectorTab, setManagerInspectorTab,
    managerInspectorFileFilter, setManagerInspectorFileFilter,
    selectManagerTradeFiles, selectManagerStrategyFiles,
    promptText, confirmDialog, runManagerPlan, runCommand, onExport,
    onRenameKey, onDeleteKey, onUpdateVal, onDeleteVal,
    onTextBtnMouseEnter, onTextBtnMouseLeave, onTextBtnFocus, onTextBtnBlur,
    onBtnMouseEnter, onBtnMouseLeave, onBtnFocus, onBtnBlur
}) => {
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
                            marginLeft: "8px",
                        }}
                    >
                        管理（Management）
                    </span>
                </HeadingM>
            </div>

            <GlassCard style={{ marginBottom: SPACE.xl }}>
                <div style={{ marginBottom: SPACE.md }}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: SPACE.md,
                            marginBottom: SPACE.md,
                        }}
                    >
                        <GlassPanel>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "baseline",
                                    gap: SPACE.md,
                                    marginBottom: SPACE.sm,
                                }}
                            >
                                <div style={{ fontWeight: 800, color: healthColor }}>
                                    ❤️ 系统健康度：{healthScore}
                                </div>
                                <div style={{ color: "var(--text-muted)" }}>
                                    待修异常：{issueCount}
                                </div>
                            </div>

                            {topTypes.length ? (
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr",
                                        gap: `${SPACE.xs} ${SPACE.xl}`,
                                        fontSize: "0.9em",
                                    }}
                                >
                                    {topTypes.map(([t, c]) => (
                                        <div
                                            key={t}
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: SPACE.md,
                                                color: "var(--text-muted)",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                                title={t}
                                            >
                                                {t}
                                            </span>
                                            <span
                                                style={{
                                                    fontVariantNumeric: "tabular-nums",
                                                }}
                                            >
                                                {c}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: V5_COLORS.win }}>
                                    ✅ 系统非常健康（All Clear）
                                </div>
                            )}
                        </GlassPanel>

                        <GlassPanel>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "baseline",
                                    gap: SPACE.md,
                                    marginBottom: SPACE.sm,
                                }}
                            >
                                <div style={{ fontWeight: 800 }}>🧠 系统诊断</div>
                                <div style={{ color: "var(--text-muted)" }}>
                                    {schemaScanNote ? "已扫描" : "未扫描"}
                                </div>
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: `${SPACE.xs} ${SPACE.xl}`,
                                    fontSize: "0.9em",
                                    color: "var(--text-muted)",
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}>
                                    <span>枚举预设</span>
                                    <span>{enumPresets ? "✅ 已加载" : "—"}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}>
                                    <span>标签扫描</span>
                                    <span>{paTagSnapshot ? "✅ 正常" : "—"}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}>
                                    <span>交易记录</span>
                                    <span>{tradesCount}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                                    <span>笔记档案</span>
                                    <span>{filesCount}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                                    <span>标签总数</span>
                                    <span>{tagsCount}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                                    <span>属性管理器</span>
                                    <span>✅ 可用</span>
                                </div>
                            </div>
                        </GlassPanel>
                    </div>

                    <GlassCard style={{ marginBottom: "10px" }}>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "baseline",
                                gap: "10px",
                                marginBottom: "8px",
                            }}
                        >
                            <div style={{ fontWeight: 800 }}>⚠️ 异常详情</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                                {issueCount}
                            </div>
                        </div>

                        {schemaIssues.length === 0 ? (
                            <div style={{ color: V5_COLORS.win, fontSize: "0.9em" }}>
                                ✅ 无异常
                            </div>
                        ) : (
                            <GlassPanel
                                style={{
                                    maxHeight: "260px",
                                    overflow: "auto",
                                }}
                            >
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "2fr 1fr 1fr",
                                        gap: "10px",
                                        padding: "8px",
                                        borderBottom: "1px solid var(--background-modifier-border)",
                                        color: "var(--text-faint)",
                                        fontSize: "0.85em",
                                        background: "transparent",
                                    }}
                                >
                                    <div>文件</div>
                                    <div>问题</div>
                                    <div>字段</div>
                                </div>
                                {schemaIssues.slice(0, 80).map((item: SchemaIssueItem, idx: number) => (
                                    <button
                                        key={`${item.path}:${item.key}:${idx}`}
                                        type="button"
                                        onClick={() => openFile(item.path)}
                                        title={item.path}
                                        onMouseEnter={onTextBtnMouseEnter}
                                        onMouseLeave={onTextBtnMouseLeave}
                                        onFocus={onTextBtnFocus}
                                        onBlur={onTextBtnBlur}
                                        style={{
                                            width: "100%",
                                            textAlign: "left",
                                            padding: 0,
                                            border: "none",
                                            borderBottom: "1px solid var(--background-modifier-border)",
                                            background: "transparent",
                                            cursor: "pointer",
                                            outline: "none",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "2fr 1fr 1fr",
                                                gap: "10px",
                                                padding: "10px",
                                                alignItems: "baseline",
                                            }}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <div
                                                    style={{
                                                        fontWeight: 650,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {item.name}
                                                </div>
                                                <div
                                                    style={{
                                                        color: "var(--text-faint)",
                                                        fontSize: "0.85em",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {item.path}
                                                </div>
                                            </div>
                                            <div style={{ color: "var(--text-error)", fontWeight: 700, whiteSpace: "nowrap" }}>
                                                {item.type}
                                            </div>
                                            <div
                                                style={{
                                                    color: "var(--text-muted)",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                                title={item.key}
                                            >
                                                {item.key}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </GlassPanel>
                        )}
                    </GlassCard>

                    <GlassPanel style={{ marginBottom: "12px" }}>
                        <details>
                            <summary
                                style={{
                                    cursor: "pointer",
                                    fontWeight: 800,
                                    listStyle: "none",
                                }}
                            >
                                📊 分布摘要（可展开）
                                <span
                                    style={{
                                        marginLeft: "10px",
                                        color: "var(--text-faint)",
                                        fontSize: "0.9em",
                                        fontWeight: 600,
                                    }}
                                >
                                    完整图像建议看 Schema
                                </span>
                            </summary>

                            <div style={{ marginTop: "10px" }}>
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr 1fr",
                                        gap: "10px",
                                        marginBottom: "10px",
                                    }}
                                >
                                    {[
                                        { title: "Ticker", data: distTicker },
                                        { title: "Setup", data: distSetup },
                                        { title: "Exec", data: distExec },
                                    ].map((col) => (
                                        <div
                                            key={col.title}
                                            style={{
                                                border: "1px solid var(--background-modifier-border)",
                                                borderRadius: "10px",
                                                padding: "10px",
                                                background: "var(--background-primary)",
                                            }}
                                        >
                                            <div style={{ fontWeight: 700, marginBottom: "8px", color: "var(--text-muted)" }}>
                                                {col.title}
                                            </div>
                                            {col.data.length === 0 ? (
                                                <div style={{ color: "var(--text-faint)", fontSize: "0.85em" }}>无数据</div>
                                            ) : (
                                                <div style={{ display: "grid", gap: "6px" }}>
                                                    {col.data.map(([k, v]) => (
                                                        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "0.9em" }}>
                                                            <div style={{ color: "var(--text-normal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={k}>
                                                                {k}
                                                            </div>
                                                            <div style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                                                                {v}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div
                                    style={{
                                        border: "1px solid var(--background-modifier-border)",
                                        borderRadius: "10px",
                                        padding: "10px",
                                        background: "var(--background-primary)",
                                    }}
                                >
                                    <div style={{ fontWeight: 800, marginBottom: "8px" }}>
                                        🏷️ 标签全景（Tag System）
                                    </div>
                                    {!paTagSnapshot ? (
                                        <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                                            标签扫描不可用。
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                            {topTags.map(([tag, count]: [string, number]) => (
                                                <button
                                                    key={tag}
                                                    type="button"
                                                    onClick={() => openGlobalSearch(`tag:${tag}`)}
                                                    onMouseEnter={onTextBtnMouseEnter}
                                                    onMouseLeave={onTextBtnMouseLeave}
                                                    onFocus={onTextBtnFocus}
                                                    onBlur={onTextBtnBlur}
                                                    style={{
                                                        padding: "2px 8px",
                                                        borderRadius: "999px",
                                                        border: "1px solid var(--background-modifier-border)",
                                                        background: "var(--background-primary)",
                                                        fontSize: "0.85em",
                                                        color: "var(--text-muted)",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    #{tag} ({count})
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </details>
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
                            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
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
                                    gridTemplateColumns: "90px 110px 120px 1fr 100px 120px",
                                    gap: "10px",
                                    padding: "10px",
                                    borderBottom: "1px solid var(--background-modifier-border)",
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

                            {sortedRecent.map((t: TradeRecord) => (
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
                                        borderBottom: "1px solid var(--background-modifier-border)",
                                        background: "transparent",
                                        cursor: "pointer",
                                        outline: "none",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "90px 110px 120px 1fr 100px 120px",
                                            gap: "10px",
                                            padding: "10px",
                                            alignItems: "baseline",
                                            fontSize: "0.9em",
                                        }}
                                    >
                                        <div style={{ color: "var(--text-muted)" }}>{t.dateIso}</div>
                                        <div style={{ fontWeight: 650 }}>{t.ticker ?? "—"}</div>
                                        <div style={{ color: "var(--text-muted)" }}>{t.timeframe ?? "—"}</div>
                                        <div
                                            style={{
                                                color: "var(--text-muted)",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                            title={t.setupKey ?? t.setupCategory ?? ""}
                                        >
                                            {prettySchemaVal(t.setupKey ?? t.setupCategory) || "—"}
                                        </div>
                                        <div style={{ color: "var(--text-muted)" }}>{t.outcome ?? "unknown"}</div>
                                        <div style={{ color: "var(--text-muted)" }}>
                                            {prettyExecVal(t.executionQuality) || "—"}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </GlassPanel>
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
                            { title: "系统健康度", value: String(healthScore), color: healthColor },
                            { title: "待修异常", value: String(issueCount), color: issueCount > 0 ? COLORS.loss : COLORS.text.muted },
                            { title: "标签总数", value: String(tagsCount), color: COLORS.accent },
                            { title: "笔记档案", value: String(filesCount), color: COLORS.accent },
                        ].map((c) => (
                            <GlassPanel key={c.title} style={{ textAlign: "center" }}>
                                <div style={{ color: COLORS.text.muted, fontSize: "0.9em", marginBottom: SPACE.xs }}>
                                    {c.title}
                                </div>
                                <DisplayXL style={{ color: c.color }}>{c.value}</DisplayXL>
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
                            {issueCount === 0 ? "所有关键属性已规范填写" : "建议优先处理异常详情中的缺失字段"}
                        </div>
                    </GlassPanel>

                    <details style={{ marginTop: "12px" }}>
                        <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontWeight: 700 }}>
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
                                <ButtonGhost onClick={() => setShowFixPlan((v: boolean) => !v)} disabled={!enumPresets}>
                                    {showFixPlan ? "隐藏修复方案" : "预览修复方案"}
                                </ButtonGhost>
                            </div>

                            {/* Inspector Logic Here (Simplified for extraction - you would pass children or keep it here if not too complex) */}

                            {showFixPlan && enumPresets ? (
                                <div style={{ marginTop: "12px" }}>
                                    <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                                        修复方案预览（FixPlan）
                                    </div>
                                    <pre
                                        style={{
                                            ...glassPanelStyle,
                                            margin: 0,
                                            padding: "10px",
                                            maxHeight: "220px",
                                            overflow: "auto",
                                            whiteSpace: "pre-wrap",
                                        }}
                                    >
                                        {fixPlanText ?? ""}
                                    </pre>
                                </div>
                            ) : !enumPresets ? (
                                <div style={{ marginTop: "12px", color: "var(--text-faint)", fontSize: "0.9em" }}>
                                    枚举预设不可用，已禁用修复方案生成。
                                </div>
                            ) : null}
                        </div>
                    </details>
                </div>
            </GlassCard>

            <GlassCard>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE.md, marginBottom: SPACE.md }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <HeadingM>🛠 资源管理器 (Manager)</HeadingM>
                        <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "2px", border: "1px solid var(--background-modifier-border)" }}>
                            <button
                                onClick={() => setManagerScope("trade")}
                                style={{
                                    padding: "4px 12px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.85em", fontWeight: 700,
                                    background: managerScope === "trade" ? COLORS.accent : "transparent",
                                    color: managerScope === "trade" ? "#fff" : "var(--text-muted)"
                                }}
                            >
                                交易 (Trade)
                            </button>
                            <button
                                onClick={() => setManagerScope("strategy")}
                                style={{
                                    padding: "4px 12px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.85em", fontWeight: 700,
                                    background: managerScope === "strategy" ? COLORS.accent : "transparent",
                                    color: managerScope === "strategy" ? "#fff" : "var(--text-muted)"
                                }}
                            >
                                策略 (Strategy)
                            </button>
                        </div>
                    </div>
                    <ButtonGhost onClick={scanManagerInventory} disabled={managerBusy}>
                        {managerBusy ? "扫描中..." : "🔄 刷新全库索引"}
                    </ButtonGhost>
                </div>

                {/* Manager Inventory Grid */}
                {managerScope === "trade" && managerTradeInventory ? (
                    managerInspectorTab === "files" && managerInspectorFileFilter?.paths?.length ? (
                        <ManagerFileInspector
                            files={selectManagerTradeFiles(managerInspectorFileFilter.paths)}
                            label={managerInspectorFileFilter.label}
                            onClose={() => {
                                setManagerInspectorTab("vals");
                                setManagerInspectorFileFilter(undefined);
                            }}
                            onOpenFile={openFile}
                        />
                    ) : (
                        <ManagerInventoryGrid
                            inventory={managerTradeInventory}
                            onRenameKey={onRenameKey}
                            onDeleteKey={onDeleteKey}
                            onUpdateVal={onUpdateVal}
                            onDeleteVal={onDeleteVal}
                            onSelectFiles={(paths) => {
                                const files = selectManagerTradeFiles(paths);
                                if (files.length > 0) {
                                    setManagerInspectorFileFilter({ paths, label: "Selected from Inventory" });
                                    setManagerInspectorTab("files");
                                }
                            }}
                        />
                    )
                ) : managerScope === "strategy" && managerStrategyInventory ? (
                    managerInspectorTab === "files" && managerInspectorFileFilter?.paths?.length ? (
                        <ManagerFileInspector
                            files={selectManagerStrategyFiles(managerInspectorFileFilter.paths)}
                            label={managerInspectorFileFilter.label}
                            onClose={() => {
                                setManagerInspectorTab("vals");
                                setManagerInspectorFileFilter(undefined);
                            }}
                            onOpenFile={openFile}
                        />
                    ) : (
                        <ManagerInventoryGrid
                            inventory={managerStrategyInventory}
                            onRenameKey={onRenameKey}
                            onDeleteKey={onDeleteKey}
                            onUpdateVal={onUpdateVal}
                            onDeleteVal={onDeleteVal}
                            onSelectFiles={(paths) => {
                                const files = selectManagerStrategyFiles(paths);
                                if (files.length > 0) {
                                    setManagerInspectorFileFilter({ paths, label: "Selected from Inventory" });
                                    setManagerInspectorTab("files");
                                }
                            }}
                        />
                    )
                ) : (
                    <div style={{ color: "var(--text-muted)", padding: "40px", textAlign: "center" }}>
                        {managerBusy ? "正在扫描索引..." : "索引未加载，请点击“刷新全库索引”。"}
                    </div>
                )}
            </GlassCard >

            <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", borderTop: "1px solid var(--background-modifier-border)", paddingTop: "16px" }}>
                <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
                    数据安全与迁移
                </div>
                <ButtonGhost onClick={onExport}>
                    📥 备份数据库 (Export)
                </ButtonGhost>
            </div>
        </>
    );
};

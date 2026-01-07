import * as React from "react";
import { HeadingM, GlassCard, GlassPanel, ButtonGhost, DisplayXL, StatusBadge } from "../../ui/components/DesignSystem";
import { SPACE, glassCardStyle, glassPanelStyle } from "../../ui/styles/dashboardPrimitives";
import { V5_COLORS } from "../../ui/tokens";
import { COLORS, TYPO } from "../../ui/styles/theme";
import { PaTagSnapshot, SchemaIssueItem } from "../../types";
import { FixPlan } from "../../core/inspector";
import { ManagerApplyResult, FrontmatterInventory, FrontmatterFile } from "../../core/manager";
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
    sortedRecent: any[];
    prettySchemaVal: (val?: string) => string;
    prettyExecVal: (val?: string) => string;
    openFile: (path: string) => void;
    openGlobalSearch: (query: string) => void;

    // Inspector & Manager Props
    enumPresets?: string[];
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
    runManagerPlan: (plan: FixPlan | any) => Promise<ManagerApplyResult>;
    runCommand: (cmd: string) => void;

    // UI Handlers
    onTextBtnMouseEnter?: () => void;
    onTextBtnMouseLeave?: () => void;
    onTextBtnFocus?: () => void;
    onTextBtnBlur?: () => void;
    onBtnMouseEnter?: () => void;
    onBtnMouseLeave?: () => void;
    onBtnFocus?: () => void;
    onBtnBlur?: () => void;
}

export const ManageTab = ({
    schemaIssues, paTagSnapshot, tradesCount, filesCount, tagsCount,
    healthScore, healthColor, issueCount, topTypes, topTags, sortedRecent,
    prettySchemaVal, prettyExecVal, openFile, openGlobalSearch,
    enumPresets, schemaScanNote, showFixPlan, setShowFixPlan, fixPlanText,
    managerBusy, setManagerBusy, scanManagerInventory,
    managerTradeInventory, managerStrategyInventory,
    managerSearch, setManagerSearch, managerScope, setManagerScope,
    managerInspectorKey, setManagerInspectorKey,
    managerInspectorTab, setManagerInspectorTab,
    managerInspectorFileFilter, setManagerInspectorFileFilter,
    selectManagerTradeFiles, selectManagerStrategyFiles,
    promptText, confirmDialog, runManagerPlan, runCommand,
    onTextBtnMouseEnter, onTextBtnMouseLeave, onTextBtnFocus, onTextBtnBlur,
    onBtnMouseEnter, onBtnMouseLeave, onBtnFocus, onBtnBlur
}: ManageTabProps) => {

    const activeInventory = managerScope === "trade" ? managerTradeInventory : managerStrategyInventory;

    const handleRenameKey = async (oldKey: string) => {
        const newKey = await promptText(`重命名属性 key: ${oldKey}`, oldKey);
        if (newKey && newKey !== oldKey) {
            await (runManagerPlan as any)({ type: "renameKey", key: oldKey, newKey, scope: managerScope });
            await scanManagerInventory();
        }
    };

    const handleDeleteKey = async (key: string) => {
        if (await confirmDialog(`确定要删除属性 "${key}" 吗？该操作将从所有相关文件中移除此属性。`)) {
            await (runManagerPlan as any)({ type: "deleteKey", key, scope: managerScope });
            await scanManagerInventory();
        }
    };

    const handleUpdateVal = async (key: string, oldVal: string) => {
        const newVal = await promptText(`修改属性值 (${key}): ${oldVal}`, oldVal);
        if (newVal !== null && newVal !== oldVal) {
            await (runManagerPlan as any)({ type: "renameVal", key, val: oldVal, newVal, scope: managerScope });
            await scanManagerInventory();
        }
    };

    const handleDeleteVal = async (key: string, val: string) => {
        if (await confirmDialog(`确定要删除属性值 "${val}" (key=${key}) 吗？`)) {
            await (runManagerPlan as any)({ type: "deleteVal", key, val, scope: managerScope });
            await scanManagerInventory();
        }
    };

    const handleSelectFiles = (paths: string[]) => {
        setManagerInspectorFileFilter({ paths, label: "Selected from Inventory" });
        setManagerInspectorTab("files");
    };

    return (
        <>
            <div style={{ marginBottom: SPACE.xl }}>
                <HeadingM>
                    📉 管理模块
                    <span style={{ fontSize: "0.85em", color: "var(--text-muted)", fontWeight: "normal", marginLeft: "8px" }}>
                        管理（Management）
                    </span>
                </HeadingM>
            </div>

            <GlassCard style={{ marginBottom: SPACE.xl }}>
                <div style={{ marginBottom: SPACE.md }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.md, marginBottom: SPACE.md }}>
                        <GlassPanel>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SPACE.md, marginBottom: SPACE.sm }}>
                                <div style={{ fontWeight: 800, color: healthColor }}>❤️ 系统健康度：{healthScore}</div>
                                <div style={{ color: "var(--text-muted)" }}>待修异常：{issueCount}</div>
                            </div>
                            {topTypes.length ? (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${SPACE.xs} ${SPACE.xl}`, fontSize: "0.9em" }}>
                                    {topTypes.map(([t, c]: [string, number]) => (
                                        <div key={t} style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md, color: "var(--text-muted)" }}>
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t}>{t}</span>
                                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{c}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: V5_COLORS.win }}>✅ 系统非常健康（All Clear）</div>
                            )}
                        </GlassPanel>

                        <GlassPanel>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SPACE.md, marginBottom: SPACE.sm }}>
                                <div style={{ fontWeight: 800 }}>🧠 系统诊断</div>
                                <div style={{ color: "var(--text-muted)" }}>{schemaScanNote ? "已扫描" : "未扫描"}</div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${SPACE.xs} ${SPACE.xl}`, fontSize: "0.9em", color: "var(--text-muted)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}><span>枚举预设</span><span>{enumPresets ? "✅ 已加载" : "—"}</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}><span>标签扫描</span><span>{paTagSnapshot ? "✅ 正常" : "—"}</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}><span>交易记录</span><span>{tradesCount}</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}><span>笔记档案</span><span>{filesCount}</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}><span>标签总数</span><span>{tagsCount}</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}><span>属性管理器</span><span>✅ 可用</span></div>
                            </div>
                        </GlassPanel>
                    </div>

                    <GlassCard style={{ marginBottom: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", marginBottom: "8px" }}>
                            <div style={{ fontWeight: 800 }}>⚠️ 异常详情</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>{issueCount}</div>
                        </div>
                        {schemaIssues.length === 0 ? (
                            <div style={{ color: V5_COLORS.win, fontSize: "0.9em" }}>✅ 无异常</div>
                        ) : (
                            <GlassPanel style={{ maxHeight: "260px", overflow: "auto" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "10px", padding: "8px", borderBottom: "1px solid var(--background-modifier-border)", color: "var(--text-faint)", fontSize: "0.85em", background: "transparent" }}>
                                    <div>文件</div>
                                    <div>问题</div>
                                    <div>字段</div>
                                </div>
                                {schemaIssues.slice(0, 80).map((item: any, idx: number) => (
                                    <button
                                        key={`${item.path}:${item.key}:${idx}`}
                                        type="button"
                                        onClick={() => openFile(item.path)}
                                        title={item.path}
                                        onMouseEnter={onTextBtnMouseEnter}
                                        onMouseLeave={onTextBtnMouseLeave}
                                        onFocus={onTextBtnFocus}
                                        onBlur={onTextBtnBlur}
                                        style={{ width: "100%", textAlign: "left", padding: 0, border: "none", borderBottom: "1px solid var(--background-modifier-border)", background: "transparent", cursor: "pointer", outline: "none" }}
                                    >
                                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "10px", padding: "10px", alignItems: "baseline" }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                                                <div style={{ color: "var(--text-faint)", fontSize: "0.85em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.path}</div>
                                            </div>
                                            <div style={{ color: "var(--text-error)", fontWeight: 700, whiteSpace: "nowrap" }}>{item.type}</div>
                                            <div style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.key}>{item.key}</div>
                                        </div>
                                    </button>
                                ))}
                            </GlassPanel>
                        )}
                    </GlassCard>

                    <GlassPanel style={{ marginBottom: "12px" }}>
                        <details>
                            <summary style={{ cursor: "pointer", fontWeight: 800, listStyle: "none" }}>
                                📊 分布摘要（可展开）
                                <span style={{ marginLeft: "10px", color: "var(--text-faint)", fontSize: "0.9em", fontWeight: 600 }}>完整图像建议看 Schema</span>
                            </summary>
                            <div style={{ marginTop: "10px" }}>
                                <div style={{ border: "1px solid var(--background-modifier-border)", borderRadius: "10px", padding: "10px", background: "var(--background-primary)" }}>
                                    <div style={{ fontWeight: 800, marginBottom: "8px" }}>标签全景（Tag System）</div>
                                    {!paTagSnapshot ? (
                                        <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>不可用。</div>
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
                                                    style={{ padding: "2px 8px", borderRadius: "999px", border: "1px solid var(--background-modifier-border)", background: "var(--background-primary)", fontSize: "0.85em", color: "var(--text-muted)", cursor: "pointer" }}
                                                >
                                                    #{tag} <span style={{ opacity: 0.7 }}>({count})</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </details>
                    </GlassPanel>

                    <GlassCard style={{ marginBottom: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", marginBottom: "10px" }}>
                            <div style={{ fontWeight: 800 }}>📄 原始数据明细（Raw Data）</div>
                            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>最近 {sortedRecent.length} 笔</div>
                        </div>
                        <GlassPanel style={{ overflow: "auto", maxHeight: "260px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "90px 110px 120px 1fr 100px 120px", gap: "10px", padding: "10px", borderBottom: "1px solid var(--background-modifier-border)", color: "var(--text-faint)", fontSize: "0.85em", background: "var(--background-primary)" }}>
                                <div>日期</div><div>品种</div><div>周期</div><div>策略</div><div>结果</div><div>执行</div>
                            </div>
                            {sortedRecent.map((t: any) => (
                                <button
                                    key={t.path}
                                    type="button"
                                    onClick={() => openFile(t.path)}
                                    title={t.path}
                                    onMouseEnter={onTextBtnMouseEnter}
                                    onMouseLeave={onTextBtnMouseLeave}
                                    onFocus={onTextBtnFocus}
                                    onBlur={onTextBtnBlur}
                                    style={{ width: "100%", textAlign: "left", padding: 0, border: "none", borderBottom: "1px solid var(--background-modifier-border)", background: "transparent", cursor: "pointer", outline: "none" }}
                                >
                                    <div style={{ display: "grid", gridTemplateColumns: "90px 110px 120px 1fr 100px 120px", gap: "10px", padding: "10px", alignItems: "baseline", fontSize: "0.9em" }}>
                                        <div style={{ color: "var(--text-muted)" }}>{t.dateIso}</div>
                                        <div style={{ fontWeight: 650 }}>{t.ticker ?? "—"}</div>
                                        <div style={{ color: "var(--text-muted)" }}>{t.timeframe ?? "—"}</div>
                                        <div style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.setupKey ?? t.setupCategory ?? ""}>{prettySchemaVal(t.setupKey ?? t.setupCategory) || "—"}</div>
                                        <div style={{ color: "var(--text-muted)" }}>{t.outcome ?? "unknown"}</div>
                                        <div style={{ color: "var(--text-muted)" }}>{prettyExecVal(t.executionQuality) || "—"}</div>
                                    </div>
                                </button>
                            ))}
                        </GlassPanel>
                    </GlassCard>
                </div>
            </GlassCard>

            <GlassCard style={{ marginBottom: SPACE.lg }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE.md, marginBottom: SPACE.md }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <HeadingM>🛠 资源管理器 (Manager)</HeadingM>
                        {managerInspectorTab === "files" && (
                            <ButtonGhost onClick={() => setManagerInspectorTab("vals")}>
                                ⬅️ 返回列表
                            </ButtonGhost>
                        )}
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                        <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", borderRadius: "6px", padding: "2px" }}>
                            <button
                                type="button"
                                style={{ padding: "4px 12px", borderRadius: "4px", background: managerScope === "trade" ? "var(--interactive-accent)" : "transparent", color: managerScope === "trade" ? "white" : "var(--text-muted)", border: "none", cursor: "pointer", fontSize: "0.85em", fontWeight: 700 }}
                                onClick={() => { setManagerScope("trade"); setManagerInspectorTab("vals"); }}
                            >
                                交易 (Trade)
                            </button>
                            <button
                                type="button"
                                style={{ padding: "4px 12px", borderRadius: "4px", background: managerScope === "strategy" ? "var(--interactive-accent)" : "transparent", color: managerScope === "strategy" ? "white" : "var(--text-muted)", border: "none", cursor: "pointer", fontSize: "0.85em", fontWeight: 700 }}
                                onClick={() => { setManagerScope("strategy"); setManagerInspectorTab("vals"); }}
                            >
                                策略 (Strategy)
                            </button>
                        </div>
                        <ButtonGhost onClick={scanManagerInventory} disabled={managerBusy}>
                            {managerBusy ? "扫描中..." : "🔄 刷新全库索引"}
                        </ButtonGhost>
                    </div>
                </div>

                {managerInspectorTab === "files" ? (
                    <ManagerFileInspector
                        files={managerScope === "trade"
                            ? selectManagerTradeFiles(managerInspectorFileFilter?.paths ?? [])
                            : selectManagerStrategyFiles(managerInspectorFileFilter?.paths ?? [])
                        }
                        title={managerInspectorFileFilter?.label ?? "Selected Files"}
                        onOpenFile={openFile}
                    />
                ) : (
                    <ManagerInventoryGrid
                        inventory={activeInventory}
                        search={managerSearch}
                        onSearch={setManagerSearch}
                        onSelectFiles={handleSelectFiles}
                        onRenameKey={handleRenameKey}
                        onDeleteKey={handleDeleteKey}
                        onUpdateVal={handleUpdateVal}
                        onDeleteVal={handleDeleteVal}
                    />
                )}
            </GlassCard>

            <div style={{ marginTop: "40px", borderTop: "1px solid var(--background-modifier-border)", paddingTop: "20px" }}>
                <HeadingM style={{ marginBottom: "12px", color: "var(--text-muted)" }}>
                    💾 数据安全与迁移 (Data Security & Migration)
                </HeadingM>
                <GlassPanel style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                        将当前所有交易数据导出为 JSON 备份，用于迁移或分析。
                    </div>
                    <ButtonGhost onClick={() => runCommand("obsidian-al-brooks-console:backup-data")}>
                        📥 备份数据库 (Export)
                    </ButtonGhost>
                </GlassPanel>
            </div>
        </>
    );
};

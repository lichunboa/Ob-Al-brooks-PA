import * as React from "react";
import type { FrontmatterInventory } from "../../../core/manager";
import { Button } from "../../../ui/components/Button";
import { SPACE } from "../../../ui/styles/dashboardPrimitives";
import { V5_COLORS } from "../../../ui/tokens";
import { prettyManagerVal } from "../../../utils/format-utils";

export interface PropertyInspectorProps {
    scope: "trade" | "strategy";
    inspectorKey: string | undefined;
    inventory: FrontmatterInventory | undefined;
    inspectorTab: "vals" | "files";
    fileFilter: { paths: string[]; label?: string } | undefined;
    managerBusy: boolean;

    onClose: () => void;
    setInspectorTab: (tab: "vals" | "files") => void;
    setFileFilter: (filter: { paths: string[]; label?: string } | undefined) => void;

    selectFiles: (paths: string[]) => any[];
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

    openFile: (path: string) => void;
    promptText?: (options: any) => Promise<string | null>;
    confirmDialog?: (options: any) => Promise<boolean>;
}

export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
    scope,
    inspectorKey,
    inventory,
    inspectorTab,
    fileFilter,
    managerBusy,
    onClose,
    setInspectorTab,
    setFileFilter,
    selectFiles,
    runManagerPlan,
    buildRenameKeyPlan,
    buildDeleteKeyPlan,
    buildAppendValPlan,
    buildInjectPropPlan,
    buildUpdateValPlan,
    buildDeleteValPlan,
    openFile,
    promptText,
    confirmDialog,
}) => {
    if (!inspectorKey || !inventory) return null;

    const key = inspectorKey;
    const allPaths = inventory.keyPaths[key] ?? [];
    const perVal = inventory.valPaths[key] ?? {};
    const sortedVals = Object.entries(perVal).sort(
        (a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)
    );
    const currentPaths = fileFilter?.paths ?? allPaths;
    const filterLabel = fileFilter?.label;

    const doRenameKey = async () => {
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
            selectFiles(allPaths),
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
        const ok =
            (await confirmDialog?.({
                title: "确认删除属性",
                message: `⚠️ 将从所有关联文件中删除属性：\n${key}`,
                okText: "删除",
                cancelText: "取消",
            })) ?? false;
        if (!ok) return;
        const plan = buildDeleteKeyPlan(
            selectFiles(allPaths),
            key
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            forceDeleteKeys: true,
            refreshInventory: true,
        });
    };

    const doAppendVal = async () => {
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
            selectFiles(allPaths),
            key,
            val
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            refreshInventory: true,
        });
    };

    const doInjectProp = async () => {
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
            selectFiles(currentPaths),
            newKey,
            newVal
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            refreshInventory: true,
        });
    };

    const doUpdateVal = async (
        val: string,
        paths: string[]
    ) => {
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
            selectFiles(paths),
            key,
            val,
            next
        );
        await runManagerPlan(plan, {
            closeInspector: true,
            refreshInventory: true,
        });
    };

    const doDeleteVal = async (
        val: string,
        paths: string[]
    ) => {
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
            selectFiles(paths),
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

    const showFilesForVal = (
        val: string,
        paths: string[]
    ) => {
        setInspectorTab("files");
        setFileFilter({
            paths,
            label: `值: ${val}`,
        });
    };

    return (
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.35)",
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
            }}
        >
            <div
                style={{
                    width: "min(860px, 95vw)",
                    maxHeight: "85vh",
                    overflow: "hidden",
                    borderRadius: "12px",
                    border:
                        "1px solid var(--background-modifier-border)",
                    background: "var(--background-primary)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 14px",
                        borderBottom:
                            "1px solid var(--background-modifier-border)",
                    }}
                >
                    <div style={{ fontWeight: 800 }}>
                        {key}
                        <span
                            style={{
                                color: "var(--text-faint)",
                                fontSize: "0.9em",
                                marginLeft: "10px",
                                fontWeight: 600,
                            }}
                        >
                            {scope === "strategy"
                                ? "策略"
                                : "交易"}
                        </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <Button
                            variant="small"
                            disabled={managerBusy}
                            onClick={doDeleteKey}
                        >
                            🗑️ 删除属性
                        </Button>
                        <Button
                            variant="small"
                            onClick={onClose}
                        >
                            关闭
                        </Button>
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: "8px",
                        padding: "10px 14px",
                        borderBottom:
                            "1px solid var(--background-modifier-border)",
                        background: "var(--background-secondary)",
                    }}
                >
                    <Button
                        variant={
                            inspectorTab === "vals" ? "default" : "text"
                        }
                        onClick={() => {
                            setInspectorTab("vals");
                            setFileFilter(undefined);
                        }}
                    >
                        属性值 ({sortedVals.length})
                    </Button>
                    <Button
                        variant={
                            inspectorTab === "files" ? "default" : "text"
                        }
                        onClick={() => setInspectorTab("files")}
                    >
                        相关文件 ({currentPaths.length})
                    </Button>

                    {filterLabel && (
                        <div
                            style={{
                                marginLeft: "auto",
                                fontSize: "0.85em",
                                background: "var(--interactive-accent)",
                                color: "var(--text-on-accent)",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
                        >
                            <span>过滤: {filterLabel}</span>
                            <span
                                style={{
                                    cursor: "pointer",
                                    fontWeight: 800,
                                }}
                                onClick={() => {
                                    setInspectorTab("vals");
                                    setFileFilter(undefined);
                                }}
                            >
                                ✕
                            </span>
                        </div>
                    )}
                </div>

                <div
                    style={{
                        padding: "10px 14px",
                        overflow: "auto",
                        flex: "1 1 auto",
                        minHeight: "300px",
                    }}
                >
                    {inspectorTab === "vals" ? (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fill, minmax(280px, 1fr))",
                                gap: SPACE.md,
                            }}
                        >
                            {sortedVals.map(([val, paths]) => (
                                <div
                                    key={val}
                                    style={{
                                        border:
                                            "1px solid var(--background-modifier-border)",
                                        borderRadius: "8px",
                                        padding: "10px",
                                        background: "var(--background-primary)",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "flex-start",
                                            marginBottom: "8px",
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontWeight: 600,
                                                wordBreak: "break-all",
                                            }}
                                        >
                                            {prettyManagerVal(val)}
                                        </div>
                                        <div
                                            style={{
                                                color: "var(--text-faint)",
                                                fontSize: "0.9em",
                                                fontWeight: 800,
                                            }}
                                        >
                                            {paths?.length ?? 0}
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: "6px",
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <Button
                                            variant="small"
                                            onClick={() =>
                                                showFilesForVal(val, paths)
                                            }
                                        >
                                            📄 查看文件
                                        </Button>
                                        <Button
                                            variant="small"
                                            onClick={() => doUpdateVal(val, paths)}
                                        >
                                            ✏️ 改值
                                        </Button>
                                        <Button
                                            variant="small"
                                            style={{
                                                color: V5_COLORS.loss,
                                            }}
                                            onClick={() => doDeleteVal(val, paths)}
                                        >
                                            🗑️ 删值
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {sortedVals.length === 0 && (
                                <div style={{ color: "var(--text-faint)" }}>
                                    没有检测到值。
                                </div>
                            )}
                        </div>
                    ) : (
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                            }}
                        >
                            {currentPaths.slice(0, 100).map((p) => {
                                const base = p.split("/").pop() ?? p;
                                const dir = p.substring(0, p.length - base.length);
                                return (
                                    <div
                                        key={p}
                                        onClick={() => openFile(p)}
                                        style={{
                                            padding: "6px 8px",
                                            borderBottom:
                                                "1px solid var(--background-modifier-border)",
                                            cursor: "pointer",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            fontSize: "0.9em",
                                        }}
                                    >
                                        <span>
                                            <span
                                                style={{
                                                    color: "var(--text-muted)",
                                                    fontSize: "0.85em",
                                                    marginRight: "4px",
                                                }}
                                            >
                                                {dir}
                                            </span>
                                            <span style={{ fontWeight: 600 }}>
                                                {base}
                                            </span>
                                        </span>
                                        <span style={{ opacity: 0.5 }}>↗</span>
                                    </div>
                                );
                            })}
                            {currentPaths.length > 100 && (
                                <div
                                    style={{
                                        padding: "10px",
                                        textAlign: "center",
                                        color: "var(--text-faint)",
                                    }}
                                >
                                    ...还有 {currentPaths.length - 100} 个文件
                                </div>
                            )}
                            {currentPaths.length === 0 && (
                                <div
                                    style={{
                                        padding: "20px",
                                        textAlign: "center",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    没有相关文件。
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div
                    style={{
                        padding: "10px 14px",
                        borderTop:
                            "1px solid var(--background-modifier-border)",
                        display: "flex",
                        gap: "10px",
                        justifyContent: "flex-end",
                        background: "var(--background-secondary)",
                    }}
                >
                    <Button
                        variant="small"
                        onClick={doRenameKey}
                        disabled={managerBusy}
                    >
                        ✏️ 重命名属性
                    </Button>
                    <Button
                        variant="small"
                        onClick={doAppendVal}
                        disabled={managerBusy}
                        style={{ color: V5_COLORS.accent }}
                    >
                        ➕ 追加新值
                    </Button>
                    <Button
                        variant="small"
                        onClick={doInjectProp}
                        disabled={managerBusy}
                        style={{ color: V5_COLORS.accent }}
                    >
                        💉 注入属性
                    </Button>
                </div>
            </div>
        </div>
    );
};

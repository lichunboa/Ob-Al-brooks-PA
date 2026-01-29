/**
 * PropertyInspector 组件
 * 属性检查器弹窗（Crystal Inspector）
 */

import * as React from "react";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { glassPanelStyle, glassCardStyle } from "../../../ui/styles/glass";
import type { PropertyStats, BatchOperation, BatchResult } from "../../../core/property-manager";

interface PropertyInspectorProps {
    property: PropertyStats;
    allPaths: string[];
    onClose: () => void;
    onBatchUpdate: (paths: string[], operation: BatchOperation) => Promise<BatchResult>;
    onOpenFile: (path: string) => void;
}

export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
    property,
    allPaths,
    onClose,
    onBatchUpdate,
    onOpenFile
}) => {
    const [activeTab, setActiveTab] = React.useState<'vals' | 'files'>('vals');
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [filteredPaths, setFilteredPaths] = React.useState<string[] | null>(null);
    const [filterLabel, setFilterLabel] = React.useState<string | null>(null);

    // 自定义 Prompt
    const customPrompt = (title: string, defaultValue: string = ""): Promise<string | null> => {
        return new Promise(resolve => {
            const value = prompt(title, defaultValue);
            resolve(value);
        });
    };

    // 自定义 Confirm
    const customConfirm = (msg: string): Promise<boolean> => {
        return new Promise(resolve => {
            resolve(confirm(msg));
        });
    };

    // 处理批量操作
    const handleBatch = async (paths: string[], operation: BatchOperation) => {
        setIsProcessing(true);
        try {
            const result = await onBatchUpdate(paths, operation);
            if (result.success > 0) {
                onClose();
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // 重命名属性
    const handleRename = async () => {
        const newKey = await customPrompt(`重命名属性 "${property.key}"`, property.key);
        if (newKey && newKey !== property.key) {
            if (await customConfirm(`确认将 "${property.key}" 重命名为 "${newKey}"？\n将影响 ${allPaths.length} 个文件`)) {
                await handleBatch(allPaths, { type: 'RENAME_KEY', oldKey: property.key, newKey });
            }
        }
    };

    // 删除属性
    const handleDeleteKey = async () => {
        if (await customConfirm(`⚠️ 确认删除属性 "${property.key}"？\n将从 ${allPaths.length} 个文件中移除该属性`)) {
            await handleBatch(allPaths, { type: 'DELETE_KEY', key: property.key });
        }
    };

    // 修改值
    const handleUpdateValue = async (oldVal: string, paths: string[]) => {
        const newVal = await customPrompt(`修改值`, oldVal);
        if (newVal && newVal !== oldVal) {
            if (await customConfirm(`确认将 "${oldVal}" 修改为 "${newVal}"？\n将影响 ${paths.length} 个文件`)) {
                await handleBatch(paths, { type: 'UPDATE_VAL', key: property.key, oldVal, newVal });
            }
        }
    };

    // 删除值
    const handleDeleteValue = async (val: string, paths: string[]) => {
        if (await customConfirm(`确认删除值 "${val}"？\n将从 ${paths.length} 个文件中移除`)) {
            await handleBatch(paths, { type: 'DELETE_VAL', key: property.key, val });
        }
    };

    // 追加新值
    const handleAppendValue = async () => {
        const val = await customPrompt(`追加新值到 "${property.key}"`);
        if (val) {
            if (await customConfirm(`确认追加值 "${val}"？\n将添加到 ${allPaths.length} 个文件`)) {
                await handleBatch(allPaths, { type: 'APPEND_VAL', key: property.key, val });
            }
        }
    };

    // 注入属性
    const handleInject = async (paths: string[]) => {
        const newKey = await customPrompt("新属性名");
        if (!newKey) return;
        const newVal = await customPrompt(`"${newKey}" 的值`);
        if (!newVal) return;
        if (await customConfirm(`确认注入属性 "${newKey}: ${newVal}"？\n将添加到 ${paths.length} 个文件`)) {
            await handleBatch(paths, { type: 'INJECT_PROP', newKey, newVal });
        }
    };

    // 查看某个值的文件
    const handleViewFiles = (val: string, paths: string[]) => {
        setFilteredPaths(paths);
        setFilterLabel(`值: ${val}`);
        setActiveTab('files');
    };

    // 重置过滤
    const handleResetFilter = () => {
        setFilteredPaths(null);
        setFilterLabel(null);
    };

    const displayPaths = filteredPaths || allPaths;

    // 按钮基础样式
    const btnStyle: React.CSSProperties = {
        padding: "8px 12px",
        borderRadius: "6px",
        border: "1px solid var(--background-modifier-border)",
        background: "var(--background-modifier-form-field)",
        color: "var(--text-normal)",
        cursor: "pointer",
        fontSize: "0.85em"
    };

    const btnPrimaryStyle: React.CSSProperties = {
        ...btnStyle,
        background: "var(--interactive-accent)",
        border: "none",
        color: "white"
    };

    const btnDangerStyle: React.CSSProperties = {
        ...btnStyle,
        background: "transparent",
        border: "1px solid var(--text-error)",
        color: "var(--text-error)"
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(8px)",
                zIndex: 9000,
                display: "flex",
                justifyContent: "center",
                alignItems: "center"
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                style={{
                    ...glassPanelStyle,
                    width: "680px",
                    maxWidth: "95vw",
                    maxHeight: "85vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden"
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div style={{
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid var(--background-modifier-border)"
                }}>
                    <span style={{
                        fontSize: "1.1em",
                        fontWeight: 700,
                        fontFamily: "var(--font-monospace)"
                    }}>
                        {property.key}
                    </span>
                    <button
                        onClick={handleDeleteKey}
                        disabled={isProcessing}
                        style={btnDangerStyle}
                    >
                        🗑️ 删除属性
                    </button>
                </div>

                {/* 标签页 */}
                <div style={{
                    display: "flex",
                    borderBottom: "1px solid var(--background-modifier-border)",
                    background: "var(--background-primary-alt)"
                }}>
                    <div
                        style={{
                            padding: "12px 16px",
                            cursor: "pointer",
                            fontWeight: 600,
                            color: activeTab === 'vals' ? "var(--text-accent)" : "var(--text-muted)",
                            borderBottom: activeTab === 'vals' ? "2px solid var(--text-accent)" : "2px solid transparent",
                            transition: "0.2s"
                        }}
                        onClick={() => setActiveTab('vals')}
                    >
                        属性值 ({property.values.length})
                    </div>
                    <div
                        style={{
                            padding: "12px 16px",
                            cursor: "pointer",
                            fontWeight: 600,
                            color: activeTab === 'files' ? "var(--text-accent)" : "var(--text-muted)",
                            borderBottom: activeTab === 'files' ? "2px solid var(--text-accent)" : "2px solid transparent",
                            transition: "0.2s"
                        }}
                        onClick={() => { setActiveTab('files'); handleResetFilter(); }}
                    >
                        关联文件 ({allPaths.length})
                    </div>
                </div>

                {/* 内容区 */}
                <div style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "8px 0"
                }}>
                    {activeTab === 'vals' && (
                        <div>
                            {property.values.length === 0 ? (
                                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                                    无值记录
                                </div>
                            ) : (
                                property.values.map((v, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            padding: "10px 20px",
                                            borderBottom: "1px solid var(--background-modifier-border)"
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                            <span style={{
                                                background: "var(--background-modifier-form-field)",
                                                padding: "4px 10px",
                                                borderRadius: "6px",
                                                fontFamily: "var(--font-monospace)",
                                                fontSize: "0.9em"
                                            }}>
                                                {v.value}
                                            </span>
                                            <span style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                                                {v.paths.length}
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", gap: "6px" }}>
                                            <button
                                                onClick={() => handleUpdateValue(v.value, v.paths)}
                                                disabled={isProcessing}
                                                style={btnStyle}
                                                title="修改"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => handleDeleteValue(v.value, v.paths)}
                                                disabled={isProcessing}
                                                style={btnStyle}
                                                title="删除"
                                            >
                                                🗑️
                                            </button>
                                            <button
                                                onClick={() => handleViewFiles(v.value, v.paths)}
                                                style={btnStyle}
                                                title="查看文件"
                                            >
                                                👁️
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'files' && (
                        <div>
                            {filterLabel && (
                                <div style={{
                                    padding: "10px 20px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    background: "var(--background-primary-alt)",
                                    color: "var(--text-accent)",
                                    fontWeight: 600,
                                    fontSize: "0.9em"
                                }}>
                                    <span>🔍 筛选: {filterLabel}</span>
                                    <span
                                        style={{ cursor: "pointer", opacity: 0.7 }}
                                        onClick={handleResetFilter}
                                    >
                                        ✕ 重置
                                    </span>
                                </div>
                            )}
                            {displayPaths.slice(0, 100).map((path, i) => (
                                <div
                                    key={i}
                                    style={{
                                        padding: "8px 20px",
                                        cursor: "pointer",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        borderBottom: "1px solid var(--background-modifier-border)",
                                        color: "var(--text-muted)",
                                        fontSize: "0.9em"
                                    }}
                                    onClick={() => onOpenFile(path)}
                                >
                                    <span style={{ color: "var(--text-normal)" }}>
                                        {path.split("/").pop()}
                                    </span>
                                    <span style={{ opacity: 0.5, fontSize: "0.85em" }}>
                                        {path}
                                    </span>
                                </div>
                            ))}
                            {displayPaths.length > 100 && (
                                <div style={{ padding: "12px 20px", color: "var(--text-muted)", textAlign: "center" }}>
                                    还有 {displayPaths.length - 100} 个文件未显示...
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 底部操作 */}
                <div style={{
                    padding: "14px 20px",
                    borderTop: "1px solid var(--background-modifier-border)",
                    background: "var(--background-primary-alt)",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px"
                }}>
                    {activeTab === 'vals' && (
                        <>
                            <button
                                onClick={handleRename}
                                disabled={isProcessing}
                                style={btnStyle}
                            >
                                ✏️ 重命名属性
                            </button>
                            <button
                                onClick={handleAppendValue}
                                disabled={isProcessing}
                                style={btnPrimaryStyle}
                            >
                                ➕ 追加新值
                            </button>
                        </>
                    )}
                    {activeTab === 'files' && (
                        <button
                            onClick={() => handleInject(displayPaths)}
                            disabled={isProcessing}
                            style={btnPrimaryStyle}
                        >
                            💉 注入属性
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

/**
 * PropertyInspector 组件
 * 属性检查器弹窗（Crystal Inspector）
 */

import * as React from "react";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
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
                onClose(); // 成功后关闭弹窗
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

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
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
                    background: "rgba(15, 23, 42, 0.95)",
                    backdropFilter: "blur(24px)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "16px",
                    width: "680px",
                    maxWidth: "95vw",
                    maxHeight: "85vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    boxShadow: "0 50px 120px rgba(0,0,0,0.8)"
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div style={{
                    padding: "20px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    background: "rgba(255,255,255,0.02)"
                }}>
                    <span style={{
                        fontSize: "1.3em",
                        fontWeight: 800,
                        fontFamily: "'JetBrains Mono', monospace"
                    }}>
                        {property.key}
                    </span>
                    <button
                        onClick={handleDeleteKey}
                        disabled={isProcessing}
                        style={{
                            padding: "8px 14px",
                            borderRadius: "8px",
                            border: "1px solid rgba(248, 113, 113, 0.3)",
                            background: "transparent",
                            color: "#f87171",
                            cursor: "pointer",
                            fontSize: "0.9em"
                        }}
                    >
                        🗑️ 删除属性
                    </button>
                </div>

                {/* 标签页 */}
                <div style={{
                    display: "flex",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    background: "rgba(0,0,0,0.2)"
                }}>
                    <div
                        style={{
                            padding: "14px 20px",
                            cursor: "pointer",
                            fontWeight: 600,
                            color: activeTab === 'vals' ? "var(--interactive-accent)" : "var(--text-muted)",
                            borderBottom: activeTab === 'vals' ? "2px solid var(--interactive-accent)" : "2px solid transparent",
                            transition: "0.2s"
                        }}
                        onClick={() => setActiveTab('vals')}
                    >
                        属性值 ({property.values.length})
                    </div>
                    <div
                        style={{
                            padding: "14px 20px",
                            cursor: "pointer",
                            fontWeight: 600,
                            color: activeTab === 'files' ? "var(--interactive-accent)" : "var(--text-muted)",
                            borderBottom: activeTab === 'files' ? "2px solid var(--interactive-accent)" : "2px solid transparent",
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
                                            padding: "12px 24px",
                                            borderBottom: "1px solid rgba(255,255,255,0.03)",
                                            transition: "0.15s"
                                        }}
                                        className="property-row"
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                            <span style={{
                                                background: "rgba(255,255,255,0.08)",
                                                padding: "6px 12px",
                                                borderRadius: "6px",
                                                fontFamily: "'JetBrains Mono', monospace",
                                                fontSize: "0.9em"
                                            }}>
                                                {v.value}
                                            </span>
                                            <span style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                                                {v.paths.length}
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            <InteractiveButton
                                                interaction="text"
                                                onClick={() => handleUpdateValue(v.value, v.paths)}
                                                disabled={isProcessing}
                                                title="修改"
                                            >
                                                ✏️
                                            </InteractiveButton>
                                            <InteractiveButton
                                                interaction="text"
                                                onClick={() => handleDeleteValue(v.value, v.paths)}
                                                disabled={isProcessing}
                                                title="删除"
                                            >
                                                🗑️
                                            </InteractiveButton>
                                            <InteractiveButton
                                                interaction="text"
                                                onClick={() => handleViewFiles(v.value, v.paths)}
                                                title="查看文件"
                                            >
                                                👁️
                                            </InteractiveButton>
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
                                    padding: "12px 24px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    background: "rgba(56, 189, 248, 0.1)",
                                    color: "var(--interactive-accent)",
                                    fontWeight: 600
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
                                        padding: "10px 24px",
                                        cursor: "pointer",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                                        transition: "0.15s",
                                        color: "var(--text-muted)"
                                    }}
                                    onClick={() => onOpenFile(path)}
                                    className="property-file"
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
                                <div style={{ padding: "12px 24px", color: "var(--text-muted)", textAlign: "center" }}>
                                    还有 {displayPaths.length - 100} 个文件未显示...
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 底部操作 */}
                <div style={{
                    padding: "16px 24px",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    background: "rgba(0,0,0,0.2)",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px"
                }}>
                    {activeTab === 'vals' && (
                        <>
                            <button
                                onClick={handleRename}
                                disabled={isProcessing}
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    background: "transparent",
                                    color: "var(--text-muted)",
                                    cursor: "pointer"
                                }}
                            >
                                ✏️ 重命名属性
                            </button>
                            <button
                                onClick={handleAppendValue}
                                disabled={isProcessing}
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: "8px",
                                    border: "none",
                                    background: "var(--interactive-accent)",
                                    color: "white",
                                    cursor: "pointer"
                                }}
                            >
                                ➕ 追加新值
                            </button>
                        </>
                    )}
                    {activeTab === 'files' && (
                        <button
                            onClick={() => handleInject(displayPaths)}
                            disabled={isProcessing}
                            style={{
                                padding: "10px 16px",
                                borderRadius: "8px",
                                border: "none",
                                background: "var(--interactive-accent)",
                                color: "white",
                                cursor: "pointer"
                            }}
                        >
                            💉 注入属性
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

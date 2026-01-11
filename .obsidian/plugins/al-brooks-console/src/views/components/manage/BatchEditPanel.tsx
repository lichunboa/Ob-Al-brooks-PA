/**
 * BatchEditPanel - 批量修改面板
 * 
 * 用于批量修改交易笔记的字段值
 * Week 3, Day 11-12
 */

import * as React from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { TradeRecord } from "../../../core/contracts";
import { ActionService } from "../../../core/action/action-service";
import type { BatchActionResult } from "../../../core/action/types";
import { Button } from "../../../ui/components/Button";
import { glassCardStyle } from "../../../ui/styles/dashboardPrimitives";
import type { TradeIndex } from "../../../core/trade-index";

interface BatchEditPanelProps {
    index: TradeIndex;
    trades: TradeRecord[];
}

// 可编辑的字段列表
const EDITABLE_FIELDS = [
    { key: 'accountType', label: '账户类型', type: 'enum', options: ['Live', 'Demo', 'Backtest'] },
    { key: 'outcome', label: '结果', type: 'enum', options: ['win', 'loss', 'scratch', 'open', 'unknown'] },
    { key: 'ticker', label: '品种', type: 'string' },
    { key: 'timeframe', label: '时间周期', type: 'string' },
    { key: 'direction', label: '方向', type: 'string' },
    { key: 'setupKey', label: '形态', type: 'string' },
    { key: 'strategyName', label: '策略名称', type: 'string' },
    { key: 'executionQuality', label: '执行评价', type: 'string' },
] as const;

export const BatchEditPanel: React.FC<BatchEditPanelProps> = ({ index, trades }) => {
    const [selectedFiles, setSelectedFiles] = React.useState<string[]>([]);
    const [fieldToEdit, setFieldToEdit] = React.useState<string>('');
    const [newValue, setNewValue] = React.useState<string>('');
    const [previewResult, setPreviewResult] = React.useState<BatchActionResult | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [showPreview, setShowPreview] = React.useState(false);

    const app = (index as any).app as App | undefined;

    const actionService = React.useMemo(() => {
        if (!app) return null;
        return new ActionService(app);
    }, [app]);

    if (!app || !actionService) {
        return null;
    }

    // 获取选中字段的配置
    const selectedField = EDITABLE_FIELDS.find(f => f.key === fieldToEdit);

    // 切换文件选择
    const toggleFileSelection = (path: string) => {
        setSelectedFiles(prev =>
            prev.includes(path)
                ? prev.filter(p => p !== path)
                : [...prev, path]
        );
    };

    // 全选/取消全选
    const toggleSelectAll = () => {
        if (selectedFiles.length === trades.length) {
            setSelectedFiles([]);
        } else {
            setSelectedFiles(trades.map(t => t.path || '').filter(Boolean));
        }
    };

    // 预览变更
    const handlePreview = async () => {
        if (!fieldToEdit || newValue === '' || selectedFiles.length === 0) {
            new Notice('请选择文件、字段和新值');
            return;
        }

        setIsLoading(true);
        try {
            const items = selectedFiles.map(path => ({
                path,
                updates: { [fieldToEdit]: newValue }
            }));

            const result = await actionService.batchUpdateTrades(items, {
                dryRun: true,
                validate: true
            });

            setPreviewResult(result);
            setShowPreview(true);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`预览失败: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 执行批量更新
    const handleConfirm = async () => {
        if (!previewResult) return;

        setIsLoading(true);
        setShowPreview(false);

        try {
            const items = selectedFiles.map(path => ({
                path,
                updates: { [fieldToEdit]: newValue }
            }));

            const result = await actionService.batchUpdateTrades(items, {
                dryRun: false,
                validate: true
            });

            if (result.failed === 0) {
                new Notice(`✅ 批量更新完成: 全部成功 (${result.total}个)`);
            } else {
                new Notice(`⚠️ 批量更新完成: ${result.succeeded}成功, ${result.failed}失败`);
            }

            // 重置状态
            setSelectedFiles([]);
            setFieldToEdit('');
            setNewValue('');
            setPreviewResult(null);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`批量更新失败: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ ...glassCardStyle, marginBottom: "24px" }}>
            <div style={{
                padding: "16px",
                borderBottom: "1px solid var(--background-modifier-border)"
            }}>
                <h3 style={{
                    margin: 0,
                    fontSize: "1.1em",
                    fontWeight: 600,
                    color: "var(--text-normal)"
                }}>
                    ✏️ 批量修改
                </h3>
                <div style={{
                    marginTop: "8px",
                    fontSize: "0.9em",
                    color: "var(--text-faint)"
                }}>
                    批量修改交易笔记的字段值
                </div>
            </div>

            <div style={{ padding: "16px" }}>
                {/* 步骤 1: 选择文件 */}
                <div style={{ marginBottom: "20px" }}>
                    <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "12px"
                    }}>
                        <h4 style={{
                            margin: 0,
                            fontSize: "0.95em",
                            fontWeight: 600,
                            color: "var(--text-normal)"
                        }}>
                            1. 选择文件 ({selectedFiles.length}/{trades.length})
                        </h4>
                        <Button
                            variant="text"
                            onClick={toggleSelectAll}
                        >
                            {selectedFiles.length === trades.length ? '取消全选' : '全选'}
                        </Button>
                    </div>

                    <div style={{
                        maxHeight: "200px",
                        overflow: "auto",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "6px",
                        padding: "8px"
                    }}>
                        {trades.slice(0, 50).map((trade, idx) => (
                            <label
                                key={idx}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "4px 8px",
                                    cursor: "pointer",
                                    fontSize: "0.85em",
                                    color: "var(--text-normal)"
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedFiles.includes(trade.path || '')}
                                    onChange={() => toggleFileSelection(trade.path || '')}
                                    style={{ marginRight: "8px" }}
                                />
                                {trade.path?.split('/').pop() || 'N/A'} - {trade.ticker || 'N/A'}
                            </label>
                        ))}
                        {trades.length > 50 && (
                            <div style={{
                                padding: "8px",
                                fontSize: "0.85em",
                                color: "var(--text-faint)",
                                textAlign: "center"
                            }}>
                                仅显示前 50 个文件,请使用全选功能选择所有文件
                            </div>
                        )}
                    </div>
                </div>

                {/* 步骤 2: 选择字段和新值 */}
                <div style={{ marginBottom: "20px" }}>
                    <h4 style={{
                        margin: "0 0 12px 0",
                        fontSize: "0.95em",
                        fontWeight: 600,
                        color: "var(--text-normal)"
                    }}>
                        2. 选择要修改的字段
                    </h4>

                    <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                        <select
                            value={fieldToEdit}
                            onChange={(e) => {
                                setFieldToEdit(e.target.value);
                                setNewValue('');
                            }}
                            style={{
                                flex: 1,
                                background: "var(--background-modifier-form-field)",
                                border: "1px solid var(--background-modifier-border)",
                                color: "var(--text-normal)",
                                borderRadius: "4px",
                                padding: "6px 10px",
                                fontSize: "0.9em"
                            }}
                        >
                            <option value="">-- 选择字段 --</option>
                            {EDITABLE_FIELDS.map(field => (
                                <option key={field.key} value={field.key}>
                                    {field.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedField && (
                        <div>
                            <label style={{
                                display: "block",
                                marginBottom: "6px",
                                fontSize: "0.85em",
                                color: "var(--text-muted)"
                            }}>
                                新值:
                            </label>
                            {selectedField.type === 'enum' ? (
                                <select
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    style={{
                                        width: "100%",
                                        background: "var(--background-modifier-form-field)",
                                        border: "1px solid var(--background-modifier-border)",
                                        color: "var(--text-normal)",
                                        borderRadius: "4px",
                                        padding: "6px 10px",
                                        fontSize: "0.9em"
                                    }}
                                >
                                    <option value="">-- 选择值 --</option>
                                    {selectedField.options?.map(opt => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    placeholder="输入新值"
                                    style={{
                                        width: "100%",
                                        background: "var(--background-modifier-form-field)",
                                        border: "1px solid var(--background-modifier-border)",
                                        color: "var(--text-normal)",
                                        borderRadius: "4px",
                                        padding: "6px 10px",
                                        fontSize: "0.9em"
                                    }}
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* 步骤 3: 预览和执行 */}
                <div style={{
                    display: "flex",
                    gap: "12px",
                    marginBottom: "16px"
                }}>
                    <Button
                        variant="default"
                        onClick={handlePreview}
                        disabled={isLoading || !fieldToEdit || newValue === '' || selectedFiles.length === 0}
                    >
                        🔍 预览变更
                    </Button>
                </div>

                {/* 预览对话框 */}
                {showPreview && previewResult && (
                    <div style={{
                        background: "var(--background-secondary)",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "6px",
                        padding: "16px",
                        marginBottom: "16px"
                    }}>
                        <h4 style={{
                            margin: "0 0 12px 0",
                            fontSize: "0.95em",
                            fontWeight: 600,
                            color: "var(--text-normal)"
                        }}>
                            📋 预览结果
                        </h4>

                        <div style={{
                            fontSize: "0.85em",
                            color: "var(--text-normal)",
                            marginBottom: "12px"
                        }}>
                            <div>总数: {previewResult.total}</div>
                            <div>成功: {previewResult.succeeded} ✅</div>
                            <div>失败: {previewResult.failed} ❌</div>
                        </div>

                        {previewResult.failed > 0 && (
                            <div style={{
                                background: "var(--background-primary)",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "4px",
                                padding: "8px",
                                fontSize: "0.8em",
                                color: "var(--text-error)",
                                marginBottom: "12px"
                            }}>
                                ⚠️ 部分文件验证失败,请检查错误信息
                            </div>
                        )}

                        <div style={{
                            display: "flex",
                            gap: "12px"
                        }}>
                            <Button
                                variant="default"
                                onClick={handleConfirm}
                                disabled={isLoading || previewResult.failed > 0}
                            >
                                ✅ 确认执行
                            </Button>
                            <Button
                                variant="text"
                                onClick={() => setShowPreview(false)}
                                disabled={isLoading}
                            >
                                取消
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * QuickActionsPanel - 快捷操作面板
 * 
 * 提供常用修改场景的快捷入口
 * Week 3, Day 15
 */

import * as React from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { TradeRecord } from "../../../core/contracts";
import { ActionService } from "../../../core/action/action-service";
import { Button } from "../../../ui/components/Button";
import { glassCardStyle } from "../../../ui/styles/dashboardPrimitives";
import type { TradeIndex } from "../../../core/trade-index";

interface QuickActionsPanelProps {
    index: TradeIndex;
    trades: TradeRecord[];
}

// 快捷操作定义
const QUICK_ACTIONS = [
    {
        id: 'demo-to-live',
        title: '📊 Demo → Live',
        description: '将选中文件的账户类型从 Demo 改为 Live',
        field: 'accountType',
        value: 'Live',
        icon: '📊'
    },
    {
        id: 'live-to-demo',
        title: '🧪 Live → Demo',
        description: '将选中文件的账户类型从 Live 改为 Demo',
        field: 'accountType',
        value: 'Demo',
        icon: '🧪'
    },
    {
        id: 'mark-win',
        title: '✅ 标记为盈利',
        description: '将选中文件的结果标记为 win',
        field: 'outcome',
        value: 'win',
        icon: '✅'
    },
    {
        id: 'mark-loss',
        title: '❌ 标记为亏损',
        description: '将选中文件的结果标记为 loss',
        field: 'outcome',
        value: 'loss',
        icon: '❌'
    },
    {
        id: 'mark-scratch',
        title: '➖ 标记为平手',
        description: '将选中文件的结果标记为 scratch',
        field: 'outcome',
        value: 'scratch',
        icon: '➖'
    },
    {
        id: 'set-5m',
        title: '⏱️ 设置为 5分钟',
        description: '将选中文件的时间周期设置为 5m',
        field: 'timeframe',
        value: '5m',
        icon: '⏱️'
    },
] as const;

export const QuickActionsPanel: React.FC<QuickActionsPanelProps> = ({ index, trades }) => {
    const [selectedFiles, setSelectedFiles] = React.useState<string[]>([]);
    const [isExecuting, setIsExecuting] = React.useState(false);

    const app = (index as any).app as App | undefined;

    const actionService = React.useMemo(() => {
        if (!app) return null;
        return new ActionService(app);
    }, [app]);

    if (!app || !actionService) {
        return null;
    }

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

    // 执行快捷操作
    const handleQuickAction = async (action: typeof QUICK_ACTIONS[number]) => {
        if (selectedFiles.length === 0) {
            new Notice('请先选择文件');
            return;
        }

        const confirmed = confirm(
            `确认执行快捷操作?\n\n` +
            `操作: ${action.title}\n` +
            `描述: ${action.description}\n` +
            `影响文件: ${selectedFiles.length} 个\n\n` +
            `是否继续?`
        );

        if (!confirmed) return;

        setIsExecuting(true);

        try {
            const items = selectedFiles.map(path => ({
                path,
                updates: { [action.field]: action.value }
            }));

            const result = await actionService.batchUpdateTrades(items, {
                dryRun: false,
                validate: true
            });

            if (result.failed === 0) {
                new Notice(`✅ ${action.title} 完成: 全部成功 (${result.total}个)`);
            } else {
                new Notice(`⚠️ ${action.title} 完成: ${result.succeeded}成功, ${result.failed}失败`);
            }

            // 重置选择
            setSelectedFiles([]);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`❌ 操作失败: ${msg}`);
        } finally {
            setIsExecuting(false);
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
                    ⚡️ 快捷操作
                </h3>
                <div style={{
                    marginTop: "8px",
                    fontSize: "0.9em",
                    color: "var(--text-faint)"
                }}>
                    常用修改场景的一键操作
                </div>
            </div>

            <div style={{ padding: "16px" }}>
                {/* 文件选择 */}
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
                            选择文件 ({selectedFiles.length}/{trades.length})
                        </h4>
                        <Button
                            variant="text"
                            onClick={toggleSelectAll}
                        >
                            {selectedFiles.length === trades.length ? '取消全选' : '全选'}
                        </Button>
                    </div>

                    <div style={{
                        maxHeight: "150px",
                        overflow: "auto",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "6px",
                        padding: "8px"
                    }}>
                        {trades.slice(0, 30).map((trade, idx) => (
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
                                {trade.path?.split('/').pop() || 'N/A'}
                            </label>
                        ))}
                        {trades.length > 30 && (
                            <div style={{
                                padding: "8px",
                                fontSize: "0.85em",
                                color: "var(--text-faint)",
                                textAlign: "center"
                            }}>
                                仅显示前 30 个文件,请使用全选功能选择所有文件
                            </div>
                        )}
                    </div>
                </div>

                {/* 快捷操作按钮 */}
                <div style={{ marginBottom: "16px" }}>
                    <h4 style={{
                        margin: "0 0 12px 0",
                        fontSize: "0.95em",
                        fontWeight: 600,
                        color: "var(--text-normal)"
                    }}>
                        快捷操作
                    </h4>

                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "12px"
                    }}>
                        {QUICK_ACTIONS.map(action => (
                            <button
                                key={action.id}
                                onClick={() => handleQuickAction(action)}
                                disabled={isExecuting || selectedFiles.length === 0}
                                style={{
                                    background: "var(--background-secondary)",
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "6px",
                                    padding: "12px",
                                    cursor: selectedFiles.length === 0 ? "not-allowed" : "pointer",
                                    opacity: selectedFiles.length === 0 ? 0.5 : 1,
                                    textAlign: "left",
                                    transition: "all 0.2s"
                                }}
                                onMouseEnter={(e) => {
                                    if (selectedFiles.length > 0) {
                                        e.currentTarget.style.background = "var(--background-modifier-hover)";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "var(--background-secondary)";
                                }}
                            >
                                <div style={{
                                    fontSize: "1.2em",
                                    marginBottom: "4px"
                                }}>
                                    {action.icon}
                                </div>
                                <div style={{
                                    fontSize: "0.9em",
                                    fontWeight: 600,
                                    color: "var(--text-normal)",
                                    marginBottom: "4px"
                                }}>
                                    {action.title}
                                </div>
                                <div style={{
                                    fontSize: "0.8em",
                                    color: "var(--text-muted)"
                                }}>
                                    {action.description}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {selectedFiles.length > 0 && (
                    <div style={{
                        padding: "12px",
                        background: "var(--background-secondary)",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "6px",
                        fontSize: "0.85em",
                        color: "var(--text-muted)"
                    }}>
                        💡 已选择 {selectedFiles.length} 个文件,点击上方快捷操作按钮执行批量修改
                    </div>
                )}
            </div>
        </div>
    );
};

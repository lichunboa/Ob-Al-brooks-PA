/**
 * HistoryViewer - 操作历史查看器
 * 
 * 显示 ActionService 的操作历史记录
 * Week 3, Day 13
 */

import * as React from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import { ActionService } from "../../../core/action/action-service";
import type { ChangeLogEntry } from "../../../core/action/types";
import { Button } from "../../../ui/components/Button";
import { glassCardStyle } from "../../../ui/styles/dashboardPrimitives";
import type { TradeIndex } from "../../../core/trade-index";

interface HistoryViewerProps {
    index: TradeIndex;
}

export const HistoryViewer: React.FC<HistoryViewerProps> = ({ index }) => {
    const [history, setHistory] = React.useState<ChangeLogEntry[]>([]);
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    const [filterType, setFilterType] = React.useState<'all' | 'update' | 'batchUpdate'>('all');
    const [undoingId, setUndoingId] = React.useState<string | null>(null);

    const app = (index as any).app as App | undefined;

    const actionService = React.useMemo(() => {
        if (!app) return null;
        return new ActionService(app);
    }, [app]);

    // 加载历史记录
    React.useEffect(() => {
        if (!actionService) return;

        const loadHistory = () => {
            const entries = actionService.getChangeLog(50);
            setHistory(entries);
        };

        loadHistory();

        // 每 5 秒刷新一次
        const interval = setInterval(loadHistory, 5000);
        return () => clearInterval(interval);
    }, [actionService]);

    if (!app || !actionService) {
        return null;
    }

    // 过滤历史记录
    const filteredHistory = filterType === 'all'
        ? history
        : history.filter(entry => entry.operation === filterType);

    // 切换展开/折叠
    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    // 格式化时间
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // 处理撤销
    const handleUndo = async (entry: ChangeLogEntry) => {
        if (!entry.canUndo) {
            new Notice('此操作不支持撤销');
            return;
        }

        // 确认对话框
        const confirmed = confirm(
            `确认撤销此操作?\n\n` +
            `操作类型: ${entry.operation === 'update' ? '单个更新' : '批量更新'}\n` +
            `影响文件: ${entry.files.length} 个\n` +
            `时间: ${formatTime(entry.timestamp)}\n\n` +
            `此操作将恢复文件到之前的状态,是否继续?`
        );

        if (!confirmed) return;

        setUndoingId(entry.id);

        try {
            const result = await actionService!.undo(entry.id);

            if (result.success) {
                new Notice('✅ 撤销成功');
                // 刷新历史记录
                const entries = actionService!.getChangeLog(50);
                setHistory(entries);
            } else {
                new Notice(`❌ 撤销失败: ${result.message}`);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`❌ 撤销异常: ${msg}`);
        } finally {
            setUndoingId(null);
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
                    📜 操作历史
                </h3>
                <div style={{
                    marginTop: "8px",
                    fontSize: "0.9em",
                    color: "var(--text-faint)"
                }}>
                    查看最近的操作记录
                </div>
            </div>

            <div style={{ padding: "16px" }}>
                {/* 筛选器 */}
                <div style={{
                    display: "flex",
                    gap: "8px",
                    marginBottom: "16px"
                }}>
                    <Button
                        variant={filterType === 'all' ? 'default' : 'text'}
                        onClick={() => setFilterType('all')}
                    >
                        全部 ({history.length})
                    </Button>
                    <Button
                        variant={filterType === 'update' ? 'default' : 'text'}
                        onClick={() => setFilterType('update')}
                    >
                        单个更新 ({history.filter(e => e.operation === 'update').length})
                    </Button>
                    <Button
                        variant={filterType === 'batchUpdate' ? 'default' : 'text'}
                        onClick={() => setFilterType('batchUpdate')}
                    >
                        批量更新 ({history.filter(e => e.operation === 'batchUpdate').length})
                    </Button>
                </div>

                {/* 历史列表 */}
                {filteredHistory.length === 0 ? (
                    <div style={{
                        padding: "32px",
                        textAlign: "center",
                        color: "var(--text-faint)",
                        fontSize: "0.9em"
                    }}>
                        暂无操作记录
                    </div>
                ) : (
                    <div style={{
                        maxHeight: "400px",
                        overflow: "auto"
                    }}>
                        {filteredHistory.map((entry) => (
                            <div
                                key={entry.id}
                                style={{
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "6px",
                                    marginBottom: "12px",
                                    overflow: "hidden"
                                }}
                            >
                                {/* 历史项头部 */}
                                <div
                                    style={{
                                        padding: "12px",
                                        background: entry.success
                                            ? "var(--background-secondary)"
                                            : "var(--background-modifier-error)",
                                        cursor: "pointer",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center"
                                    }}
                                    onClick={() => toggleExpand(entry.id)}
                                >
                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            fontSize: "0.9em",
                                            fontWeight: 600,
                                            color: "var(--text-normal)",
                                            marginBottom: "4px"
                                        }}>
                                            {entry.operation === 'update' ? '📝 单个更新' : '⚡️ 批量更新'}
                                            {!entry.success && ' ❌'}
                                        </div>
                                        <div style={{
                                            fontSize: "0.8em",
                                            color: "var(--text-muted)"
                                        }}>
                                            {entry.files.length} 个文件 · {formatTime(entry.timestamp)}
                                        </div>
                                    </div>
                                    <div style={{
                                        fontSize: "0.9em",
                                        color: "var(--text-faint)"
                                    }}>
                                        {expandedId === entry.id ? '▼' : '▶'}
                                    </div>
                                </div>

                                {/* 历史项详情 */}
                                {expandedId === entry.id && (
                                    <div style={{
                                        padding: "12px",
                                        background: "var(--background-primary)",
                                        borderTop: "1px solid var(--background-modifier-border)"
                                    }}>
                                        <div style={{
                                            fontSize: "0.85em",
                                            color: "var(--text-normal)"
                                        }}>
                                            <div style={{ marginBottom: "8px" }}>
                                                <strong>操作ID:</strong> {entry.id}
                                            </div>
                                            <div style={{ marginBottom: "8px" }}>
                                                <strong>状态:</strong> {entry.success ? '✅ 成功' : '❌ 失败'}
                                            </div>
                                            <div style={{ marginBottom: "8px" }}>
                                                <strong>可撤销:</strong> {entry.canUndo ? '✅ 是' : '❌ 否'}
                                            </div>

                                            <div style={{ marginTop: "12px" }}>
                                                <strong>变更详情:</strong>
                                            </div>
                                            <div style={{
                                                marginTop: "8px",
                                                maxHeight: "200px",
                                                overflow: "auto",
                                                background: "var(--background-secondary)",
                                                border: "1px solid var(--background-modifier-border)",
                                                borderRadius: "4px",
                                                padding: "8px",
                                                fontSize: "0.8em",
                                                fontFamily: "var(--font-monospace)"
                                            }}>
                                                {entry.changes.map((change, idx) => (
                                                    <div key={idx} style={{ marginBottom: "12px" }}>
                                                        <div style={{
                                                            color: "var(--text-accent)",
                                                            marginBottom: "4px"
                                                        }}>
                                                            📄 {change.path.split('/').pop()}
                                                        </div>
                                                        <div style={{ paddingLeft: "16px" }}>
                                                            <div style={{ color: "var(--text-error)" }}>
                                                                - {JSON.stringify(change.before, null, 2)}
                                                            </div>
                                                            <div style={{ color: "var(--text-success)" }}>
                                                                + {JSON.stringify(change.after, null, 2)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                                }
                                            </div>

                                            {/* 撤销按钮 */}
                                            {entry.canUndo && (
                                                <div style={{ marginTop: "16px" }}>
                                                    <Button
                                                        variant="default"
                                                        onClick={() => handleUndo(entry)}
                                                        disabled={undoingId === entry.id}
                                                    >
                                                        {undoingId === entry.id ? '⏳ 撤销中...' : '↩️ 撤销此操作'}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

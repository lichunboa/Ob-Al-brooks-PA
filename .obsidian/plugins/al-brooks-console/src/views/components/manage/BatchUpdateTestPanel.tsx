/**
 * BatchUpdateTestPanel - 批量更新测试面板
 * 
 * 用于Day 7验证ActionService批量更新功能
 */

import * as React from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import { ActionService } from "../../../core/action/action-service";
import { Button } from "../../../ui/components/Button";
import { glassCardStyle } from "../../../ui/styles/dashboardPrimitives";
import type { TradeIndex } from "../../../core/trade-index";

interface BatchUpdateTestPanelProps {
    index: TradeIndex;
}

export const BatchUpdateTestPanel: React.FC<BatchUpdateTestPanelProps> = ({ index }) => {
    const [testCount, setTestCount] = React.useState<number>(10);
    const [testResult, setTestResult] = React.useState<string>("");
    const [isLoading, setIsLoading] = React.useState(false);

    const app = (index as any).app as App | undefined;

    const actionService = React.useMemo(() => {
        if (!app) return null;
        return new ActionService(app);
    }, [app]);

    if (!app || !actionService) {
        return null;
    }

    // 生成测试文件
    const handleGenerateFiles = async () => {
        setIsLoading(true);
        setTestResult("正在生成测试文件...");

        try {
            let createdCount = 0;
            const basePath = "Daily/Trades";

            // 确保目录存在
            if (!await app.vault.adapter.exists(basePath)) {
                await app.vault.createFolder(basePath);
            }

            for (let i = 1; i <= testCount; i++) {
                const path = `${basePath}/batch-test-${i}.md`;
                const content = `---
日期/date: 2024-01-15
盈亏/net_profit: ${i}
结果/outcome: win
账户类型/account_type: Live
品种/ticker: ES
时间周期/timeframe: 5m
方向/direction: Long
---
# 批量测试文件 ${i}
`;

                if (await app.vault.adapter.exists(path)) {
                    // 如果存在则覆盖内容 (先删除再创建,简单粗暴)
                    await app.vault.adapter.remove(path);
                }
                await app.vault.create(path, content);
                createdCount++;
            }

            setTestResult(`✅ 成功生成 ${createdCount} 个测试文件`);
            new Notice(`已生成 ${createdCount} 个测试文件`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setTestResult(`❌ 生成文件失败: ${msg}`);
            new Notice("生成文件失败");
        } finally {
            setIsLoading(false);
        }
    };

    // 执行批量更新
    const handleBatchUpdate = async () => {
        setIsLoading(true);
        setTestResult("正在执行批量更新...");

        try {
            const updates = [];
            for (let i = 1; i <= testCount; i++) {
                updates.push({
                    path: `Daily/Trades/batch-test-${i}.md`,
                    updates: {
                        pnl: i * 10, // 将盈亏更新为原来的10倍
                        outcome: "loss" as const // 修改结果
                    }
                });
            }

            const result = await actionService.batchUpdateTrades(updates, {
                dryRun: false,
                validate: true
            });

            setTestResult(
                `📊 批量更新结果:\n` +
                `----------------\n` +
                `总数: ${result.total}\n` +
                `成功: ${result.succeeded} ✅\n` +
                `失败: ${result.failed} ❌\n` +
                `耗时: ${result.duration}ms\n\n` +
                `平均速度: ${(result.duration / result.total).toFixed(2)}ms/个\n` +
                (result.failed > 0 ? `\n失败详情:\n${JSON.stringify(result.results.filter(r => !r.success), null, 2)}` : "")
            );

            if (result.failed === 0) {
                new Notice(`批量更新完成: 全部成功 (${result.total}个)`);
            } else {
                new Notice(`批量更新完成: ${result.succeeded}成功, ${result.failed}失败`);
            }

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setTestResult(`❌ 批量更新异常: ${msg}`);
            new Notice("批量更新异常");
            console.error(e);
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
                    ⚡️ 批量更新测试 (Day 7)
                </h3>
                <div style={{
                    marginTop: "8px",
                    fontSize: "0.9em",
                    color: "var(--text-faint)"
                }}>
                    测试 batchUpdateTrades() 性能与稳定性
                </div>
            </div>

            <div style={{ padding: "16px" }}>
                <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ fontSize: "0.9em", color: "var(--text-muted)" }}>
                        测试文件数量:
                    </label>
                    <input
                        type="number"
                        min="1"
                        max="1000"
                        value={testCount}
                        onChange={(e) => setTestCount(parseInt(e.target.value) || 10)}
                        style={{
                            background: "var(--background-modifier-form-field)",
                            border: "1px solid var(--background-modifier-border)",
                            color: "var(--text-normal)",
                            borderRadius: "4px",
                            padding: "4px 8px",
                            width: "80px"
                        }}
                    />
                </div>

                <div style={{
                    display: "flex",
                    gap: "12px",
                    marginBottom: "16px"
                }}>
                    <Button
                        variant="text"
                        onClick={handleGenerateFiles}
                        disabled={isLoading}
                    >
                        📄 1. 生成测试文件
                    </Button>

                    <Button
                        variant="default"
                        onClick={handleBatchUpdate}
                        disabled={isLoading}
                    >
                        ⚡️ 2. 执行批量更新
                    </Button>
                </div>

                {testResult && (
                    <div style={{
                        background: "var(--background-secondary)",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "6px",
                        padding: "12px",
                        fontSize: "0.85em",
                        fontFamily: "var(--font-monospace)",
                        whiteSpace: "pre-wrap",
                        maxHeight: "300px",
                        overflow: "auto",
                        color: "var(--text-normal)"
                    }}>
                        {testResult}
                    </div>
                )}
            </div>
        </div>
    );
};

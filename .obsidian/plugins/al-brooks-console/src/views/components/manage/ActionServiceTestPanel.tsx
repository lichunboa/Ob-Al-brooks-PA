/**
 * ActionServiceTestPanel - ActionService测试面板
 * 
 * 用于Day 5验证ActionService核心功能
 */

import * as React from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import { ActionService } from "../../../core/action/action-service";
import { Button } from "../../../ui/components/Button";
import { glassCardStyle } from "../../../ui/styles/dashboardPrimitives";
import type { TradeIndex } from "../../../core/trade-index";

interface ActionServiceTestPanelProps {
    index: TradeIndex;
}

export const ActionServiceTestPanel: React.FC<ActionServiceTestPanelProps> = ({ index }) => {
    const [testResult, setTestResult] = React.useState<string>("");
    const [isLoading, setIsLoading] = React.useState(false);

    // 从index获取app实例
    const app = (index as any).app as App | undefined;

    // 创建ActionService实例
    const actionService = React.useMemo(() => {
        if (!app) return null;
        return new ActionService(app);
    }, [app]);

    if (!app || !actionService) {
        return (
            <div style={{ ...glassCardStyle, marginBottom: "24px", padding: "16px" }}>
                <div style={{ color: "var(--text-faint)" }}>
                    ⚠️ ActionService不可用: 无法获取App实例
                </div>
            </div>
        );
    }

    const handleTestDryRun = async () => {
        setIsLoading(true);
        setTestResult("正在测试...");

        try {
            const testPath = "Daily/Trades/test-trade-2024-01-15.md";
            const updates = { pnl: 3.5 };

            const result = await actionService.updateTrade(testPath, updates, {
                dryRun: true,
                validate: true
            });

            if (result.success) {
                new Notice("✅ ActionService测试成功 (Dry Run)");
                setTestResult(
                    `✅ 测试成功!\n\n` +
                    `消息: ${result.message}\n\n` +
                    `变更前: ${JSON.stringify(result.changes?.before, null, 2)}\n\n` +
                    `变更后: ${JSON.stringify(result.changes?.after, null, 2)}`
                );
            } else {
                new Notice("❌ ActionService测试失败");
                setTestResult(
                    `❌ 测试失败!\n\n` +
                    `消息: ${result.message}\n\n` +
                    `错误: ${JSON.stringify(result.errors, null, 2)}`
                );
            }

            console.log("[ActionService Test] Result:", result);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            new Notice(`❌ 测试异常: ${errorMsg}`);
            setTestResult(`❌ 测试异常!\n\n${errorMsg}`);
            console.error("[ActionService Test] Error:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTestRealUpdate = async () => {
        setIsLoading(true);
        setTestResult("正在执行真实更新...");

        try {
            const testPath = "Daily/Trades/test-trade-2024-01-15.md";
            const updates = { pnl: 4.0 };

            const result = await actionService.updateTrade(testPath, updates, {
                dryRun: false,
                validate: true
            });

            if (result.success) {
                new Notice("✅ 真实更新成功");
                setTestResult(
                    `✅ 真实更新成功!\n\n` +
                    `消息: ${result.message}\n\n` +
                    `变更前: ${JSON.stringify(result.changes?.before, null, 2)}\n\n` +
                    `变更后: ${JSON.stringify(result.changes?.after, null, 2)}`
                );
            } else {
                new Notice("❌ 真实更新失败");
                setTestResult(
                    `❌ 真实更新失败!\n\n` +
                    `消息: ${result.message}\n\n` +
                    `错误: ${JSON.stringify(result.errors, null, 2)}`
                );
            }

            console.log("[ActionService Test] Real Update Result:", result);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            new Notice(`❌ 更新异常: ${errorMsg}`);
            setTestResult(`❌ 更新异常!\n\n${errorMsg}`);
            console.error("[ActionService Test] Error:", e);
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
                    🧪 ActionService 测试面板 (Day 5)
                </h3>
                <div style={{
                    marginTop: "8px",
                    fontSize: "0.9em",
                    color: "var(--text-faint)"
                }}>
                    测试 ActionService 核心功能: updateTrade(), 数据验证, Dry Run模式
                </div>
            </div>

            <div style={{ padding: "16px" }}>
                <div style={{
                    display: "flex",
                    gap: "12px",
                    marginBottom: "16px"
                }}>
                    <Button
                        variant="default"
                        onClick={handleTestDryRun}
                        disabled={isLoading}
                    >
                        {isLoading ? "测试中..." : "🔍 测试 Dry Run"}
                    </Button>

                    <Button
                        variant="default"
                        onClick={handleTestRealUpdate}
                        disabled={isLoading}
                    >
                        {isLoading ? "更新中..." : "✏️ 测试真实更新"}
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
                        maxHeight: "400px",
                        overflow: "auto",
                        color: "var(--text-normal)"
                    }}>
                        {testResult}
                    </div>
                )}

                <div style={{
                    marginTop: "16px",
                    padding: "12px",
                    background: "var(--background-secondary)",
                    borderRadius: "6px",
                    fontSize: "0.85em",
                    color: "var(--text-muted)"
                }}>
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>测试说明:</div>
                    <ul style={{ margin: 0, paddingLeft: "20px" }}>
                        <li>测试文件: <code>Daily/Trades/test-trade-2024-01-15.md</code></li>
                        <li>Dry Run: 预览变更,不实际修改文件</li>
                        <li>真实更新: 实际修改文件 (pnl: 2.5 → 4.0)</li>
                        <li>所有操作都会进行数据验证</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

import * as React from "react";
import { Button } from "../../../ui/components/Button";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { Notice } from "obsidian";
import type { IntegrationCapability } from "../../../integrations/contracts";
import type { PluginIntegrationRegistry } from "../../../integrations/PluginIntegrationRegistry";

interface DashboardHeaderProps {
    version: string;
    statusText: string;
    currencyMode: 'USD' | 'CNY';
    setCurrencyMode: (mode: 'USD' | 'CNY') => void;
    openFile: (path: string) => void;
    integrations?: PluginIntegrationRegistry;
    can: (capabilityId: IntegrationCapability) => boolean;
    action: (capabilityId: IntegrationCapability) => Promise<void>;
    runCommand?: (commandId: string) => boolean;
    onRebuild?: () => void;
    showRebuild?: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
    version,
    statusText,
    currencyMode,
    setCurrencyMode,
    openFile,
    integrations,
    can,
    action,
    runCommand,
    onRebuild,
    showRebuild
}) => {
    const TRADE_NOTE_TEMPLATE_PATH = "Templates/单笔交易模版 (Trade Note).md";

    return (
        <div className="pa-dashboard-header">
            <div className="pa-dashboard-title">
                🦁 交易员控制台
                <span className="pa-dashboard-meta">（Dashboard）</span>
                <span className="pa-dashboard-meta">v{version}</span>
                <span className="pa-dashboard-meta">{statusText}</span>
            </div>
            <div className="pa-dashboard-actions">
                {/* Currency Toggle */}
                <div style={{ display: 'flex', background: 'var(--background-modifier-form-field)', borderRadius: '6px', padding: '2px' }}>
                    <Button
                        onClick={() => setCurrencyMode('USD')}
                        variant="small"
                        style={{
                            borderRadius: '4px',
                            border: 'none',
                            background: currencyMode === 'USD' ? 'var(--interactive-accent)' : 'transparent',
                            color: currencyMode === 'USD' ? 'var(--text-on-accent)' : 'var(--text-muted)',
                            fontSize: '12px',
                            fontWeight: 500
                        }}
                    >
                        USD
                    </Button>
                    <Button
                        onClick={() => setCurrencyMode('CNY')}
                        variant="small"
                        style={{
                            borderRadius: '4px',
                            border: 'none',
                            background: currencyMode === 'CNY' ? 'var(--interactive-accent)' : 'transparent',
                            color: currencyMode === 'CNY' ? 'var(--text-on-accent)' : 'var(--text-muted)',
                            fontSize: '12px',
                            fontWeight: 500
                        }}
                    >
                        CNY
                    </Button>
                </div>
                <InteractiveButton
                    interaction="lift"
                    onClick={() => {
                        // 优先调用 QuickAdd 命令（会自动填写日期等）
                        if (runCommand) {
                            // QuickAdd 命令 ID 可能是 UUID 格式或名称格式
                            const quickAddCommands = [
                                "quickadd:choice:4fe2b2a9-956f-4d21-a597-d1f86878cdc3", // UUID 格式
                                "quickadd:choice:New Live Trade", // 名称格式
                                "quickadd:runQuickAdd" // 打开 QuickAdd 菜单
                            ];

                            for (const cmd of quickAddCommands) {
                                if (runCommand(cmd)) {
                                    console.log("[Dashboard] 成功调用 QuickAdd:", cmd);
                                    return;
                                }
                            }
                            console.warn("[Dashboard] QuickAdd 命令调用失败，回退到打开模版");
                        } else {
                            console.warn("[Dashboard] runCommand 未定义");
                        }

                        // 回退：打开模版文件
                        openFile(TRADE_NOTE_TEMPLATE_PATH);
                    }}
                    title="新建交易笔记（QuickAdd 自动填充日期）"
                >
                    新建交易
                </InteractiveButton>

                {integrations ? (
                    <>
                        <InteractiveButton
                            interaction="lift"
                            onClick={() => {
                                if (runCommand) {
                                    const app = (window as any).app;
                                    const available = app.commands.listCommands();

                                    // 1. Try standard command
                                    if (runCommand("obsidian-spaced-repetition:srs-review-flashcards")) {
                                        return;
                                    }

                                    // 2. Search for commands
                                    const srsCmds = available.filter((c: any) =>
                                        c.id.includes("obsidian-spaced-repetition") &&
                                        (c.id.includes("review-flashcards") || c.id.includes("review-all"))
                                    );

                                    console.log("[Dashboard] Found SRS Commands:", srsCmds.map((c: any) => c.id));

                                    if (srsCmds.length > 0) {
                                        const best = srsCmds[0].id;
                                        new Notice(`调用: ${srsCmds[0].name}`);
                                        runCommand(best);
                                    } else {
                                        new Notice("❌ 未找到 Spaced Repetition 插件命令！\n请确保插件已启用。");
                                        console.warn("Available commands containing 'review':", available.filter((c: any) => c.id.includes("review")));
                                    }
                                }
                            }}
                            title="Review Flashcards (Spaced Repetition)"
                        >
                            🗂️ 复习卡片
                        </InteractiveButton>
                    </>
                ) : (
                    <span
                        style={{
                            fontSize: "0.8em",
                            color: "var(--text-muted)",
                            marginLeft: "8px",
                        }}
                    >
                        (Integrations loading...)
                    </span>
                )}
            </div>
        </div>
    );
};

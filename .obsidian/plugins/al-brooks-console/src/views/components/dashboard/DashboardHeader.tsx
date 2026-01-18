import * as React from "react";
import { Button } from "../../../ui/components/Button";
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

    // 紧凑按钮样式
    const miniButtonStyle: React.CSSProperties = {
        padding: "4px 10px",
        fontSize: "0.8em",
        borderRadius: "4px",
        border: "1px solid var(--background-modifier-border)",
        background: "var(--background-primary)",
        cursor: "pointer",
        transition: "all 0.15s ease",
        display: "flex",
        alignItems: "center",
        gap: "4px",
    };

    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
        }}>
            {/* 左侧：标题 + 状态 */}
            <div style={{
                display: "flex",
                alignItems: "baseline",
                gap: "8px",
            }}>
                <span style={{ fontSize: "1em", fontWeight: 700 }}>
                    🦁 控制台
                </span>
                <span style={{ fontSize: "0.75em", color: "var(--text-faint)" }}>
                    v{version}
                </span>
                <span style={{ fontSize: "0.75em", color: "var(--text-muted)" }}>
                    {statusText}
                </span>
            </div>

            {/* 右侧：操作按钮 */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
            }}>
                {/* 货币切换 - 更紧凑 */}
                <div style={{
                    display: "flex",
                    background: "var(--background-modifier-form-field)",
                    borderRadius: "4px",
                    padding: "1px",
                }}>
                    {(['USD', 'CNY'] as const).map(mode => (
                        <div
                            key={mode}
                            onClick={() => setCurrencyMode(mode)}
                            style={{
                                padding: "2px 8px",
                                fontSize: "0.75em",
                                fontWeight: 600,
                                borderRadius: "3px",
                                cursor: "pointer",
                                background: currencyMode === mode ? "var(--interactive-accent)" : "transparent",
                                color: currencyMode === mode ? "var(--text-on-accent)" : "var(--text-muted)",
                                transition: "all 0.15s ease",
                            }}
                        >
                            {mode}
                        </div>
                    ))}
                </div>

                {/* 新建交易 */}
                <div
                    onClick={() => {
                        if (runCommand) {
                            const quickAddCommands = [
                                "quickadd:choice:4fe2b2a9-956f-4d21-a597-d1f86878cdc3",
                                "quickadd:choice:New Live Trade",
                                "quickadd:runQuickAdd"
                            ];
                            for (const cmd of quickAddCommands) {
                                if (runCommand(cmd)) return;
                            }
                        }
                        openFile(TRADE_NOTE_TEMPLATE_PATH);
                    }}
                    style={miniButtonStyle}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = "var(--interactive-accent)";
                        e.currentTarget.style.color = "var(--text-on-accent)";
                        e.currentTarget.style.borderColor = "var(--interactive-accent)";
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = "var(--background-primary)";
                        e.currentTarget.style.color = "var(--text-normal)";
                        e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                    }}
                    title="新建交易笔记"
                >
                    <span>➕</span>
                    <span>新交易</span>
                </div>

                {/* 复习卡片 */}
                {integrations && (
                    <div
                        onClick={() => {
                            if (runCommand) {
                                const app = (window as any).app;
                                const available = app.commands.listCommands();

                                if (runCommand("obsidian-spaced-repetition:srs-review-flashcards")) {
                                    return;
                                }

                                const srsCmds = available.filter((c: any) =>
                                    c.id.includes("obsidian-spaced-repetition") &&
                                    (c.id.includes("review-flashcards") || c.id.includes("review-all"))
                                );

                                if (srsCmds.length > 0) {
                                    new Notice(`调用: ${srsCmds[0].name}`);
                                    runCommand(srsCmds[0].id);
                                } else {
                                    new Notice("❌ 未找到 Spaced Repetition 插件命令");
                                }
                            }
                        }}
                        style={miniButtonStyle}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = "var(--interactive-accent)";
                            e.currentTarget.style.color = "var(--text-on-accent)";
                            e.currentTarget.style.borderColor = "var(--interactive-accent)";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = "var(--background-primary)";
                            e.currentTarget.style.color = "var(--text-normal)";
                            e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                        }}
                        title="复习卡片"
                    >
                        <span>🗂️</span>
                        <span>复习</span>
                    </div>
                )}
            </div>
        </div>
    );
};

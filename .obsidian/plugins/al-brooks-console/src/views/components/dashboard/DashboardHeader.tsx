import * as React from "react";
import { Button } from "../../../ui/components/Button";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
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
                        // Prefer calling command if available, else open file
                        if (runCommand) runCommand("al-brooks-console:create-trade-note");
                        else openFile(TRADE_NOTE_TEMPLATE_PATH);
                    }}
                    title={TRADE_NOTE_TEMPLATE_PATH}
                >
                    新建交易
                </InteractiveButton>

                {integrations ? (
                    <>
                        <InteractiveButton
                            interaction="lift"
                            onClick={() => {
                                if (runCommand) {
                                    // Debug: List all commands to find the real one
                                    const available = (window as any).app.commands.listCommands().filter((c: any) =>
                                        c.id.includes("spaced") || c.id.includes("card") || c.id.includes("review")
                                    );
                                    console.log("[Dashboard] All Flashcard Related Commands:", available.map((c: any) => c.id));

                                    // Try known command IDs based on main.js + Manifest
                                    // Verified ID: "obsidian-spaced-repetition:srs-review-flashcards"
                                    const commands = [
                                        "obsidian-spaced-repetition:srs-review-flashcards",
                                        "obsidian-spaced-repetition:review-flashcards",
                                        "srs:review-flashcards"
                                    ];
                                    let executed = false;
                                    for (const cmd of commands) {
                                        if (runCommand(cmd)) {
                                            executed = true;
                                            break;
                                        }
                                    }

                                    if (!executed && available.length > 0) {
                                        // Auto-fallback: Try the first command that looks like "review-flashcards"
                                        const fuzzy = available.find((c: any) => c.id.includes("review-flashcards"));
                                        if (fuzzy) {
                                            console.log(`[Dashboard] Falling back to fuzzy match: ${fuzzy.id}`);
                                            runCommand(fuzzy.id);
                                        }
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

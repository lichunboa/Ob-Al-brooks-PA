import * as React from "react";
import type { FrontmatterInventory } from "../../../core/manager";
import { Button } from "../../../ui/components/Button";
import { SPACE } from "../../../ui/styles/dashboardPrimitives";
import { PropertyGrid } from "./PropertyGrid";
import { PropertyInspector } from "./PropertyInspector";

export interface PropertyManagerProps {
    managerTradeInventory: FrontmatterInventory | undefined;
    managerStrategyInventory: FrontmatterInventory | undefined;
    managerScope: "trade" | "strategy";
    managerSearch: string;
    managerBusy: boolean;
    managerInspectorKey: string | undefined;
    managerInspectorTab: "vals" | "files";
    managerInspectorFileFilter: { paths: string[]; label?: string } | undefined;

    setManagerScope: (scope: "trade" | "strategy") => void;
    setManagerSearch: (search: string) => void;
    setManagerBusy: (busy: boolean) => void;
    setManagerInspectorKey: (key: string | undefined) => void;
    setManagerInspectorTab: (tab: "vals" | "files") => void;
    setManagerInspectorFileFilter: (
        filter: { paths: string[]; label: string } | undefined
    ) => void;

    scanManagerInventory: () => Promise<void>;
    runManagerPlan: (
        plan: any,
        options: {
            closeInspector?: boolean;
            forceDeleteKeys?: boolean;
            refreshInventory?: boolean;
        }
    ) => Promise<void>;

    selectManagerTradeFiles: (paths: string[]) => any[];
    selectManagerStrategyFiles: (paths: string[]) => any[];

    buildRenameKeyPlan: (files: any[], oldKey: string, newKey: string, options?: any) => any;
    buildDeleteKeyPlan: (files: any[], key: string) => any;
    buildAppendValPlan: (files: any[], key: string, valueToAppend: string) => any;
    buildInjectPropPlan: (files: any[], newKey: string, newVal: string) => any;
    buildUpdateValPlan: (files: any[], key: string, oldVal: string, newVal: string) => any;
    buildDeleteValPlan: (files: any[], key: string, valueToDelete: string, options?: any) => any;

    openFile: (path: string) => void;
    promptText?: (options: any) => Promise<string | null>;
    confirmDialog?: (options: any) => Promise<boolean>;
}

export const PropertyManager: React.FC<PropertyManagerProps> = (props) => {
    const {
        managerTradeInventory,
        managerStrategyInventory,
        managerScope,
        managerSearch,
        managerBusy,
        managerInspectorKey,
        setManagerScope,
        setManagerSearch,
        setManagerBusy,
        setManagerInspectorKey,
        scanManagerInventory,
    } = props;

    // 选择当前的库存和文件选择器
    const currentInventory =
        managerScope === "strategy"
            ? managerStrategyInventory
            : managerTradeInventory;

    const currentSelectFiles =
        managerScope === "strategy"
            ? props.selectManagerStrategyFiles
            : props.selectManagerTradeFiles;

    const handleScan = async () => {
        if (managerBusy) return;
        setManagerBusy(true);
        try {
            await scanManagerInventory();
        } finally {
            setManagerBusy(false);
        }
    };

    return (
        <div
            style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "16px",
                background: "var(--background-primary)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                }}
            >
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: "1.1em" }}>
                        🛠️ 属性管理器
                    </div>
                    <Button
                        onClick={handleScan}
                        disabled={managerBusy}
                    >
                        {managerBusy ? "扫描中..." : "🔄 扫描全库"}
                    </Button>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                    <select
                        value={managerScope}
                        onChange={(e) =>
                            setManagerScope(e.target.value as "trade" | "strategy")
                        }
                        style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--background-modifier-border)",
                            background: "var(--background-primary)",
                            color: "var(--text-normal)",
                        }}
                    >
                        <option value="trade">交易 (Trade)</option>
                        <option value="strategy">策略 (Strategy)</option>
                    </select>
                    <input
                        type="text"
                        placeholder="🔍 搜索属性..."
                        value={managerSearch}
                        onChange={(e) => setManagerSearch(e.target.value)}
                        style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--background-modifier-border)",
                            background: "var(--background-secondary)",
                            color: "var(--text-normal)",
                            width: "200px",
                        }}
                    />
                </div>
            </div>

            <PropertyGrid
                inventory={currentInventory}
                scope={managerScope}
                search={managerSearch}
                onSelectKey={setManagerInspectorKey}
            />

            <PropertyInspector
                {...props}
                scope={managerScope}
                inspectorKey={managerInspectorKey}
                inventory={currentInventory}
                inspectorTab={props.managerInspectorTab}
                fileFilter={props.managerInspectorFileFilter}
                onClose={() => setManagerInspectorKey(undefined)}
                setInspectorTab={props.setManagerInspectorTab}
                setFileFilter={props.setManagerInspectorFileFilter}
                selectFiles={currentSelectFiles}
            />
        </div>
    );
};

/**
 * useManagerState Hook
 * 管理 Manager Tab 的所有状态
 */

import * as React from "react";
import type { FixPlan, ManagerApplyResult } from "../core/manager";

export interface UseManagerStateReturn {
    // Plan & Result
    managerPlan: FixPlan | undefined;
    setManagerPlan: React.Dispatch<React.SetStateAction<FixPlan | undefined>>;
    managerResult: ManagerApplyResult | undefined;
    setManagerResult: React.Dispatch<React.SetStateAction<ManagerApplyResult | undefined>>;
    managerBusy: boolean;
    setManagerBusy: React.Dispatch<React.SetStateAction<boolean>>;

    // Backups & Inventory
    managerDeleteKeys: boolean;
    setManagerDeleteKeys: React.Dispatch<React.SetStateAction<boolean>>;
    managerBackups: string[] | undefined;
    setManagerBackups: React.Dispatch<React.SetStateAction<string[] | undefined>>;
    managerTradeInventory: any[] | undefined;
    setManagerTradeInventory: React.Dispatch<React.SetStateAction<any[] | undefined>>;
    managerTradeInventoryFiles: string[] | undefined;
    setManagerTradeInventoryFiles: React.Dispatch<React.SetStateAction<string[] | undefined>>;
    managerStrategyInventory: any[] | undefined;
    setManagerStrategyInventory: React.Dispatch<React.SetStateAction<any[] | undefined>>;
    managerStrategyInventoryFiles: string[] | undefined;
    setManagerStrategyInventoryFiles: React.Dispatch<React.SetStateAction<string[] | undefined>>;

    // Search & Inspector
    managerSearch: string;
    setManagerSearch: React.Dispatch<React.SetStateAction<string>>;
    managerScope: "trade" | "strategy";
    setManagerScope: React.Dispatch<React.SetStateAction<"trade" | "strategy">>;
    managerInspectorKey: string | undefined;
    setManagerInspectorKey: React.Dispatch<React.SetStateAction<string | undefined>>;
    managerInspectorTab: "raw" | "parsed";
    setManagerInspectorTab: React.Dispatch<React.SetStateAction<"raw" | "parsed">>;
    managerInspectorFileFilter: string;
    setManagerInspectorFileFilter: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * 管理 Manager Tab 的所有状态
 */
export function useManagerState(): UseManagerStateReturn {
    // Plan & Result
    const [managerPlan, setManagerPlan] = React.useState<FixPlan | undefined>(undefined);
    const [managerResult, setManagerResult] = React.useState<ManagerApplyResult | undefined>(undefined);
    const [managerBusy, setManagerBusy] = React.useState(false);

    // Backups & Inventory
    const [managerDeleteKeys, setManagerDeleteKeys] = React.useState(false);
    const [managerBackups, setManagerBackups] = React.useState<string[] | undefined>(undefined);
    const [managerTradeInventory, setManagerTradeInventory] = React.useState<any[] | undefined>(undefined);
    const [managerTradeInventoryFiles, setManagerTradeInventoryFiles] = React.useState<string[] | undefined>(undefined);
    const [managerStrategyInventory, setManagerStrategyInventory] = React.useState<any[] | undefined>(undefined);
    const [managerStrategyInventoryFiles, setManagerStrategyInventoryFiles] = React.useState<string[] | undefined>(undefined);

    // Search & Inspector
    const [managerSearch, setManagerSearch] = React.useState("");
    const [managerScope, setManagerScope] = React.useState<"trade" | "strategy">("trade");
    const [managerInspectorKey, setManagerInspectorKey] = React.useState<string | undefined>(undefined);
    const [managerInspectorTab, setManagerInspectorTab] = React.useState<"raw" | "parsed">("raw");
    const [managerInspectorFileFilter, setManagerInspectorFileFilter] = React.useState("");

    return {
        managerPlan,
        setManagerPlan,
        managerResult,
        setManagerResult,
        managerBusy,
        setManagerBusy,
        managerDeleteKeys,
        setManagerDeleteKeys,
        managerBackups,
        setManagerBackups,
        managerTradeInventory,
        setManagerTradeInventory,
        managerTradeInventoryFiles,
        setManagerTradeInventoryFiles,
        managerStrategyInventory,
        setManagerStrategyInventory,
        managerStrategyInventoryFiles,
        setManagerStrategyInventoryFiles,
        managerSearch,
        setManagerSearch,
        managerScope,
        setManagerScope,
        managerInspectorKey,
        setManagerInspectorKey,
        managerInspectorTab,
        setManagerInspectorTab,
        managerInspectorFileFilter,
        setManagerInspectorFileFilter,
    };
}

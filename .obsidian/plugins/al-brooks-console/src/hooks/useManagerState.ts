/**
 * useManagerState Hook
 * 管理 Manager Tab 的所有状态
 */

import * as React from "react";
import type { FixPlan } from "../core/inspector";
import type {
    ManagerApplyResult,
    FrontmatterInventory,
    FrontmatterFile
} from "../core/manager";

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
    managerBackups: Record<string, string> | undefined;
    setManagerBackups: React.Dispatch<React.SetStateAction<Record<string, string> | undefined>>;
    managerTradeInventory: FrontmatterInventory | undefined;
    setManagerTradeInventory: React.Dispatch<React.SetStateAction<FrontmatterInventory | undefined>>;
    managerTradeInventoryFiles: FrontmatterFile[] | undefined;
    setManagerTradeInventoryFiles: React.Dispatch<React.SetStateAction<FrontmatterFile[] | undefined>>;
    managerStrategyInventory: FrontmatterInventory | undefined;
    setManagerStrategyInventory: React.Dispatch<React.SetStateAction<FrontmatterInventory | undefined>>;
    managerStrategyInventoryFiles: FrontmatterFile[] | undefined;
    setManagerStrategyInventoryFiles: React.Dispatch<React.SetStateAction<FrontmatterFile[] | undefined>>;

    // Search & Inspector
    managerSearch: string;
    setManagerSearch: React.Dispatch<React.SetStateAction<string>>;
    managerScope: "trade" | "strategy";
    setManagerScope: React.Dispatch<React.SetStateAction<"trade" | "strategy">>;
    managerInspectorKey: string | undefined;
    setManagerInspectorKey: React.Dispatch<React.SetStateAction<string | undefined>>;
    managerInspectorTab: "vals" | "files";
    setManagerInspectorTab: React.Dispatch<React.SetStateAction<"vals" | "files">>;
    managerInspectorFileFilter: { paths: string[]; label?: string } | undefined;
    setManagerInspectorFileFilter: React.Dispatch<React.SetStateAction<{ paths: string[]; label?: string } | undefined>>;
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
    const [managerBackups, setManagerBackups] = React.useState<Record<string, string> | undefined>(undefined);
    const [managerTradeInventory, setManagerTradeInventory] = React.useState<FrontmatterInventory | undefined>(undefined);
    const [managerTradeInventoryFiles, setManagerTradeInventoryFiles] = React.useState<FrontmatterFile[] | undefined>(undefined);
    const [managerStrategyInventory, setManagerStrategyInventory] = React.useState<FrontmatterInventory | undefined>(undefined);
    const [managerStrategyInventoryFiles, setManagerStrategyInventoryFiles] = React.useState<FrontmatterFile[] | undefined>(undefined);

    // Search & Inspector
    const [managerSearch, setManagerSearch] = React.useState("");
    const [managerScope, setManagerScope] = React.useState<"trade" | "strategy">("trade");
    const [managerInspectorKey, setManagerInspectorKey] = React.useState<string | undefined>(undefined);
    const [managerInspectorTab, setManagerInspectorTab] = React.useState<"vals" | "files">("vals");
    const [managerInspectorFileFilter, setManagerInspectorFileFilter] = React.useState<{ paths: string[]; label?: string } | undefined>(undefined);

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

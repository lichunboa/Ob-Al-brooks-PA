import * as React from "react";
import type { TradeIndex } from "../core/trade-index";
import type { StrategyIndex } from "../core/strategy-index";
import type { TodayContext } from "../core/today-context";
import type { AlBrooksConsoleSettings } from "../settings";
import type { EnumPresets } from "../core/enum-presets";
import type { PluginIntegrationRegistry } from "../integrations/PluginIntegrationRegistry";
import type { PaTagSnapshot, SchemaIssueItem } from "../types";
import type { FrontmatterFile, FixPlan, ManagerApplyResult, StrategyNoteFrontmatter } from "../core/manager";
import type { CourseSnapshot } from "../core/course";
import type { MemorySnapshot } from "../core/memory";
import type { TradeRecord } from "../core/contracts";

// Hooks
import { useDashboardData } from "../hooks/useDashboardData";
import { useAnalyticsState } from "../hooks/useAnalyticsState";
import { useSchemaState } from "../hooks/useSchemaState";
import { useSchemaScanner } from "../hooks/useSchemaScanner";
import { useDashboardActions } from "../hooks/useDashboardActions";
import { useLearnData } from "../hooks/useLearnData";

// Define the Context Data Shape
export interface ConsoleContextValue {
    // 基础 Props (来自 Obsidian View)
    index: TradeIndex;
    strategyIndex: StrategyIndex;
    todayContext?: TodayContext;
    settings: AlBrooksConsoleSettings;
    onSaveSettings: (settings: AlBrooksConsoleSettings) => Promise<void>;
    version: string;
    app: any;

    // 工具函数 (来自 Props)
    openFile: (path: string) => Promise<void>;
    resolveLink?: (linkText: string, fromPath: string) => string | undefined;
    getResourceUrl?: (path: string) => string | undefined;
    runCommand?: (commandId: string) => boolean;
    openGlobalSearch?: (query: string) => void;
    promptText?: (options: any) => Promise<string | null>;
    confirmDialog?: (options: any) => Promise<boolean>;

    // 异步加载器 (来自 Props)
    loadStrategyNotes?: () => Promise<StrategyNoteFrontmatter[]>;
    loadPaTagSnapshot?: () => Promise<PaTagSnapshot>;
    loadAllFrontmatterFiles?: () => Promise<FrontmatterFile[]>;
    applyFixPlan?: (plan: FixPlan, options?: { deleteKeys?: boolean }) => Promise<ManagerApplyResult>;
    restoreFiles?: (backups: Record<string, string>) => Promise<ManagerApplyResult>;
    createTradeNote?: () => Promise<void>;
    loadCourse?: (settings: AlBrooksConsoleSettings) => Promise<CourseSnapshot>;
    loadMemory?: (settings: AlBrooksConsoleSettings) => Promise<MemorySnapshot>;

    // 插件集成
    integrations?: PluginIntegrationRegistry;
    enumPresets?: EnumPresets;

    // 核心数据 (useDashboardData)
    trades: TradeRecord[];
    strategies: any[];
    status: any;
    todayMarketCycle: string[];
    journalLogs: any[];
    tradingPlans: any[];
    refreshTrades: () => void;
    refreshStrategies: () => void;
    saveJournalLog: (entry: any) => Promise<void>;
    saveTradingPlan: (plan: any) => Promise<void>;

    // 分析状态 (useAnalyticsState)
    analyticsScope: any;
    galleryScope: any;
    setAnalyticsScope: (scope: any) => void;
    setGalleryScope: (scope: any) => void;

    // Schema 状态 (useSchemaState)
    showFixPlan: boolean;
    setShowFixPlan: (show: boolean) => void;
    paTagSnapshot: PaTagSnapshot | undefined;
    schemaIssues: SchemaIssueItem[];
    // Setters
    setPaTagSnapshot: (snapshot: PaTagSnapshot | undefined) => void;
    setSchemaIssues: (issues: SchemaIssueItem[]) => void;
    setSchemaScanNote: (note: string | undefined) => void;
    schemaScanNote: string | undefined;

    // 学习模式数据 (useLearnData)
    course: CourseSnapshot | undefined;
    memory: MemorySnapshot | undefined;
    courseBusy: boolean;
    memoryBusy: boolean;
    courseError: string | undefined;
    memoryError: string | undefined;
    memoryShakeIndex: number;
    memoryIgnoreFocus: boolean;
    setMemoryShakeIndex: (i: number) => void;
    setMemoryIgnoreFocus: (b: boolean) => void;
    reloadCourse: () => void;
    reloadMemory: () => void;
    hardRefreshMemory: () => void;

    // 交互动作 (useDashboardActions)
    handleToggleChecklistItem: (index: number) => Promise<void>;
    handleUpdateRiskLimit: (limit: number) => Promise<void>;

    // 全局 UI 状态
    currencyMode: 'USD' | 'CNY';
    setCurrencyMode: (mode: 'USD' | 'CNY') => void;
}

// Create Context
const ConsoleContext = React.createContext<ConsoleContextValue | undefined>(undefined);

// Props needed to initialize the provider (subset of Dashboard Props)
export interface ConsoleProviderProps {
    // Standard dependencies from View
    index: TradeIndex;
    strategyIndex: StrategyIndex;
    todayContext?: TodayContext;
    settings: AlBrooksConsoleSettings;
    onSaveSettings: (settings: AlBrooksConsoleSettings) => Promise<void>;
    app: any;
    version: string;

    // Callbacks
    openFile: (path: string) => Promise<void>;
    resolveLink?: (linkText: string, fromPath: string) => string | undefined;
    getResourceUrl?: (path: string) => string | undefined;
    runCommand?: (commandId: string) => boolean;
    openGlobalSearch?: (query: string) => void;
    promptText?: (options: any) => Promise<string | null>;
    confirmDialog?: (options: any) => Promise<boolean>;

    // Data Loaders
    loadStrategyNotes?: () => Promise<StrategyNoteFrontmatter[]>;
    loadPaTagSnapshot?: () => Promise<PaTagSnapshot>;
    loadAllFrontmatterFiles?: () => Promise<FrontmatterFile[]>;
    applyFixPlan?: (plan: FixPlan, options?: { deleteKeys?: boolean }) => Promise<ManagerApplyResult>;
    restoreFiles?: (backups: Record<string, string>) => Promise<ManagerApplyResult>;
    createTradeNote?: () => Promise<void>;
    loadCourse?: (settings: AlBrooksConsoleSettings) => Promise<CourseSnapshot>;
    loadMemory?: (settings: AlBrooksConsoleSettings) => Promise<MemorySnapshot>;

    // Configs
    integrations?: PluginIntegrationRegistry;
    enumPresets?: EnumPresets;

    children: React.ReactNode;
}

export const ConsoleProvider: React.FC<ConsoleProviderProps> = (props) => {
    // 1. Core Data
    const dashboardData = useDashboardData({
        index: props.index,
        strategyIndex: props.strategyIndex,
        todayContext: props.todayContext,
        settings: props.settings,
        onSaveSettings: props.onSaveSettings
    });

    // 2. Analytics State
    const analyticsState = useAnalyticsState();

    // 3. Schema State & Scanner
    const schemaState = useSchemaState();
    useSchemaScanner(
        dashboardData.trades,
        props.loadStrategyNotes,
        props.loadPaTagSnapshot,
        schemaState.setPaTagSnapshot,
        schemaState.setSchemaIssues,
        schemaState.setSchemaScanNote
    );

    // 4. Actions
    const dashboardActions = useDashboardActions(props.app, props.index);

    // 5. Learn Data
    const learnData = useLearnData({
        loadCourse: props.loadCourse,
        loadMemory: props.loadMemory,
        settings: props.settings,
        integrations: props.integrations
    });

    // 6. Global UI State
    const [currencyMode, setCurrencyMode] = React.useState<'USD' | 'CNY'>('USD');

    const value: ConsoleContextValue = {
        // Pass-through Props
        index: props.index,
        strategyIndex: props.strategyIndex,
        todayContext: props.todayContext,
        settings: props.settings,
        onSaveSettings: props.onSaveSettings,
        version: props.version,
        app: props.app,
        openFile: props.openFile,
        resolveLink: props.resolveLink,
        getResourceUrl: props.getResourceUrl,
        runCommand: props.runCommand,
        openGlobalSearch: props.openGlobalSearch,
        promptText: props.promptText,
        confirmDialog: props.confirmDialog,
        loadStrategyNotes: props.loadStrategyNotes,
        loadPaTagSnapshot: props.loadPaTagSnapshot,
        loadAllFrontmatterFiles: props.loadAllFrontmatterFiles,
        applyFixPlan: props.applyFixPlan,
        restoreFiles: props.restoreFiles,
        createTradeNote: props.createTradeNote,
        loadCourse: props.loadCourse,
        loadMemory: props.loadMemory,
        integrations: props.integrations,
        enumPresets: props.enumPresets,

        // Hook Data
        ...dashboardData,
        ...analyticsState,
        ...schemaState,
        ...learnData,
        ...dashboardActions,

        // UI State
        currencyMode,
        setCurrencyMode
    };

    return (
        <ConsoleContext.Provider value={value}>
            {props.children}
        </ConsoleContext.Provider>
    );
};

// Custom Hook to use the context
export function useConsoleContext() {
    const context = React.useContext(ConsoleContext);
    if (context === undefined) {
        throw new Error("useConsoleContext must be used within a ConsoleProvider");
    }
    return context;
}

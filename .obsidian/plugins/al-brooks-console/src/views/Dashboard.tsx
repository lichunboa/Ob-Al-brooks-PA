import * as React from "react";
// Import manager execution helpers
import {
  loadPaTagSnapshot,
  loadAllFrontmatterFiles,
  loadStrategyNotes,
  applyFixPlan,
  loadCourse,
  loadMemory,
} from "../core/manager-execution";

// ... (existing imports are fine, I will add these at top via separate replace or just use fully qualified imports if I can't touch top easily.
// But I can touch top. I'll split into 2 replaces.)

// Replace 1: Add imports.
// Replace 2: Update ConsoleComponent usage.

import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type { TradeIndex } from "../core/trade-index";
import type { StrategyIndex } from "../core/strategy-index";
import type { TodayContext } from "../core/today-context";
import type { AlBrooksConsoleSettings } from "../settings";
import type { EnumPresets } from "../core/enum-presets";
import type { PluginIntegrationRegistry } from "../integrations/PluginIntegrationRegistry";
import type {
  FrontmatterFile,
  FixPlan,
  ManagerApplyResult,
  StrategyNoteFrontmatter,
} from "../core/manager";
import type { PaTagSnapshot } from "../types";
import type { CourseSnapshot } from "../core/course";
import type { MemorySnapshot } from "../core/memory";

import { ConsoleProvider } from "../context/ConsoleContext";
import { ConsoleContent } from "./ConsoleContent";
import { ConsoleErrorBoundary } from "../ui/components/ConsoleErrorBoundary";

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";

interface Props {
  index: TradeIndex;
  strategyIndex: StrategyIndex;
  todayContext?: TodayContext;
  resolveLink?: (linkText: string, fromPath: string) => string | undefined;
  getResourceUrl?: (path: string) => string | undefined;
  enumPresets?: EnumPresets;
  app?: any;
  loadStrategyNotes?: () => Promise<StrategyNoteFrontmatter[]>;
  loadPaTagSnapshot?: () => Promise<PaTagSnapshot>;
  /** v5 属性管理器：扫描全库 frontmatter（不依赖 Dataview） */
  loadAllFrontmatterFiles?: () => Promise<FrontmatterFile[]>;
  applyFixPlan?: (
    plan: FixPlan,
    options?: { deleteKeys?: boolean }
  ) => Promise<ManagerApplyResult>;
  restoreFiles?: (
    backups: Record<string, string>
  ) => Promise<ManagerApplyResult>;
  createTradeNote?: () => Promise<void>;
  settings: AlBrooksConsoleSettings;
  onSaveSettings: (settings: AlBrooksConsoleSettings) => Promise<void>;
  subscribeSettings?: (
    listener: (settings: AlBrooksConsoleSettings) => void
  ) => () => void;
  loadCourse?: (settings: AlBrooksConsoleSettings) => Promise<CourseSnapshot>;
  loadMemory?: (settings: AlBrooksConsoleSettings) => Promise<MemorySnapshot>;
  promptText?: (options: {
    title: string;
    defaultValue?: string;
    placeholder?: string;
    okText?: string;
    cancelText?: string;
  }) => Promise<string | null>;
  confirmDialog?: (options: {
    title: string;
    message: string;
    okText?: string;
    cancelText?: string;
  }) => Promise<boolean>;
  openFile: (path: string) => Promise<void>;
  openGlobalSearch?: (query: string) => void;
  runCommand?: (commandId: string) => boolean;
  integrations?: PluginIntegrationRegistry;
  version: string;
}

const ConsoleComponent: React.FC<Props> = (props) => {
  return (
    <ConsoleProvider
      index={props.index}
      strategyIndex={props.strategyIndex}
      todayContext={props.todayContext}
      settings={props.settings}
      onSaveSettings={props.onSaveSettings}
      app={props.app}
      version={props.version}
      openFile={props.openFile}
      resolveLink={props.resolveLink}
      getResourceUrl={props.getResourceUrl}
      runCommand={props.runCommand}
      openGlobalSearch={props.openGlobalSearch}
      promptText={props.promptText}
      confirmDialog={props.confirmDialog}
      loadStrategyNotes={props.loadStrategyNotes}
      loadPaTagSnapshot={props.loadPaTagSnapshot}
      loadAllFrontmatterFiles={props.loadAllFrontmatterFiles}
      applyFixPlan={props.applyFixPlan}
      restoreFiles={props.restoreFiles}
      createTradeNote={props.createTradeNote}
      loadCourse={props.loadCourse}
      loadMemory={props.loadMemory}
      integrations={props.integrations}
      enumPresets={props.enumPresets}
    >
      <ConsoleContent />
    </ConsoleProvider>
  );
};

export class ConsoleView extends ItemView {
  private index: TradeIndex;
  private strategyIndex: StrategyIndex;
  private todayContext?: TodayContext;
  private integrations?: PluginIntegrationRegistry;
  private enumPresets?: EnumPresets;
  private version: string;
  private root: Root | null = null;
  private getSettings: () => AlBrooksConsoleSettings;
  private subscribeSettings: (
    listener: (settings: AlBrooksConsoleSettings) => void
  ) => () => void;
  private saveSettings: (settings: AlBrooksConsoleSettings) => Promise<void>;

  constructor(
    leaf: WorkspaceLeaf,
    index: TradeIndex,
    strategyIndex: StrategyIndex,
    todayContext: TodayContext,
    integrations: PluginIntegrationRegistry,
    enumPresets: EnumPresets | undefined,
    version: string,
    getSettings: () => AlBrooksConsoleSettings,
    subscribeSettings: (
      listener: (settings: AlBrooksConsoleSettings) => void
    ) => () => void,
    saveSettings: (settings: AlBrooksConsoleSettings) => Promise<void>
  ) {
    super(leaf);
    this.index = index;
    this.strategyIndex = strategyIndex;
    this.todayContext = todayContext;
    this.integrations = integrations;
    this.enumPresets = enumPresets;
    this.version = version;
    this.getSettings = getSettings;
    this.subscribeSettings = subscribeSettings;
    this.saveSettings = saveSettings;
  }

  getViewType() {
    return VIEW_TYPE_CONSOLE;
  }

  getDisplayText() {
    return "AL Brooks Console";
  }

  getIcon() {
    return "layout-dashboard";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    const rootEl = container.createDiv();
    rootEl.addClass("al-brooks-console-root");

    this.root = createRoot(rootEl);

    const render = () => {
      const settings = this.getSettings();

      this.root?.render(
        <ConsoleErrorBoundary>
          <ConsoleComponent
            index={this.index}
            strategyIndex={this.strategyIndex}
            todayContext={this.todayContext}
            settings={settings}
            onSaveSettings={this.saveSettings}
            version={this.version}
            app={this.app}
            integrations={this.integrations}
            enumPresets={this.enumPresets}
            openFile={async (path) => {
              this.app.workspace.openLinkText(path, "", true);
            }}
            // Manager / Data Loaders
            loadStrategyNotes={() => loadStrategyNotes(this.app)}
            loadPaTagSnapshot={() => loadPaTagSnapshot(this.app)}
            loadAllFrontmatterFiles={() => loadAllFrontmatterFiles(this.app)}
            applyFixPlan={(plan, options) => applyFixPlan(this.app, plan, options)}
            loadCourse={() => loadCourse(this.app, this.getSettings())}
            loadMemory={() => loadMemory(this.app, this.getSettings())}
            runCommand={(id) => {
              const commands = (this.app as any).commands;
              // 先检查命令是否存在
              const allCommands = commands.listCommands();
              const commandExists = allCommands.some((c: any) => c.id === id);

              if (!commandExists) {
                console.log(`[Dashboard] 命令不存在: ${id}`);
                return false;
              }

              // 执行命令
              try {
                commands.executeCommandById(id);
                console.log(`[Dashboard] 成功执行命令: ${id}`);
                return true;
              } catch (e) {
                console.error(`[Dashboard] 执行命令失败: ${id}`, e);
                return false;
              }
            }}
            getResourceUrl={(path) => {
              const file = this.app.vault.getAbstractFileByPath(path);
              return file instanceof TFile ? this.app.vault.getResourcePath(file) : undefined;
            }}
          />
        </ConsoleErrorBoundary>
      );
    };

    render();

    this.subscribeSettings(() => {
      render();
    });
  }

  async onClose() {
    this.root?.unmount();
  }
}

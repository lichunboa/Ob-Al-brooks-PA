import './ui/styles/dashboard.css';
import { Notice, Plugin, WorkspaceLeaf, TFile } from "obsidian";
import { ConsoleView, VIEW_TYPE_CONSOLE } from "./views/Dashboard";
import { ObsidianTradeIndex } from "./platforms/obsidian/obsidian-trade-index";
import { ObsidianStrategyIndex } from "./platforms/obsidian/obsidian-strategy-index";
import { ObsidianTodayContext } from "./platforms/obsidian/obsidian-today-context";
import { PluginIntegrationRegistry } from "./integrations/PluginIntegrationRegistry";
import { DEFAULT_SETTINGS, type AlBrooksConsoleSettings } from "./settings";
import { AlBrooksConsoleSettingTab } from "./settings-tab";
import { computeTradeStatsByAccountType } from "./core/stats";
import { buildConsoleExportSnapshot } from "./core/export-snapshot";
import { buildTodaySnapshot } from "./core/console-state";
import { SchemaLoader } from "./core/schema-loader";
import { EnumPresets } from "./core/enum-presets";
import { ActionService } from "./core/action/action-service";
import { DailyPlanSyncer } from "./core/daily-plan-syncer";

export default class AlBrooksConsolePlugin extends Plugin {
  public index: ObsidianTradeIndex;
  public strategyIndex: ObsidianStrategyIndex;
  public todayContext: ObsidianTodayContext;
  public integrations: PluginIntegrationRegistry;
  public enumPresets?: EnumPresets;
  public actionService: ActionService;
  public dailyPlanSyncer: DailyPlanSyncer;
  public settings: AlBrooksConsoleSettings = DEFAULT_SETTINGS;
  private settingsListeners = new Set<
    (settings: AlBrooksConsoleSettings) => void
  >();

  public onSettingsChanged(
    listener: (settings: AlBrooksConsoleSettings) => void
  ): () => void {
    this.settingsListeners.add(listener);
    return () => this.settingsListeners.delete(listener);
  }

  private notifySettingsChanged() {
    for (const l of this.settingsListeners) {
      try {
        l(this.settings);
      } catch (e) {
        // ignore listener errors
      }
    }
  }

  async loadSettings() {
    const saved =
      (await this.loadData()) as Partial<AlBrooksConsoleSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.notifySettingsChanged();
  }

  async onload() {
    console.log("🦁 交易员控制台：加载中…");

    await this.loadSettings();
    await this.loadSettings();
    this.addSettingTab(new AlBrooksConsoleSettingTab(this.app, this));

    // Initialize Services
    this.actionService = new ActionService(this.app);
    this.dailyPlanSyncer = new DailyPlanSyncer(this.app, this.actionService);
    this.dailyPlanSyncer.onload();

    // 1. Initialize Indexer
    this.index = new ObsidianTradeIndex(this.app);
    this.strategyIndex = new ObsidianStrategyIndex(this.app);
    this.todayContext = new ObsidianTodayContext(this.app);
    this.integrations = new PluginIntegrationRegistry(this.app);

    // Load dynamic schema
    try {
      this.enumPresets = await new SchemaLoader(this.app).load();
    } catch (e) {
      console.warn("Failed to load schema presets:", e);
    }

    // 2. Start Scanning (Async)
    this.app.workspace.onLayoutReady(() => {
      void this.index.initialize();
      void this.strategyIndex.initialize();
      void this.todayContext.initialize();
    });

    this.registerView(
      VIEW_TYPE_CONSOLE,
      (leaf: WorkspaceLeaf) =>
        new ConsoleView(
          leaf,
          this.index,
          this.strategyIndex,
          this.todayContext,
          this.integrations,
          this.manifest.version,
          () => this.settings,
          (cb: (settings: AlBrooksConsoleSettings) => void) => this.onSettingsChanged(cb),
          async (newSettings: AlBrooksConsoleSettings) => {
            this.settings = newSettings;
            await this.saveSettings();
          }
        )
    );

    this.addRibbonIcon("bar-chart-2", "打开交易员控制台", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-console",
      name: "打开交易员控制台",
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: "export-legacy-snapshot",
      name: "导出旧版兼容快照 (pa-db-export.json)",
      callback: () => {
        void this.exportLegacySnapshot();
      },
    });

    this.addCommand({
      id: "export-index-snapshot",
      name: "导出索引快照 (JSON)",
      callback: () => {
        void this.exportIndexSnapshot();
      },
    });

    this.addCommand({
      id: "create-trade-note",
      name: "新建交易笔记",
      callback: () => {
        const path = "Templates/单笔交易模版 (Trade Note).md";
        this.app.workspace.openLinkText(path, "", true);
      },
    });
  }

  onunload() {
    this.dailyPlanSyncer?.onunload();
  }

  private async exportIndexSnapshot(): Promise<void> {
    try {
      const snapshot = this.buildSnapshot();
      const content = JSON.stringify(snapshot, null, 2);
      const dir = "Exports/al-brooks-console";
      await this.ensureFolder(dir);

      const stamp = this.toFileTimestamp(new Date());
      const base = `${dir}/snapshot_${stamp}.json`;
      const path = await this.pickAvailablePath(base);
      await this.app.vault.create(path, content);
      new Notice(`交易员控制台：已导出快照 → ${path}`);
    } catch (e) {
      new Notice(
        `交易员控制台：导出失败：${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  private async exportLegacySnapshot(): Promise<void> {
    try {
      const snapshot = this.buildSnapshot();
      // Wraps in a structure vaguely resembling old paData if needed,
      // but usually tools just need 'trades'. The current snapshot has 'trades'.
      // We will save it to the fixed legacy path (vault root): pa-db-export.json

      const content = JSON.stringify(snapshot, null, 2);

      const dir = "Exports/al-brooks-console";
      await this.ensureFolder(dir);

      const path = `${dir}/pa-db-export.json`;
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing) {
        if (existing instanceof TFile) {
          await this.app.vault.modify(existing, content);
        }
      } else {
        await this.app.vault.create(path, content);
      }
      new Notice(`交易员控制台：已导出旧版兼容快照 → ${path}`);
    } catch (e) {
      new Notice(
        `交易员控制台：导出失败：${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  private buildSnapshot() {
    const exportedAt = new Date().toISOString();
    const trades = this.index?.getAll?.() ?? [];
    const statsByAccountType = computeTradeStatsByAccountType(trades);
    const strategyCards = this.strategyIndex?.list?.();

    const todayMarketCycle = this.todayContext?.getTodayMarketCycle?.();
    const today = buildTodaySnapshot({
      todayMarketCycle,
      strategyIndex: this.strategyIndex,
      limit: 6,
    });

    return buildConsoleExportSnapshot({
      exportedAt,
      pluginVersion: this.manifest.version,
      trades,
      statsByAccountType,
      strategyCards,
      today,
    });
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = String(path ?? "")
      .replace(/^\/+/, "")
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean);

    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      const existing = this.app.vault.getAbstractFileByPath(cur);
      if (!existing) {
        try {
          await this.app.vault.createFolder(cur);
        } catch {
          // ignore if created concurrently
        }
      }
    }
  }

  private async pickAvailablePath(basePath: string): Promise<string> {
    const raw = String(basePath ?? "").replace(/^\/+/, "");
    if (!this.app.vault.getAbstractFileByPath(raw)) return raw;

    const m = raw.match(/^(.*?)(\.[^./]+)$/);
    const prefix = m ? m[1] : raw;
    const ext = m ? m[2] : "";
    for (let i = 2; i <= 9999; i++) {
      const candidate = `${prefix}_${i}${ext}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    return `${prefix}_${Date.now()}${ext}`;
  }

  private toFileTimestamp(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${y}${m}${day}_${hh}${mm}${ss}`;
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_CONSOLE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_CONSOLE, active: true });
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}

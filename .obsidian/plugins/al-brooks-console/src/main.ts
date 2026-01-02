import { Plugin, WorkspaceLeaf } from "obsidian";
import { ConsoleView, VIEW_TYPE_CONSOLE } from "./views/Dashboard";
import { ObsidianTradeIndex } from "./platforms/obsidian/obsidian-trade-index";
import { ObsidianStrategyIndex } from "./platforms/obsidian/obsidian-strategy-index";
import { ObsidianTodayContext } from "./platforms/obsidian/obsidian-today-context";
import { PluginIntegrationRegistry } from "./integrations/PluginIntegrationRegistry";
import { DEFAULT_SETTINGS, type AlBrooksConsoleSettings } from "./settings";
import { AlBrooksConsoleSettingTab } from "./settings-tab";

export default class AlBrooksConsolePlugin extends Plugin {
    public index: ObsidianTradeIndex;
    public strategyIndex: ObsidianStrategyIndex;
	public todayContext: ObsidianTodayContext;
	public integrations: PluginIntegrationRegistry;
    public settings: AlBrooksConsoleSettings = DEFAULT_SETTINGS;
    private settingsListeners = new Set<(settings: AlBrooksConsoleSettings) => void>();

    public onSettingsChanged(listener: (settings: AlBrooksConsoleSettings) => void): () => void {
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
        const saved = (await this.loadData()) as Partial<AlBrooksConsoleSettings> | null;
        this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.notifySettingsChanged();
    }

    async onload() {
        console.log("🦁 Al Brooks Console: Loading...");

		await this.loadSettings();
		this.addSettingTab(new AlBrooksConsoleSettingTab(this.app, this));

        // 1. Initialize Indexer
        this.index = new ObsidianTradeIndex(this.app);
		this.strategyIndex = new ObsidianStrategyIndex(this.app);
		this.todayContext = new ObsidianTodayContext(this.app);
        this.integrations = new PluginIntegrationRegistry(this.app);

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
                    (cb) => this.onSettingsChanged(cb)
                )
        );

        this.addRibbonIcon("bar-chart-2", "Open Trader Console", () => {
            this.activateView();
        });

        this.addCommand({
            id: "open-console",
            name: "Open Trader Console",
            callback: () => {
                this.activateView();
            }
        });
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

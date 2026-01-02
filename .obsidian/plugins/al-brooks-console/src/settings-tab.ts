import { App, PluginSettingTab, Setting } from "obsidian";
import type AlBrooksConsolePlugin from "./main";

function clampInt(value: string, fallback: number, min: number, max: number): number {
	const n = Number.parseInt(String(value ?? "").trim(), 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, n));
}

export class AlBrooksConsoleSettingTab extends PluginSettingTab {
	private plugin: AlBrooksConsolePlugin;

	constructor(app: App, plugin: AlBrooksConsolePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Al Brooks Console" });

		new Setting(containerEl)
			.setName("Course: 推荐窗口")
			.setDesc("Course 分区展示的“Up Next”候选数量。")
			.addText((t) => {
				t.inputEl.type = "number";
				t.setPlaceholder("3");
				t.setValue(String(this.plugin.settings.courseRecommendationWindow));
				t.onChange((v) => {
					this.plugin.settings.courseRecommendationWindow = clampInt(v, 3, 1, 20);
					void this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Memory: Due 阈值 (天)")
			.setDesc("将 dueDate <= 今日+阈值天 的卡片计为 Due。0 表示仅统计今天及以前到期。")
			.addText((t) => {
				t.inputEl.type = "number";
				t.setPlaceholder("0");
				t.setValue(String(this.plugin.settings.srsDueThresholdDays));
				t.onChange((v) => {
					this.plugin.settings.srsDueThresholdDays = clampInt(v, 0, 0, 30);
					void this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Memory: 随机抽题数量")
			.setDesc("Memory 分区展示的随机题库条目数量。")
			.addText((t) => {
				t.inputEl.type = "number";
				t.setPlaceholder("5");
				t.setValue(String(this.plugin.settings.srsRandomQuizCount));
				t.onChange((v) => {
					this.plugin.settings.srsRandomQuizCount = clampInt(v, 5, 1, 50);
					void this.plugin.saveSettings();
				});
			});
	}
}

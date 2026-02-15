import { App, PluginSettingTab, Setting } from "obsidian";
import type AlBrooksConsolePlugin from "./main";
import { getBackendClient, resetBackendClient } from "./services/backend-client";

function clampInt(
  value: string,
  fallback: number,
  min: number,
  max: number
): number {
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

    // ============================================================
    // Learning Settings
    // ============================================================
    containerEl.createEl("h3", { text: "📚 学习设置" });

    new Setting(containerEl)
      .setName("Course: 推荐窗口")
      .setDesc("Course 分区展示的 Up Next 候选数量。")
      .addText((t) => {
        t.inputEl.type = "number";
        t.setPlaceholder("3");
        t.setValue(String(this.plugin.settings.courseRecommendationWindow));
        t.onChange((v) => {
          this.plugin.settings.courseRecommendationWindow = clampInt(
            v,
            3,
            1,
            20
          );
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Memory: Due 阈值 (天)")
      .setDesc(
        "将 dueDate <= 今日+阈值天 的卡片计为 Due。0 表示仅统计今天及以前到期。"
      )
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

    // ============================================================
    // Backend Settings
    // ============================================================
    containerEl.createEl("h3", { text: "🔌 后端服务设置" });

    new Setting(containerEl)
      .setName("启用后端服务")
      .setDesc("启用与 AB Console 后端服务的连接，获取实时市场数据和信号。")
      .addToggle((t) => {
        t.setValue(this.plugin.settings.backend.enabled);
        t.onChange((v) => {
          this.plugin.settings.backend.enabled = v;
          resetBackendClient();
          void this.plugin.saveSettings();
          this.display(); // Refresh to show/hide related settings
        });
      });

    if (this.plugin.settings.backend.enabled) {
      new Setting(containerEl)
        .setName("后端地址")
        .setDesc("API Gateway 服务地址 (例如: http://localhost:8088)")
        .addText((t) => {
          t.setPlaceholder("http://localhost:8088");
          t.setValue(this.plugin.settings.backend.baseUrl);
          t.onChange((v) => {
            this.plugin.settings.backend.baseUrl = v.trim() || "http://localhost:8088";
            resetBackendClient();
            void this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName("API Token")
        .setDesc("可选的 API 认证令牌")
        .addText((t) => {
          t.setPlaceholder("留空表示不使用认证");
          t.setValue(this.plugin.settings.backend.apiToken);
          t.inputEl.type = "password";
          t.onChange((v) => {
            this.plugin.settings.backend.apiToken = v;
            resetBackendClient();
            void this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName("请求超时 (毫秒)")
        .setDesc("API 请求超时时间")
        .addText((t) => {
          t.inputEl.type = "number";
          t.setPlaceholder("30000");
          t.setValue(String(this.plugin.settings.backend.timeout));
          t.onChange((v) => {
            this.plugin.settings.backend.timeout = clampInt(v, 30000, 5000, 120000);
            resetBackendClient();
            void this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName("自动刷新间隔 (秒)")
        .setDesc("市场数据自动刷新间隔，0 表示禁用自动刷新")
        .addText((t) => {
          t.inputEl.type = "number";
          t.setPlaceholder("0");
          t.setValue(String(this.plugin.settings.backend.autoRefreshInterval));
          t.onChange((v) => {
            this.plugin.settings.backend.autoRefreshInterval = clampInt(v, 0, 0, 3600);
            void this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName("默认交易对")
        .setDesc("默认显示的交易对符号")
        .addText((t) => {
          t.setPlaceholder("BTCUSDT");
          t.setValue(this.plugin.settings.backend.defaultSymbol);
          t.onChange((v) => {
            this.plugin.settings.backend.defaultSymbol = v.trim().toUpperCase() || "BTCUSDT";
            void this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName("默认时间周期")
        .setDesc("默认的 K 线时间周期")
        .addDropdown((d) => {
          d.addOption("1m", "1 分钟");
          d.addOption("5m", "5 分钟");
          d.addOption("15m", "15 分钟");
          d.addOption("1h", "1 小时");
          d.addOption("4h", "4 小时");
          d.addOption("1d", "1 天");
          d.setValue(this.plugin.settings.backend.defaultInterval);
          d.onChange((v) => {
            this.plugin.settings.backend.defaultInterval = v;
            void this.plugin.saveSettings();
          });
        });

      // Test connection button
      new Setting(containerEl)
        .setName("测试连接")
        .setDesc("测试与后端服务的连接")
        .addButton((b) => {
          b.setButtonText("测试");
          b.onClick(async () => {
            b.setButtonText("测试中...");
            b.setDisabled(true);
            try {
              const client = getBackendClient({
                baseUrl: this.plugin.settings.backend.baseUrl,
                apiToken: this.plugin.settings.backend.apiToken || undefined,
                timeout: this.plugin.settings.backend.timeout,
              });
              const isAvailable = await client.isAvailable();
              if (isAvailable) {
                const status = await client.getStatus();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.app as any).showNotice?.(
                  `✅ 连接成功！后端状态: ${status.status}`
                );
              } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.app as any).showNotice?.("❌ 连接失败：服务不可用");
              }
            } catch (error) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (this.app as any).showNotice?.(
                `❌ 连接失败: ${(error as Error).message}`
              );
            } finally {
              b.setButtonText("测试");
              b.setDisabled(false);
            }
          });
        });
    }

    // ============================================================
    // AI Settings
    // ============================================================
    containerEl.createEl("h3", { text: "🤖 AI 服务设置" });

    new Setting(containerEl)
      .setName("AI API 地址")
      .setDesc("AI 服务 API 地址 (例如: http://127.0.0.1:8045)")
      .addText((t) => {
        t.setPlaceholder("http://127.0.0.1:8045");
        t.setValue(this.plugin.settings.ai.apiEndpoint);
        t.onChange((v) => {
          this.plugin.settings.ai.apiEndpoint = v.trim() || "http://127.0.0.1:8045";
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("AI API Key")
      .setDesc("AI 服务的 API 密钥")
      .addText((t) => {
        t.setPlaceholder("输入 API Key");
        t.setValue(this.plugin.settings.ai.apiKey);
        t.inputEl.type = "password";
        t.onChange((v) => {
          this.plugin.settings.ai.apiKey = v;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("AI 模型")
      .setDesc("选择使用的 AI 模型")
      .addDropdown((d) => {
        d.addOption("gemini-3-pro-high", "Gemini 3 Pro");
        d.addOption("gemini-3-pro-low", "Gemini 3 Pro (低延迟)");
        d.setValue(this.plugin.settings.ai.model);
        d.onChange((v) => {
          this.plugin.settings.ai.model = v;
          void this.plugin.saveSettings();
        });
      });

    // ============================================================
    // Telegram Settings
    // ============================================================
    containerEl.createEl("h3", { text: "📱 Telegram 推送设置" });

    new Setting(containerEl)
      .setName("启用桌面通知")
      .setDesc("发现交易信号时显示桌面通知")
      .addToggle((t) => {
        t.setValue(this.plugin.settings.telegram.enableDesktopNotifications);
        t.onChange((v) => {
          this.plugin.settings.telegram.enableDesktopNotifications = v;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("启用 Telegram 推送")
      .setDesc("发现交易信号时发送 Telegram 消息 (需要先配置 Bot)")
      .addToggle((t) => {
        t.setValue(this.plugin.settings.telegram.enableTelegramPush);
        t.onChange((v) => {
          this.plugin.settings.telegram.enableTelegramPush = v;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Bot Token")
      .setDesc("从 @BotFather 获取的 Telegram Bot Token")
      .addText((t) => {
        t.setPlaceholder("123456789:ABCdefGHI...");
        t.setValue(this.plugin.settings.telegram.botToken);
        t.inputEl.type = "password";
        t.onChange((v) => {
          this.plugin.settings.telegram.botToken = v;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Chat ID")
      .setDesc("接收消息的 Chat ID (私聊为用户ID，群组为负数)")
      .addText((t) => {
        t.setPlaceholder("例如: 123456789 或 -1001234567890");
        t.setValue(this.plugin.settings.telegram.chatId);
        t.onChange((v) => {
          this.plugin.settings.telegram.chatId = v;
          void this.plugin.saveSettings();
        });
      });

    // ============================================================
    // Notification Settings
    // ============================================================
    containerEl.createEl("h3", { text: "🔔 提醒设置" });

    new Setting(containerEl)
      .setName("提醒合并窗口")
      .setDesc("相同信号在多长时间内只提醒一次")
      .addDropdown((d) => {
        d.addOption("1m", "1 分钟");
        d.addOption("5m", "5 分钟");
        d.addOption("1h", "1 小时");
        d.setValue(this.plugin.settings.notifications.mergeWindow);
        d.onChange((v: "1m" | "5m" | "1h") => {
          this.plugin.settings.notifications.mergeWindow = v;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("提醒风险级别")
      .setDesc("哪些风险级别的策略触发提醒")
      .addDropdown((d) => {
        d.addOption("all", "全部 (低/中/高)");
        d.addOption("low", "仅低风险");
        d.addOption("medium", "仅中风险");
        d.addOption("high", "仅高风险");
        d.setValue(
          this.plugin.settings.notifications.riskLevels.length === 3 ? "all" :
          this.plugin.settings.notifications.riskLevels[0] || "all"
        );
        d.onChange((v) => {
          if (v === "all") {
            this.plugin.settings.notifications.riskLevels = ["low", "medium", "high"];
          } else {
            this.plugin.settings.notifications.riskLevels = [v as "low" | "medium" | "high"];
          }
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("启用声音提醒")
      .setDesc("提醒时播放提示音")
      .addToggle((t) => {
        t.setValue(this.plugin.settings.notifications.enableSound);
        t.onChange((v) => {
          this.plugin.settings.notifications.enableSound = v;
          void this.plugin.saveSettings();
        });
      });

    // ============================================================
    // Watched Symbols
    // ============================================================
    containerEl.createEl("h3", { text: "📊 监控品种设置" });
    
    const symbolsDesc = containerEl.createEl("p", { 
      text: "当前监控的品种列表。可在市场扫描仪中添加或删除。",
      cls: "setting-item-description" 
    });
    symbolsDesc.style.marginBottom = "1em";

    // Display current watched symbols
    const symbolsContainer = containerEl.createDiv("watched-symbols-list");
    symbolsContainer.style.marginBottom = "1em";
    
    this.plugin.settings.watchedSymbols
      .filter(s => s.isActive)
      .forEach((symbol) => {
        const symbolEl = symbolsContainer.createDiv("symbol-item");
        symbolEl.style.display = "flex";
        symbolEl.style.alignItems = "center";
        symbolEl.style.gap = "8px";
        symbolEl.style.padding = "4px 0";
        
        const categoryEmoji = {
          crypto: "💰",
          stock: "📈",
          forex: "💱",
          future: "📊"
        }[symbol.category];
        
        symbolEl.createSpan({ text: `${categoryEmoji} ${symbol.id} (${symbol.name}) - ${symbol.defaultInterval}` });
      });

    new Setting(containerEl)
      .setName("管理品种")
      .setDesc("在市场扫描仪中添加或删除监控品种")
      .addButton((b) => {
        b.setButtonText("打开市场扫描仪");
        b.onClick(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.app as any).commands.executeCommandById("al-brooks-console:open-market-scanner");
        });
      });
  }
}

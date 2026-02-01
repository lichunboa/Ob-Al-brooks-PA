/**
 * Config Editor Modal
 * 后端配置编辑器
 */
import * as React from "react";
import { Modal, App, Setting, Notice } from "obsidian";
import { ConfigService, Setting as ConfigSetting } from "../../services/config";

export class ConfigEditorModal extends Modal {
  private configService: ConfigService;
  private settings: ConfigSetting[] = [];
  private isLoading = true;
  private selectedCategory = "all";
  private editedValues: Map<string, any> = new Map();

  constructor(app: App, baseUrl: string) {
    super(app);
    this.configService = new ConfigService(baseUrl);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("config-editor-modal");
    contentEl.createEl("h2", { text: "⚙️ 后端配置" });

    contentEl.createEl("div", {
      text: "加载中...",
      cls: "loading-text",
    });

    await this.loadSettings();
  }

  async loadSettings() {
    try {
      this.settings = await this.configService.getSettings();
      this.isLoading = false;
      this.render();
    } catch (error) {
      this.isLoading = false;
      this.renderError(error.message);
    }
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "⚙️ 后端配置" });

    // 分类筛选
    const categories = [...new Set(this.settings.map((s) => s.category))];
    const filterEl = contentEl.createEl("div", {
      cls: "category-filter",
    });
    filterEl.createEl("span", { text: "分类: " });

    const allBtn = filterEl.createEl("button", {
      text: "全部",
      cls: this.selectedCategory === "all" ? "active" : "",
    });
    allBtn.onclick = () => {
      this.selectedCategory = "all";
      this.render();
    };

    categories.forEach((cat) => {
      const btn = filterEl.createEl("button", {
        text: this.translateCategory(cat),
        cls: this.selectedCategory === cat ? "active" : "",
      });
      btn.onclick = () => {
        this.selectedCategory = cat;
        this.render();
      };
    });

    // 配置列表
    const settingsContainer = contentEl.createEl("div", {
      cls: "settings-list",
    });

    const filteredSettings =
      this.selectedCategory === "all"
        ? this.settings
        : this.settings.filter((s) => s.category === this.selectedCategory);

    if (filteredSettings.length === 0) {
      settingsContainer.createEl("div", {
        text: "暂无配置项",
        cls: "empty-state",
      });
    } else {
      filteredSettings.forEach((setting) => {
        this.renderSettingItem(settingsContainer, setting);
      });
    }

    // 底部按钮
    const footerEl = contentEl.createEl("div", {
      cls: "modal-footer",
    });

    const saveBtn = footerEl.createEl("button", {
      text: "保存更改",
      cls: "mod-cta",
    });
    saveBtn.onclick = () => this.saveChanges();

    const closeBtn = footerEl.createEl("button", {
      text: "关闭",
    });
    closeBtn.onclick = () => this.close();
  }

  renderSettingItem(container: HTMLElement, setting: ConfigSetting) {
    const itemEl = container.createEl("div", {
      cls: "setting-item",
    });

    // 头部
    const headerEl = itemEl.createEl("div", {
      cls: "setting-header",
    });

    headerEl.createEl("span", {
      text: setting.key,
      cls: "setting-key",
    });

    headerEl.createEl("span", {
      text: this.translateCategory(setting.category),
      cls: "category-tag",
    });

    // 描述
    if (setting.description) {
      itemEl.createEl("div", {
        text: setting.description,
        cls: "setting-description",
      });
    }

    // 值编辑器
    const valueEl = itemEl.createEl("div", {
      cls: "setting-value",
    });

    const currentValue =
      this.editedValues.get(`${setting.category}.${setting.key}`) ??
      setting.value;

    if (typeof currentValue === "boolean") {
      // 布尔值用开关
      const toggle = valueEl.createEl("input", {
        type: "checkbox",
        cls: "setting-toggle",
      }) as HTMLInputElement;
      toggle.checked = currentValue;
      toggle.onchange = () => {
        this.editedValues.set(
          `${setting.category}.${setting.key}`,
          toggle.checked
        );
      };
    } else if (typeof currentValue === "number") {
      // 数值用输入框
      const input = valueEl.createEl("input", {
        type: "number",
        value: String(currentValue),
        cls: "setting-input",
      }) as HTMLInputElement;
      input.onchange = () => {
        this.editedValues.set(
          `${setting.category}.${setting.key}`,
          parseFloat(input.value)
        );
      };
    } else if (Array.isArray(currentValue)) {
      // 数组用逗号分隔的文本
      const input = valueEl.createEl("input", {
        type: "text",
        value: currentValue.join(", "),
        cls: "setting-input",
        placeholder: "用逗号分隔多个值",
      }) as HTMLInputElement;
      input.onchange = () => {
        this.editedValues.set(
          `${setting.category}.${setting.key}`,
          input.value.split(",").map((v) => v.trim())
        );
      };
    } else if (typeof currentValue === "object") {
      // 对象用JSON文本区域
      const textarea = valueEl.createEl("textarea", {
        value: JSON.stringify(currentValue, null, 2),
        cls: "setting-textarea",
        rows: 4,
      }) as HTMLTextAreaElement;
      textarea.onchange = () => {
        try {
          this.editedValues.set(
            `${setting.category}.${setting.key}`,
            JSON.parse(textarea.value)
          );
        } catch (e) {
          new Notice("JSON格式错误");
        }
      };
    } else {
      // 其他用文本输入
      const input = valueEl.createEl("input", {
        type: "text",
        value: String(currentValue),
        cls: "setting-input",
      }) as HTMLInputElement;
      input.onchange = () => {
        this.editedValues.set(
          `${setting.category}.${setting.key}`,
          input.value
        );
      };
    }
  }

  async saveChanges() {
    if (this.editedValues.size === 0) {
      new Notice("没有更改需要保存");
      return;
    }

    const updates: Record<string, Record<string, any>> = {};

    this.editedValues.forEach((value, key) => {
      const [category, ...keyParts] = key.split(".");
      const settingKey = keyParts.join(".");

      if (!updates[category]) {
        updates[category] = {};
      }
      updates[category][settingKey] = value;
    });

    try {
      const result = await this.configService.batchUpdateSettings(updates);
      new Notice(`已更新 ${result.updated} 项配置，新建 ${result.created} 项`);
      this.editedValues.clear();
      await this.loadSettings();
    } catch (error) {
      new Notice(`保存失败: ${error.message}`);
    }
  }

  renderError(message: string) {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "⚙️ 后端配置" });

    const errorEl = contentEl.createEl("div", {
      cls: "error-message",
    });
    errorEl.createEl("p", {
      text: "❌ 加载失败",
      cls: "error-title",
    });
    errorEl.createEl("p", {
      text: message,
      cls: "error-details",
    });

    const retryBtn = contentEl.createEl("button", {
      text: "重试",
      cls: "mod-cta",
    });
    retryBtn.onclick = () => this.loadSettings();

    const closeBtn = contentEl.createEl("button", {
      text: "关闭",
    });
    closeBtn.onclick = () => this.close();
  }

  translateCategory(category: string): string {
    const translations: Record<string, string> = {
      system: "系统",
      user: "用户",
      signal: "信号",
      strategy: "策略",
      trading: "交易",
    };
    return translations[category] || category;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

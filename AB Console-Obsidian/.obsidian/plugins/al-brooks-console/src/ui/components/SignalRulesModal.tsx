/**
 * Signal Rules Management Modal
 * 信号规则管理弹窗
 */
import * as React from "react";
import { Modal, App, Setting, Notice } from "obsidian";
import { ConfigService, SignalRule } from "../../services/config";

export class SignalRulesModal extends Modal {
  private configService: ConfigService;
  private rules: SignalRule[] = [];
  private isLoading = true;
  private selectedCategory = "all";

  constructor(app: App, baseUrl: string) {
    super(app);
    this.configService = new ConfigService(baseUrl);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("signal-rules-modal");
    contentEl.createEl("h2", { text: "📡 信号规则配置" });

    // 加载中提示
    contentEl.createEl("div", {
      text: "加载中...",
      cls: "loading-text",
    });

    // 加载数据
    await this.loadRules();
  }

  async loadRules() {
    try {
      this.rules = await this.configService.getSignalRules();
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

    // 标题
    contentEl.createEl("h2", { text: "📡 信号规则配置" });

    // 统计信息
    const enabledCount = this.rules.filter((r) => r.is_enabled).length;
    const statsEl = contentEl.createEl("div", {
      cls: "signal-rules-stats",
    });
    statsEl.createEl("span", {
      text: `总计: ${this.rules.length} 条规则`,
    });
    statsEl.createEl("span", {
      text: ` | 启用: ${enabledCount} 条`,
      cls: "enabled-count",
    });

    // 分类筛选
    const categories = [...new Set(this.rules.map((r) => r.category))];
    const filterEl = contentEl.createEl("div", {
      cls: "category-filter",
    });
    filterEl.createEl("span", { text: "筛选: " });

    // "全部" 按钮
    const allBtn = filterEl.createEl("button", {
      text: "全部",
      cls: this.selectedCategory === "all" ? "active" : "",
    });
    allBtn.onclick = () => {
      this.selectedCategory = "all";
      this.render();
    };

    // 分类按钮
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

    // 规则列表
    const rulesContainer = contentEl.createEl("div", {
      cls: "signal-rules-list",
    });

    const filteredRules =
      this.selectedCategory === "all"
        ? this.rules
        : this.rules.filter((r) => r.category === this.selectedCategory);

    if (filteredRules.length === 0) {
      rulesContainer.createEl("div", {
        text: "暂无规则",
        cls: "empty-state",
      });
      return;
    }

    // 按优先级排序
    filteredRules.sort((a, b) => b.priority - a.priority);

    filteredRules.forEach((rule) => {
      this.renderRuleItem(rulesContainer, rule);
    });

    // 底部按钮
    const footerEl = contentEl.createEl("div", {
      cls: "modal-footer",
    });

    const closeBtn = footerEl.createEl("button", {
      text: "关闭",
      cls: "mod-cta",
    });
    closeBtn.onclick = () => this.close();
  }

  renderRuleItem(container: HTMLElement, rule: SignalRule) {
    const itemEl = container.createEl("div", {
      cls: `signal-rule-item ${rule.is_enabled ? "enabled" : "disabled"}`,
    });

    // 头部：名称和状态
    const headerEl = itemEl.createEl("div", {
      cls: "rule-header",
    });

    const nameEl = headerEl.createEl("div", {
      cls: "rule-name",
    });
    nameEl.createEl("span", {
      text: rule.is_enabled ? "🟢" : "⚪",
      cls: "status-icon",
    });
    nameEl.createEl("span", {
      text: rule.name,
      cls: "name-text",
    });

    // 分类标签
    headerEl.createEl("span", {
      text: this.translateCategory(rule.category),
      cls: "category-tag",
    });

    // 描述
    if (rule.description) {
      itemEl.createEl("div", {
        text: rule.description,
        cls: "rule-description",
      });
    }

    // 详情
    const detailsEl = itemEl.createEl("div", {
      cls: "rule-details",
    });

    // 适用周期
    if (rule.timeframes?.length > 0) {
      detailsEl.createEl("span", {
        text: `⏱️ ${rule.timeframes.join(", ")}`,
        cls: "timeframes",
      });
    }

    // 优先级
    detailsEl.createEl("span", {
      text: `📊 优先级: ${rule.priority}`,
      cls: "priority",
    });

    // 冷却时间
    detailsEl.createEl("span", {
      text: `⏳ 冷却: ${rule.cooldown_seconds}s`,
      cls: "cooldown",
    });

    // 最小强度
    detailsEl.createEl("span", {
      text: `💪 强度: ${(rule.min_strength * 100).toFixed(0)}%`,
      cls: "min-strength",
    });

    // 操作按钮
    const actionsEl = itemEl.createEl("div", {
      cls: "rule-actions",
    });

    const toggleBtn = actionsEl.createEl("button", {
      text: rule.is_enabled ? "禁用" : "启用",
      cls: rule.is_enabled ? "disable-btn" : "enable-btn",
    });
    toggleBtn.onclick = async () => {
      try {
        const newStatus = await this.configService.toggleSignalRule(rule.rule_id);
        rule.is_enabled = newStatus;
        new Notice(`规则 "${rule.name}" 已${newStatus ? "启用" : "禁用"}`);
        this.render();
      } catch (error) {
        new Notice(`操作失败: ${error.message}`);
      }
    };

    // 编辑按钮（简化版，只显示参数）
    const editBtn = actionsEl.createEl("button", {
      text: "编辑",
    });
    editBtn.onclick = () => {
      this.openRuleEditor(rule);
    };
  }

  openRuleEditor(rule: SignalRule) {
    // 简单的参数编辑器
    const modal = new Modal(this.app);
    modal.titleEl.setText(`编辑规则: ${rule.name}`);

    const { contentEl } = modal;

    // 优先级
    new Setting(contentEl)
      .setName("优先级")
      .setDesc("数字越大优先级越高")
      .addSlider((slider) =>
        slider
          .setLimits(0, 200, 10)
          .setValue(rule.priority)
          .onChange(async (value) => {
            rule.priority = value;
          })
      );

    // 冷却时间
    new Setting(contentEl)
      .setName("冷却时间（秒）")
      .setDesc("同一规则再次触发的最小间隔")
      .addText((text) =>
        text
          .setValue(String(rule.cooldown_seconds))
          .onChange(async (value) => {
            rule.cooldown_seconds = parseInt(value) || 300;
          })
      );

    // 最小强度
    new Setting(contentEl)
      .setName("最小信号强度")
      .setDesc("触发信号的最小强度阈值")
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 5)
          .setValue(rule.min_strength * 100)
          .onChange(async (value) => {
            rule.min_strength = value / 100;
          })
      );

    // 适用周期
    new Setting(contentEl)
      .setName("适用周期")
      .setDesc("选择适用的K线周期（逗号分隔）")
      .addText((text) =>
        text.setValue(rule.timeframes.join(", ")).onChange(async (value) => {
          rule.timeframes = value.split(",").map((t) => t.trim());
        })
      );

    // 保存按钮
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("保存")
        .setCta()
        .onClick(async () => {
          try {
            await this.configService.updateSignalRule(rule.rule_id, {
              priority: rule.priority,
              cooldown_seconds: rule.cooldown_seconds,
              min_strength: rule.min_strength,
              timeframes: rule.timeframes,
            });
            new Notice("规则已更新");
            modal.close();
            this.render();
          } catch (error) {
            new Notice(`保存失败: ${error.message}`);
          }
        })
    );

    modal.open();
  }

  renderError(message: string) {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "📡 信号规则配置" });

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
    retryBtn.onclick = () => this.loadRules();

    const closeBtn = contentEl.createEl("button", {
      text: "关闭",
    });
    closeBtn.onclick = () => this.close();
  }

  translateCategory(category: string): string {
    const translations: Record<string, string> = {
      momentum: "动量",
      pattern: "形态",
      trend: "趋势",
      volatility: "波动率",
      volume: "成交量",
      futures: "期货",
    };
    return translations[category] || category;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

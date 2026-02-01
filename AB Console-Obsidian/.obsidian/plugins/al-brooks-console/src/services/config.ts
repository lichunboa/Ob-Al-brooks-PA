/**
 * Config Service
 * 与后端配置API交互
 */

export interface SignalRule {
  id: number;
  rule_id: string;
  name: string;
  category: string;
  description?: string;
  conditions: Record<string, any>;
  parameters: Record<string, any>;
  is_enabled: boolean;
  priority: number;
  cooldown_seconds: number;
  min_strength: number;
  timeframes: string[];
  symbols?: string[];
  exclude_symbols?: string[];
  created_at: string;
  updated_at: string;
}

export interface Setting {
  id: number;
  category: string;
  key: string;
  value: any;
  description?: string;
  updated_at: string;
}

export class ConfigService {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:8089/api/v1") {
    this.baseUrl = baseUrl;
  }

  /**
   * 获取信号规则列表
   */
  async getSignalRules(
    category?: string,
    isEnabled?: boolean
  ): Promise<SignalRule[]> {
    const params = new URLSearchParams();
    if (category) params.append("category", category);
    if (isEnabled !== undefined) params.append("is_enabled", String(isEnabled));

    const response = await fetch(
      `${this.baseUrl}/config/signal-rules?${params}`,
      { signal: undefined }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch signal rules: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 切换信号规则启用状态
   */
  async toggleSignalRule(ruleId: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/config/signal-rules/${ruleId}/toggle`,
      { method: "POST", signal: undefined }
    );

    if (!response.ok) {
      throw new Error(`Failed to toggle signal rule: ${response.statusText}`);
    }

    const data = await response.json();
    return data.is_enabled;
  }

  /**
   * 更新信号规则
   */
  async updateSignalRule(
    ruleId: string,
    updates: Partial<SignalRule>
  ): Promise<SignalRule> {
    const response = await fetch(
      `${this.baseUrl}/config/signal-rules/${ruleId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        signal: undefined,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update signal rule: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 获取信号规则分类统计
   */
  async getSignalRuleCategories(): Promise<
    { category: string; count: number; enabled_count: number }[]
  > {
    const response = await fetch(
      `${this.baseUrl}/config/signal-rules/categories`,
      { signal: undefined }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch categories: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 获取配置列表
   */
  async getSettings(category?: string): Promise<Setting[]> {
    const params = category ? `?category=${category}` : "";
    const response = await fetch(
      `${this.baseUrl}/config/settings${params}`,
      { signal: undefined }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch settings: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 获取单个配置
   */
  async getSetting(category: string, key: string): Promise<Setting | null> {
    const response = await fetch(
      `${this.baseUrl}/config/settings/${category}/${key}`,
      { signal: undefined }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch setting: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 更新配置
   */
  async updateSetting(
    category: string,
    key: string,
    value: any
  ): Promise<Setting> {
    const response = await fetch(
      `${this.baseUrl}/config/settings/${category}/${key}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        signal: undefined,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update setting: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 批量更新配置
   */
  async batchUpdateSettings(
    settings: Record<string, Record<string, any>>
  ): Promise<{ updated: number; created: number }> {
    const response = await fetch(
      `${this.baseUrl}/config/settings/batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
        signal: undefined,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to batch update settings: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 同步配置（从插件到后端）
   */
  async syncConfig(
    userId: string,
    settings: Record<string, any>
  ): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/config/sync/${userId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        signal: undefined,
      }
    );

    return response.ok;
  }
}

// 单例实例
let configServiceInstance: ConfigService | null = null;

export function getConfigService(baseUrl?: string): ConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new ConfigService(baseUrl);
  }
  return configServiceInstance;
}

export function resetConfigService(): void {
  configServiceInstance = null;
}

/**
 * Backend API Client
 *
 * Connects to the AL Brooks Trading Console backend services
 * (Based on TradeCat architecture)
 */

export interface BackendConfig {
  baseUrl: string;
  apiToken?: string;
  timeout?: number;
  // AI API 配置 (Gemini 反代)
  aiApiEndpoint?: string;
  aiApiKey?: string;
  aiModel?: string;
  // Telegram 推送配置
  telegramBotToken?: string;
  telegramChatId?: string;
}

export interface CandleData {
  symbol: string;
  interval: string;
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume: number;
}

export interface IndicatorData {
  symbol: string;
  interval: string;
  timestamp: string;
  rsi_14?: number;
  macd?: number;
  macd_signal?: number;
  macd_hist?: number;
  bb_upper?: number;
  bb_middle?: number;
  bb_lower?: number;
  sma_20?: number;
  ema_20?: number;
  atr_14?: number;
}

export interface SignalData {
  symbol: string;
  signal_name: string;
  direction: "BUY" | "SELL" | "ALERT";
  strength: number;
  timestamp: string;
  message: string;
}

export interface MarketCycleData {
  symbol: string;
  interval: string;
  cycle: "strong_trend" | "weak_trend" | "trading_range" | "breakout";
  always_in: "long" | "short" | "neutral";
  confidence: number;
  timestamp: string;
}

export interface PatternData {
  symbol: string;
  interval: string;
  patterns: Array<{
    name: string;
    type: string;
    confidence: number;
    bar_index: number;
  }>;
  timestamp: string;
}

export interface AnalysisRequest {
  symbol: string;
  prompt?: string;
  interval?: string;
}

export interface AnalysisResponse {
  symbol: string;
  analysis: string;
  timestamp: string;
  model: string;
}

export interface HealthStatus {
  status: string;
  timestamp: string;
  version: string;
}

export interface SystemStatus {
  status: string;
  services: {
    database: string;
    data_service: string;
    trading_service: string;
    signal_service: string;
    ai_service: string;
  };
  timestamp: string;
}

/**
 * Backend API Client Class
 */
export class BackendClient {
  private config: BackendConfig;

  constructor(config: BackendConfig) {
    this.config = {
      baseUrl: config.baseUrl || "http://localhost:8088",
      apiToken: config.apiToken,
      timeout: config.timeout || 30000,
      aiApiEndpoint: config.aiApiEndpoint || "http://127.0.0.1:8045",
      aiApiKey: config.aiApiKey || "",
      aiModel: config.aiModel || "gemini-3-pro-high",
      telegramBotToken: config.telegramBotToken || "",
      telegramChatId: config.telegramChatId || "",
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BackendConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): BackendConfig {
    return { ...this.config };
  }

  /**
   * Make HTTP request to backend
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.config.apiToken) {
      headers["X-API-Token"] = this.config.apiToken;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          error.detail || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === "AbortError") {
        throw new Error("Request timeout");
      }
      throw error;
    }
  }

  // ============================================================
  // Health & Status
  // ============================================================

  /**
   * Check backend health
   */
  async checkHealth(): Promise<HealthStatus> {
    return this.request<HealthStatus>("/health");
  }

  /**
   * Get system status
   */
  async getStatus(): Promise<SystemStatus> {
    return this.request<SystemStatus>("/api/v1/status");
  }

  /**
   * Check if backend is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      return health.status === "healthy";
    } catch {
      return false;
    }
  }

  // ============================================================
  // Market Data
  // ============================================================

  /**
   * Get K-line/candle data
   */
  async getCandles(
    symbol: string,
    interval = "1h",
    limit = 100
  ): Promise<CandleData[]> {
    return this.request<CandleData[]>(
      `/api/v1/candles/${symbol}?interval=${interval}&limit=${limit}`
    );
  }

  /**
   * Get available symbols
   */
  async getSymbols(): Promise<{ symbols: string[]; count: number }> {
    return this.request<{ symbols: string[]; count: number }>(
      "/api/v1/symbols"
    );
  }

  // ============================================================
  // Indicators
  // ============================================================

  /**
   * Get technical indicators
   */
  async getIndicators(
    symbol: string,
    interval = "1h",
    limit = 100
  ): Promise<IndicatorData[]> {
    return this.request<IndicatorData[]>(
      `/api/v1/indicators/${symbol}?interval=${interval}&limit=${limit}`
    );
  }

  /**
   * Get latest indicators for a symbol
   */
  async getLatestIndicators(
    symbol: string,
    interval = "1h"
  ): Promise<{
    symbol: string;
    interval: string;
    timestamp: string;
    indicators: Record<string, number>;
  }> {
    return this.request(
      `/api/v1/indicators/${symbol}/latest?interval=${interval}`
    );
  }

  // ============================================================
  // Signals
  // ============================================================

  /**
   * Get signals for a symbol
   */
  async getSignals(symbol: string, limit = 50): Promise<SignalData[]> {
    return this.request<SignalData[]>(
      `/api/v1/signals/${symbol}?limit=${limit}`
    );
  }

  /**
   * Get all recent signals
   */
  async getAllSignals(
    limit = 100,
    direction?: string
  ): Promise<{ signals: SignalData[]; count: number }> {
    let url = `/api/v1/signals?limit=${limit}`;
    if (direction) {
      url += `&direction=${direction}`;
    }
    return this.request(url);
  }

  // ============================================================
  // AI Analysis
  // ============================================================

  /**
   * Get AI market analysis
   */
  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    return this.request<AnalysisResponse>("/api/v1/analysis", {
      method: "POST",
      body: JSON.stringify({
        symbol: request.symbol,
        prompt: request.prompt || "market_analysis",
        interval: request.interval || "1h",
      }),
    });
  }

  /**
   * Get available analysis prompts
   */
  async getAnalysisPrompts(): Promise<{
    prompts: Array<{ id: string; name: string; description: string }>;
  }> {
    return this.request("/api/v1/analysis/prompts");
  }

  // ============================================================
  // Al Brooks Specific
  // ============================================================

  /**
   * Get market cycle classification (Al Brooks)
   */
  async getMarketCycle(
    symbol: string,
    interval = "5m"
  ): Promise<MarketCycleData> {
    return this.request<MarketCycleData>(
      `/api/v1/al-brooks/market-cycle?symbol=${symbol}&interval=${interval}`
    );
  }

  /**
   * Get pattern detections (Al Brooks)
   */
  async getPatterns(
    symbol: string,
    interval = "5m",
    limit = 10
  ): Promise<PatternData> {
    return this.request<PatternData>(
      `/api/v1/al-brooks/patterns?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
  }

  // ============================================================
  // Direct AI Call (OpenAI Compatible API)
  // ============================================================

  /**
   * Call AI via OpenAI-compatible proxy (supports Gemini, Claude, GPT, etc.)
   * @param prompt User prompt
   * @param systemPrompt Optional system prompt
   * @returns AI response text
   */
  async callAI(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.config.aiApiKey) {
      throw new Error("AI API Key 未配置。请在设置中填写。");
    }
    if (!this.config.aiApiEndpoint) {
      throw new Error("AI API Endpoint 未配置。请在设置中填写。");
    }

    // OpenAI-compatible API format (used by most proxies)
    const url = `${this.config.aiApiEndpoint}/v1/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const body = {
      model: this.config.aiModel,
      messages,
      temperature: 0.7,
      max_tokens: 8192,
      stream: false,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 分钟超时

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.aiApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API 错误 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error("AI 返回空响应");
      }

      return text;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === "AbortError") {
        throw new Error("AI 请求超时 (120s)");
      }
      throw error;
    }
  }

  /**
   * Test AI connection
   */
  async testAIConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callAI("请简短回复：你好！");
      return {
        success: true,
        message: `连接成功！AI 回复: ${response.slice(0, 50)}...`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================
  // Telegram 推送
  // ============================================================

  /**
   * Send message to Telegram
   * @param message Message text (supports Markdown)
   * @param parseMode Parse mode: "Markdown" | "HTML" | undefined
   */
  async sendTelegramMessage(
    message: string,
    parseMode: "Markdown" | "HTML" | undefined = "Markdown"
  ): Promise<{ success: boolean; message: string }> {
    if (!this.config.telegramBotToken) {
      throw new Error("Telegram Bot Token 未配置");
    }
    if (!this.config.telegramChatId) {
      throw new Error("Telegram Chat ID 未配置");
    }

    const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;

    const body: Record<string, string | undefined> = {
      chat_id: this.config.telegramChatId,
      text: message,
    };

    if (parseMode) {
      body.parse_mode = parseMode;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.description || `Telegram API 错误 (${response.status})`
        );
      }

      return {
        success: true,
        message: `消息已发送 (message_id: ${data.result.message_id})`,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === "AbortError") {
        throw new Error("Telegram 请求超时");
      }
      throw error;
    }
  }

  /**
   * Test Telegram connection
   */
  async testTelegramConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const timestamp = new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
      });
      const testMessage = `🦁 *AL Brooks 交易控制台*\n\n✅ 连接测试成功！\n\n🕐 时间: ${timestamp}`;
      return await this.sendTelegramMessage(testMessage);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send trading signal to Telegram
   */
  async sendSignalToTelegram(signal: SignalData): Promise<{ success: boolean; message: string }> {
    const directionEmoji = signal.direction === "BUY" ? "🟢" : signal.direction === "SELL" ? "🔴" : "🟡";
    const strengthBar = "█".repeat(Math.round(signal.strength * 5)) + "░".repeat(5 - Math.round(signal.strength * 5));

    const message = `
${directionEmoji} *${signal.signal_name}*

📊 *品种*: \`${signal.symbol}\`
📈 *方向*: ${signal.direction}
💪 *强度*: ${strengthBar} (${(signal.strength * 100).toFixed(0)}%)

💬 ${signal.message}

🕐 ${signal.timestamp}
`.trim();

    return await this.sendTelegramMessage(message);
  }

  /**
   * Send market cycle update to Telegram
   */
  async sendMarketCycleToTelegram(cycle: MarketCycleData): Promise<{ success: boolean; message: string }> {
    const cycleEmoji: Record<string, string> = {
      strong_trend: "🚀",
      weak_trend: "📊",
      trading_range: "📦",
      breakout: "💥",
    };

    const alwaysInEmoji: Record<string, string> = {
      long: "🟢",
      short: "🔴",
      neutral: "⚪",
    };

    const cycleNames: Record<string, string> = {
      strong_trend: "强趋势",
      weak_trend: "弱趋势",
      trading_range: "交易区间",
      breakout: "突破",
    };

    const confidenceBar = "█".repeat(Math.round(cycle.confidence * 10)) + "░".repeat(10 - Math.round(cycle.confidence * 10));

    const message = `
${cycleEmoji[cycle.cycle] || "📊"} *市场周期更新*

📊 *品种*: \`${cycle.symbol}\` (${cycle.interval})
🔄 *周期*: ${cycleNames[cycle.cycle] || cycle.cycle}
${alwaysInEmoji[cycle.always_in] || "⚪"} *Always In*: ${cycle.always_in.toUpperCase()}
📈 *置信度*: ${confidenceBar} (${(cycle.confidence * 100).toFixed(0)}%)

🕐 ${cycle.timestamp}
`.trim();

    return await this.sendTelegramMessage(message);
  }

  /**
   * Send custom notification to Telegram
   */
  async sendNotificationToTelegram(
    title: string,
    content: string,
    type: "info" | "success" | "warning" | "error" = "info"
  ): Promise<{ success: boolean; message: string }> {
    const typeEmoji: Record<string, string> = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
    };

    const timestamp = new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
    });

    const message = `
${typeEmoji[type]} *${title}*

${content}

🕐 ${timestamp}
`.trim();

    return await this.sendTelegramMessage(message);
  }
}

/**
 * Create a singleton instance with default config
 */
let defaultClient: BackendClient | null = null;

export function getBackendClient(config?: Partial<BackendConfig>): BackendClient {
  if (!defaultClient || config) {
    defaultClient = new BackendClient({
      baseUrl: config?.baseUrl || "http://localhost:8088",
      apiToken: config?.apiToken,
      timeout: config?.timeout,
      aiApiEndpoint: config?.aiApiEndpoint,
      aiApiKey: config?.aiApiKey,
      aiModel: config?.aiModel,
      telegramBotToken: config?.telegramBotToken,
      telegramChatId: config?.telegramChatId,
    });
  }
  return defaultClient;
}

// ============================================================
// Backend Service Control (Docker/Direct)
// ============================================================

export interface ServiceStatus {
  running: boolean;
  version?: string;
  uptime?: string;
  services?: Record<string, string>;
}

export interface SyncStatus {
  last_sync?: string;
  sync_count: number;
  strategies_count: number;
  trades_count: number;
}

/**
 * Backend Service Controller
 * Manages starting/stopping backend services via shell commands
 */
export class BackendServiceController {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    // Try to detect project root
    this.projectRoot = projectRoot || this.detectProjectRoot();
  }

  private detectProjectRoot(): string {
    // Default to common locations
    const possiblePaths = [
      "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA",
      "/home/user/Al-brooks-PA",
      "/opt/al-brooks-console",
    ];
    
    // In Obsidian plugin context, we need to access via Obsidian API
    // This will be set by the plugin
    return possiblePaths[0];
  }

  setProjectRoot(root: string): void {
    this.projectRoot = root;
  }

  /**
   * Check if backend is running via HTTP health check
   */
  async checkStatus(): Promise<ServiceStatus> {
    try {
      const client = getBackendClient();
      const health = await client.checkHealth();
      const status = await client.getStatus();
      
      return {
        running: true,
        version: health.version,
        services: status.services,
      };
    } catch {
      return {
        running: false,
      };
    }
  }

  /**
   * Get Obsidian sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const response = await fetch(`${getBackendClient().getConfig().baseUrl}/api/v1/sync/status`);
      if (!response.ok) throw new Error("Failed to fetch sync status");
      return await response.json();
    } catch {
      return {
        sync_count: 0,
        strategies_count: 0,
        trades_count: 0,
      };
    }
  }

  /**
   * Trigger manual sync
   */
  async triggerSync(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(
        `${getBackendClient().getConfig().baseUrl}/api/v1/strategies/sync`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error("Sync failed");
      
      const result = await response.json();
      return {
        success: true,
        message: `同步完成：${result.synced_strategies} 个策略, ${result.synced_trades} 条交易记录`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "同步失败",
      };
    }
  }

  /**
   * Get shell commands for user reference
   */
  getShellCommands(): {
    start: string;
    stop: string;
    startBackend: string;
    logs: string;
  } {
    const backendPath = `${this.projectRoot}/AB Console-Backend`;
    
    return {
      start: `cd "${this.projectRoot}" && ./start-all.sh`,
      stop: `cd "${this.projectRoot}" && ./stop-all.sh`,
      startBackend: `cd "${backendPath}" && docker-compose up -d`,
      logs: `cd "${backendPath}" && docker-compose logs -f`,
    };
  }

  /**
   * Get access URLs
   */
  getAccessUrls(): {
    webDashboard: string;
    apiGateway: string;
    health: string;
  } {
    return {
      webDashboard: "http://localhost:3000",
      apiGateway: "http://localhost:8088",
      health: "http://localhost:8088/health",
    };
  }
}

// Export singleton controller
export const serviceController = new BackendServiceController();

/**
 * Reset the default client (useful for testing or config changes)
 */
export function resetBackendClient(): void {
  defaultClient = null;
}

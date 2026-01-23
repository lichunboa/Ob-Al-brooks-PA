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
    };
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
    });
  }
  return defaultClient;
}

/**
 * Reset the default client (useful for testing or config changes)
 */
export function resetBackendClient(): void {
  defaultClient = null;
}

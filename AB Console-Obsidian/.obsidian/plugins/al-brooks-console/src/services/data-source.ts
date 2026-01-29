/**
 * Data Source Management Service
 * Handles different data sources (Binance, Yahoo Finance, etc.)
 */

export type DataSource = "BINANCE" | "YAHOO" | "ALPHA_VANTAGE" | "POLYGON";

export interface DataSourceConfig {
  name: string;
  supportsRealtime: boolean;
  supportsHistorical: boolean;
  delay: "realtime" | "delayed" | "end_of_day";
  rateLimit: string;
  notes: string;
}

export const DATA_SOURCES: Record<DataSource, DataSourceConfig> = {
  BINANCE: {
    name: "Binance",
    supportsRealtime: true,
    supportsHistorical: true,
    delay: "realtime",
    rateLimit: "1200 req/min",
    notes: "加密货币和稳定币对，数据实时",
  },
  YAHOO: {
    name: "Yahoo Finance",
    supportsRealtime: false,
    supportsHistorical: true,
    delay: "delayed",
    rateLimit: "2000 req/hour",
    notes: "股票、期货、外汇，数据延迟15-20分钟",
  },
  ALPHA_VANTAGE: {
    name: "Alpha Vantage",
    supportsRealtime: false,
    supportsHistorical: true,
    delay: "delayed",
    rateLimit: "5 req/min (free)",
    notes: "股票、外汇、加密货币，免费版限制严格",
  },
  POLYGON: {
    name: "Polygon.io",
    supportsRealtime: true,
    supportsHistorical: true,
    delay: "realtime",
    rateLimit: "API key required",
    notes: "美股实时数据，需付费订阅",
  },
};

/**
 * Format symbol for specific data source
 */
export function formatSymbolForSource(symbol: string, source: DataSource): string {
  switch (source) {
    case "YAHOO":
      // Yahoo Finance uses special suffixes
      if (symbol.includes("/")) {
        // Forex pairs like EUR/USD -> EURUSD=X
        return symbol.replace("/", "") + "=X";
      }
      return symbol;
    case "BINANCE":
      // Binance uses USDT pairs
      if (!symbol.endsWith("USDT") && !symbol.includes("USDT")) {
        return symbol + "USDT";
      }
      return symbol;
    default:
      return symbol;
  }
}

/**
 * Parse Yahoo Finance symbol to display format
 */
export function parseYahooSymbol(ticker: string): { base: string; quote?: string } {
  // Forex: EURUSD=X -> EUR/USD
  if (ticker.endsWith("=X")) {
    const pair = ticker.replace("=X", "");
    if (pair.length === 6) {
      return { base: pair.slice(0, 3), quote: pair.slice(3) };
    }
    return { base: pair };
  }
  
  // Futures: ES=F -> ES
  if (ticker.endsWith("=F")) {
    return { base: ticker.replace("=F", "") };
  }
  
  // Stocks: AAPL -> AAPL
  return { base: ticker };
}

/**
 * Get display name for symbol
 */
export function getSymbolDisplayName(symbol: string, category: string): string {
  const knownNames: Record<string, string> = {
    BTCUSDT: "Bitcoin",
    ETHUSDT: "Ethereum",
    SOLUSDT: "Solana",
    "ES=F": "E-mini S&P 500",
    "NQ=F": "E-mini Nasdaq",
    "EURUSD=X": "EUR/USD",
    "GBPUSD=X": "GBP/USD",
    "USDJPY=X": "USD/JPY",
    "GC=F": "Gold",
  };
  
  return knownNames[symbol] || symbol;
}

/**
 * Check if symbol is available on given data source
 */
export function isSymbolAvailableOnSource(symbol: string, source: DataSource): boolean {
  // For now, assume all symbols are available
  // In production, this would check against a whitelist or API
  return true;
}

/**
 * Get recommended interval for symbol category
 */
export function getRecommendedInterval(category: string): string {
  const intervals: Record<string, string> = {
    crypto: "5m",
    stock: "15m",
    forex: "15m",
    future: "5m",
  };
  return intervals[category] || "1h";
}

/**
 * Estimate data delay for a symbol based on its data source
 */
export function getExpectedDelay(symbol: string, source: DataSource): string {
  const config = DATA_SOURCES[source];
  if (config.delay === "realtime") {
    return "实时 (<1s)";
  } else if (config.delay === "delayed") {
    return "延迟 (~15min)";
  } else {
    return "日终更新";
  }
}

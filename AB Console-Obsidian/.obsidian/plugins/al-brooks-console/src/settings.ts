import { DailyJournal } from "./types/journal";
import { DailyPlan } from "./types/plan";

/**
 * Backend service configuration
 */
export interface BackendSettings {
  /** Whether backend integration is enabled */
  enabled: boolean;
  /** Backend API base URL */
  baseUrl: string;
  /** Optional API token for authentication */
  apiToken: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Auto-refresh interval in seconds (0 = disabled) */
  autoRefreshInterval: number;
  /** Default symbol for market data */
  defaultSymbol: string;
  /** Default interval for candle data */
  defaultInterval: string;
}

/**
 * AI service configuration
 */
export interface AISettings {
  /** AI API endpoint (Gemini proxy) */
  apiEndpoint: string;
  /** AI API key */
  apiKey: string;
  /** AI model name */
  model: string;
}

/**
 * Telegram notification configuration
 */
export interface TelegramSettings {
  /** Telegram Bot Token */
  botToken: string;
  /** Telegram Chat ID */
  chatId: string;
  /** Enable desktop notifications */
  enableDesktopNotifications: boolean;
  /** Enable Telegram push notifications */
  enableTelegramPush: boolean;
}

/**
 * Symbol (trading pair) configuration
 */
export interface SymbolConfig {
  /** Symbol ID (display name) */
  id: string;
  /** Backend ticker symbol */
  ticker: string;
  /** Full name */
  name: string;
  /** Category: crypto, stock, forex, future */
  category: "crypto" | "stock" | "forex" | "future";
  /** Data exchange/source */
  exchange: string;
  /** Default interval for this symbol */
  defaultInterval: string;
  /** Whether this symbol is enabled for monitoring */
  isActive: boolean;
}

/**
 * Notification settings
 */
export interface NotificationSettings {
  /** Alert merge window: 1m, 5m, 1h */
  mergeWindow: "1m" | "5m" | "1h";
  /** Strategy risk levels to alert: low, medium, high */
  riskLevels: ("low" | "medium" | "high")[];
  /** Enable sound alerts */
  enableSound: boolean;
}

export interface AlBrooksConsoleSettings {
  /** How many upcoming lessons to show in the Course section ("recommendation window"). */
  courseRecommendationWindow: number;

  /** Count a card as due if dueDate <= today + thresholdDays. */
  srsDueThresholdDays: number;

  /** How many random quiz items to show in Memory. */
  srsRandomQuizCount: number;

  /** Stored Journal Entries */
  journalLogs: DailyJournal[];

  /** Stored Trading Plans */
  tradingPlans: DailyPlan[];

  /** Backend service configuration */
  backend: BackendSettings;

  /** AI service configuration */
  ai: AISettings;

  /** Telegram notification configuration */
  telegram: TelegramSettings;

  /** Watched symbols configuration */
  watchedSymbols: SymbolConfig[];

  /** Notification settings */
  notifications: NotificationSettings;
}

export const DEFAULT_BACKEND_SETTINGS: BackendSettings = {
  enabled: true,  // 默认启用
  baseUrl: "http://localhost:8088",
  apiToken: "",
  timeout: 30000,
  autoRefreshInterval: 5,
  defaultSymbol: "BTCUSDT",
  defaultInterval: "5m",
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  apiEndpoint: "http://127.0.0.1:8045",
  apiKey: "",
  model: "gemini-3-pro-high",
};

export const DEFAULT_TELEGRAM_SETTINGS: TelegramSettings = {
  botToken: "",
  chatId: "",
  enableDesktopNotifications: true,
  enableTelegramPush: false,
};

export const DEFAULT_WATCHED_SYMBOLS: SymbolConfig[] = [
  // Crypto - Binance
  { id: "BTC", ticker: "BTCUSDT", name: "Bitcoin", category: "crypto", exchange: "BINANCE", defaultInterval: "5m", isActive: true },
  { id: "ETH", ticker: "ETHUSDT", name: "Ethereum", category: "crypto", exchange: "BINANCE", defaultInterval: "5m", isActive: true },
  { id: "SOL", ticker: "SOLUSDT", name: "Solana", category: "crypto", exchange: "BINANCE", defaultInterval: "15m", isActive: true },
  
  // Futures - Yahoo Finance
  { id: "ES", ticker: "ES=F", name: "E-mini S&P 500", category: "future", exchange: "YAHOO", defaultInterval: "5m", isActive: true },
  { id: "NQ", ticker: "NQ=F", name: "E-mini Nasdaq", category: "future", exchange: "YAHOO", defaultInterval: "5m", isActive: true },
  
  // Stocks - Yahoo Finance
  { id: "NVDA", ticker: "NVDA", name: "NVIDIA", category: "stock", exchange: "YAHOO", defaultInterval: "15m", isActive: true },
  { id: "AAPL", ticker: "AAPL", name: "Apple", category: "stock", exchange: "YAHOO", defaultInterval: "15m", isActive: true },
  
  // Forex - Yahoo Finance (using their ticker format)
  { id: "EURUSD", ticker: "EURUSD=X", name: "EUR/USD", category: "forex", exchange: "YAHOO", defaultInterval: "15m", isActive: true },
  { id: "GBPUSD", ticker: "GBPUSD=X", name: "GBP/USD", category: "forex", exchange: "YAHOO", defaultInterval: "15m", isActive: true },
  { id: "USDJPY", ticker: "USDJPY=X", name: "USD/JPY", category: "forex", exchange: "YAHOO", defaultInterval: "15m", isActive: true },
  { id: "XAUUSD", ticker: "GC=F", name: "Gold", category: "future", exchange: "YAHOO", defaultInterval: "1h", isActive: true },
];

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  mergeWindow: "5m",
  riskLevels: ["low", "medium", "high"],
  enableSound: true,
};

export const DEFAULT_SETTINGS: AlBrooksConsoleSettings = {
  courseRecommendationWindow: 3,
  srsDueThresholdDays: 0,
  srsRandomQuizCount: 5,
  journalLogs: [],
  tradingPlans: [],
  backend: DEFAULT_BACKEND_SETTINGS,
  ai: DEFAULT_AI_SETTINGS,
  telegram: DEFAULT_TELEGRAM_SETTINGS,
  watchedSymbols: DEFAULT_WATCHED_SYMBOLS,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
};

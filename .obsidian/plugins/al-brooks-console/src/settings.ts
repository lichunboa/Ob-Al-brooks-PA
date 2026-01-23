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
}

export const DEFAULT_BACKEND_SETTINGS: BackendSettings = {
  enabled: false,
  baseUrl: "http://localhost:8088",
  apiToken: "",
  timeout: 30000,
  autoRefreshInterval: 0,
  defaultSymbol: "BTCUSDT",
  defaultInterval: "5m",
};

export const DEFAULT_SETTINGS: AlBrooksConsoleSettings = {
  courseRecommendationWindow: 3,
  srsDueThresholdDays: 0,
  srsRandomQuizCount: 5,
  journalLogs: [],
  tradingPlans: [],
  backend: DEFAULT_BACKEND_SETTINGS,
};

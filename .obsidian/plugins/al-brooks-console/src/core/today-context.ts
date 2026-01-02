import type { Unsubscribe } from "./trade-index";

export interface TodayContext {
  initialize(): Promise<void>;
  getTodayMarketCycle(): string | undefined;
  onChanged?(handler: () => void): Unsubscribe;
  dispose(): void;
}

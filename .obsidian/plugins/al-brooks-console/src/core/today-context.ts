import type { Unsubscribe } from "./trade-index";

export interface TodayContext {
  initialize(): Promise<void>;
  getTodayMarketCycle(): string | undefined;
  openTodayNote?(): Promise<void>;
  onChanged?(handler: () => void): Unsubscribe;
  dispose(): void;
}

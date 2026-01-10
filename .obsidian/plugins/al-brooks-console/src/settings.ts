import { DailyJournal } from "./types/journal";
import { DailyPlan } from "./types/plan";

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
}

export const DEFAULT_SETTINGS: AlBrooksConsoleSettings = {
  courseRecommendationWindow: 3,
  srsDueThresholdDays: 0,
  srsRandomQuizCount: 5,
  journalLogs: [],
  tradingPlans: [],
};

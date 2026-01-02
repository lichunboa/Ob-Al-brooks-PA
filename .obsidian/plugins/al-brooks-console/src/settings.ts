export interface AlBrooksConsoleSettings {
	/** How many upcoming lessons to show in the Course section ("recommendation window"). */
	courseRecommendationWindow: number;

	/** Count a card as due if dueDate <= today + thresholdDays. */
	srsDueThresholdDays: number;

	/** How many random quiz items to show in Memory. */
	srsRandomQuizCount: number;
}

export const DEFAULT_SETTINGS: AlBrooksConsoleSettings = {
	courseRecommendationWindow: 3,
	srsDueThresholdDays: 0,
	srsRandomQuizCount: 5,
};

export interface DailyJournal {
    date: string; // YYYY-MM-DD
    mood: 'disciplined' | 'neutral' | 'tilted' | 'fearful';
    score: number; // 1-10 self rating
    notes: string; // Markdown content
    tags: string[];
}

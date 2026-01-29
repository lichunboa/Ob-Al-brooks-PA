import { App, TFile } from "obsidian";
import { moment } from "obsidian";

export interface SRSCard {
    file: TFile;
    dueDate: string; // YYYY-MM-DD
    interval: number;
    ease: number;
    title: string;
    contextMatch: string; // "Tag" or "Keyword"
}

export class SRSQueryService {
    private app: App;
    private cache: { cards: SRSCard[]; timestamp: number } | null = null;
    private CACHE_TTL = 60 * 1000; // 1 minute

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Get cards that are due (or overdue) and match the given context keywords.
     * @param contextKeywords List of keywords to match (e.g. ["Wedge", "Trend Breakout"])
     */
    async getDueCards(contextKeywords: string[]): Promise<SRSCard[]> {
        const allCards = await this.getAllSRSCards();
        const today = moment().format("YYYY-MM-DD");

        return allCards.filter(card => {
            // 1. Check Due Date
            if (card.dueDate > today) return false;

            // 2. Check Context Match
            // If no context provided, return all due cards (or maybe none? let's return none to avoid noise)
            if (!contextKeywords || contextKeywords.length === 0) return false;

            // Normalize keywords for matching (过滤掉非字符串值)
            const normalizedContext = contextKeywords
                .filter(k => typeof k === 'string' && k.length > 0)
                .map(k => k.toLowerCase());

            if (normalizedContext.length === 0) return false;

            // Check title matches
            const titleLower = card.title.toLowerCase();
            const tagMatch = normalizedContext.some(k => titleLower.includes(k));

            // In a real advanced implementation, we would also check tags in Frontmatter or file content.
            // For now, we rely on the file title or simple content match if we had full content index.
            // But since we scanned files, let's assume we can match title or tags if we parsed them.
            // For MVP: Match Title.

            return tagMatch;
        });
    }

    private async getAllSRSCards(): Promise<SRSCard[]> {
        // Cache Check
        if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_TTL) {
            return this.cache.cards;
        }

        const cards: SRSCard[] = [];
        const files = this.app.vault.getMarkdownFiles();

        // Regex to find <!--SR:!YYYY-MM-DD,I,E-->
        // Matches: <!--SR:!2025-12-22,3,250-->
        const srsRegex = /<!--SR:!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)-->/g;

        for (const file of files) {
            // Optimization: Skip non-relevant folders if possible?
            // For now scan all, but `read` is expensive.
            // Maybe check cache modified time? 
            // For MVP simplicity: read file content. 
            // Note: In large vaults this might be slow on first load.

            // We can check if file has #flashcards tag in cache first?
            const cache = this.app.metadataCache.getFileCache(file);
            const tags = typeof cache?.tags === 'object' ? cache.tags : [];
            // If user uses #flashcards (from data.json settings), we might can filter.
            // But <!--SR:--> can be on any note.

            // Let's rely on cache to read content only if likely needed? 
            // No, regex is in content.
            const content = await this.app.vault.read(file);

            // Reset regex
            srsRegex.lastIndex = 0;
            let match;
            while ((match = srsRegex.exec(content)) !== null) {
                cards.push({
                    file: file,
                    dueDate: match[1],
                    interval: parseInt(match[2]),
                    ease: parseInt(match[3]),
                    title: file.basename,
                    contextMatch: "Content"
                });
                // Assuming one card per file for "Note Review" mode?
                // Or multiple cards? The user's template shows <!--SR:--> at the end.
                // Usually Obsidian SRS plugin supports both.
                // For "Concept Linking", we usually care about the Note itself.
                break; // Take the first SR data found as the Note's schedule
            }
        }

        this.cache = { cards, timestamp: Date.now() };
        return cards;
    }
}

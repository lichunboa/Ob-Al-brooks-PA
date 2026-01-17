import { App, TFile, Notice, moment } from "obsidian";

export class ArchiveService {
    private app: App;
    private readonly ARCHIVE_ROOT = "已归档"; // Configurable? Using hardcoded for now based on requirement.

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Scan for files older than X days that are candidates for archiving.
     * Criteria:
     * 1. Is a Markdown file.
     * 2. Has 'date' frontmatter (valid date).
     * 3. Date is older than threshold.
     * 4. NOT already in '已归档'.
     * 5. Is a Trade Note (check tags/categories).
     */
    async scanForArchive(daysOld: number = 30): Promise<TFile[]> {
        const thresholdDate = moment().subtract(daysOld, 'days').startOf('day');
        const candidates: TFile[] = [];

        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            // Skip if already archived
            if (file.path.startsWith(this.ARCHIVE_ROOT)) continue;

            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter;

            if (!fm) continue;

            // Check if Trade Note
            const isTradeNote = (
                (fm.categories && Array.isArray(fm.categories) && fm.categories.includes("交易日记")) ||
                (fm.tags && (Array.isArray(fm.tags) ? fm.tags : [fm.tags]).some((t: string) => t.includes("PA/Trade")))
            );

            if (!isTradeNote) continue;

            // Check Date
            if (fm.date) {
                const noteDate = moment(fm.date);
                if (noteDate.isValid() && noteDate.isBefore(thresholdDate)) {
                    candidates.push(file);
                }
            }
        }

        return candidates;
    }

    /**
     * Archive list of files to 已归档/{YYYY}/{MM}/{Filename}
     */
    async archiveFiles(files: TFile[]): Promise<void> {
        let count = 0;
        let errors = 0;

        // Ensure Root exists
        if (!(await this.app.vault.adapter.exists(this.ARCHIVE_ROOT))) {
            await this.app.vault.createFolder(this.ARCHIVE_ROOT);
        }

        for (const file of files) {
            try {
                const cache = this.app.metadataCache.getFileCache(file);
                const dateStr = cache?.frontmatter?.date;

                let targetYear = "Unknown";
                let targetMonth = "Unknown";

                if (dateStr) {
                    const d = moment(dateStr);
                    if (d.isValid()) {
                        targetYear = d.format("YYYY");
                        targetMonth = d.format("MM");
                    }
                }

                const yearFolder = `${this.ARCHIVE_ROOT}/${targetYear}`;
                const monthFolder = `${yearFolder}/${targetMonth}`;

                // Create folders if needed
                if (!(await this.app.vault.adapter.exists(yearFolder))) {
                    await this.app.vault.createFolder(yearFolder);
                }
                if (!(await this.app.vault.adapter.exists(monthFolder))) {
                    await this.app.vault.createFolder(monthFolder);
                }

                const newPath = `${monthFolder}/${file.name}`;

                // Check collision
                if (await this.app.vault.adapter.exists(newPath)) {
                    console.warn(`File already exists at ${newPath}, skipping ${file.path}`);
                    errors++;
                    continue;
                }

                await this.app.fileManager.renameFile(file, newPath);
                count++;

            } catch (e) {
                console.error(`Failed to archive ${file.path}`, e);
                errors++;
            }
        }

        new Notice(`Archived ${count} files. ${errors > 0 ? `(${errors} skipped/failed)` : ""}`);
    }
}

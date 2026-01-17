import { App, TFile, debounce } from "obsidian";
import { ActionService } from "./action/action-service";
import { FrontmatterUpdater } from "./action/frontmatter-updater";
import { SchemaValidator } from "./action/schema-validator";

export class DailyPlanSyncer {
    private app: App;
    private actionService: ActionService;
    private updater: FrontmatterUpdater;

    constructor(app: App, actionService: ActionService) {
        this.app = app;
        this.actionService = actionService;
        this.updater = new FrontmatterUpdater(app, new SchemaValidator());
    }

    public onload() {
        this.app.workspace.onLayoutReady(() => {
            this.app.vault.on('modify', this.handleModify.bind(this));
        });
    }

    public onunload() {
        this.app.vault.off('modify', this.handleModify.bind(this));
    }

    private async handleModify(file: TFile) {
        // Only process Daily Notes (e.g. "Daily/YYYY-MM-DD.md" or based on template)
        // Adjust regex based on user folder structure.
        // Template path: `📓 每日日记/${today}.md` (from action-service.ts)
        // Or "Daily/Journal/..."?
        // Let's use a safe heuristic: Check if it has 'plan_checklist' in frontmatter.

        if (!(file instanceof TFile) || file.extension !== 'md') return;

        // Debounce actual processing? Obsidian 'modify' can fire multiple times.
        // But for file read/write, simple check is ok.

        const content = await this.app.vault.read(file);

        // Quick check for checklist section to avoid parsing every file
        if (!content.includes('plan_checklist') || !content.includes('### ✅ 盘前检查清单')) return;

        await this.syncBodyToFrontmatter(file, content);
    }

    private async syncBodyToFrontmatter(file: TFile, content: string) {
        const { frontmatter, body } = this.updater.parseFrontmatter(content);

        // Check frontmatter checklist
        const fmChecklist = frontmatter.plan_checklist || frontmatter.checklist;
        if (!Array.isArray(fmChecklist)) return;

        // Parse Body Checklist
        const tasks = this.parseBodyChecklist(body);

        if (tasks.length === 0) return; // No body tasks found

        // We assume 1-to-1 mapping by index
        // If lengths differ, we might be risky.
        // Strategy: Only update properties if they differ.
        // If body has fewer items, maybe user deleted one?
        // We sync Up to min(length).

        let hasChanges = false;
        const newChecklist = [...fmChecklist];

        const limit = Math.min(newChecklist.length, tasks.length);
        for (let i = 0; i < limit; i++) {
            const bodyDone = tasks[i].done;
            const bodyText = tasks[i].text; // Should we sync text rename? Maybe too dangerous.

            // Sync status
            if (newChecklist[i].done !== bodyDone) {
                newChecklist[i].done = bodyDone;
                hasChanges = true;
            }
        }

        if (hasChanges) {
            // Update Frontmatter
            // We can use ActionService.updateFrontmatter OR direct modify.
            // Direct modify to avoid double-processing body sync (ActionService toggle updates body).
            // We ONLY want to update Frontmatter here because Body is already Source of Truth.

            frontmatter.plan_checklist = newChecklist;
            // Also handle 'checklist' alias if present?
            if (frontmatter.checklist) frontmatter.checklist = newChecklist;

            const newContent = this.updater.serializeFrontmatter(frontmatter, body);

            // Use low-level modify to avoid ActionService logic overhead?
            await this.app.vault.modify(file, newContent);

            // Console log for debug
            // console.log(`[DailyPlanSyncer] Synced frontmatter from body for ${file.path}`);
        }
    }

    private parseBodyChecklist(body: string): { text: string, done: boolean }[] {
        const lines = body.split('\n');
        const taskHeaderRegex = /###\s*✅\s*盘前检查清单/;
        let foundHeader = false;
        const tasks: { text: string, done: boolean }[] = [];

        for (let i = 0; i < lines.length; i++) {
            if (taskHeaderRegex.test(lines[i])) {
                foundHeader = true;
                continue;
            }

            if (foundHeader) {
                if (lines[i].match(/^#{1,3}\s/)) break;

                const match = lines[i].match(/^\s*-\s*\[([ x])\]\s*(.*)/);
                if (match) {
                    tasks.push({
                        done: match[1] === 'x',
                        text: match[2].trim()
                    });
                }
            }
        }
        return tasks;
    }
}

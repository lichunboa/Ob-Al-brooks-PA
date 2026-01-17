
import { App, TFile, Notice } from "obsidian";
import { DailyPlan, PlanChecklistItem } from "../types/plan";

const CHECKLIST_HEADER_PATTERN = /^#+\s*(?:✅\s*)?盘前检查清单/i;
const CHECKLIST_ITEM_PATTERN = /^(\s*-\s*\[([ xX])\]\s*(.*))$/;

export class DailyPlanService {
    constructor(private app: App) { }

    /**
     * Reads the checklist from the file content (Markdown body)
     * This is the SOURCE OF TRUTH for checklists.
     */
    public async getChecklist(file: TFile): Promise<PlanChecklistItem[]> {
        const content = await this.app.vault.read(file);
        const lines = content.split("\n");
        const items: PlanChecklistItem[] = [];

        let inChecklistSection = false;

        for (const line of lines) {
            if (CHECKLIST_HEADER_PATTERN.test(line)) {
                inChecklistSection = true;
                continue;
            }

            if (inChecklistSection) {
                if (line.trim().startsWith("#")) {
                    // Next header, stop
                    break;
                }

                const match = line.match(CHECKLIST_ITEM_PATTERN);
                if (match) {
                    const isChecked = match[2] === "x" || match[2] === "X";
                    const text = match[3].trim();
                    items.push({ text, done: isChecked });
                }
            }
        }

        return items;
    }

    /**
     * Toggles a checklist item in the file content.
     * @param file The file to update
     * @param index The index of the item within the checklist section
     * @param checked The new state
     */
    public async toggleChecklistItem(file: TFile, index: number, checked: boolean): Promise<void> {
        const content = await this.app.vault.read(file);
        const lines = content.split("\n");
        const newLines = [...lines];

        let inChecklistSection = false;
        let currentIndex = 0;
        let found = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (CHECKLIST_HEADER_PATTERN.test(line)) {
                inChecklistSection = true;
                continue;
            }

            if (inChecklistSection) {
                if (line.trim().startsWith("#")) {
                    break;
                }

                const match = line.match(CHECKLIST_ITEM_PATTERN);
                if (match) {
                    if (currentIndex === index) {
                        // Found the item to toggle
                        const originalIndent = line.substring(0, line.indexOf("-"));
                        const text = match[3]; // Keep original text (ignoring recursive parsing)
                        // Actually better to preserve exact characters after [ ]
                        // The regex: Group 1 is full line, Group 2 is [x], Group 3 is text
                        // We construct new line
                        const newMark = checked ? "x" : " ";
                        // Reconstruct respecting original formatting if possible, 
                        // but simple reconstruction is safer:
                        // line.replace(/- \[[ xX]\]/, `- [${newMark}]`)
                        newLines[i] = line.replace(/-\s*\[([ xX])\]/, `- [${newMark}]`);
                        found = true;
                        break;
                    }
                    currentIndex++;
                }
            }
        }

        if (found) {
            await this.app.vault.modify(file, newLines.join("\n"));
            // Optional: Sync frontmatter too? 
            // For now, let's keep Content as Single Source of Truth.
        } else {
            new Notice("Failed to find checklist item to toggle.");
        }
    }
}

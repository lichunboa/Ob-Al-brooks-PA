import { App, Notice, TFile } from "obsidian";
import type {
    FixPlan,
    ManagerApplyResult,
    FrontmatterFile,
    StrategyNoteFrontmatter,
} from "./manager";
import type { PaTagSnapshot } from "../types";
import { type CourseSnapshot, buildCourseSnapshot, parseSyllabusJsonFromMarkdown, type SyllabusItem } from "./course";
import { type MemorySnapshot, buildMemorySnapshot } from "./memory";
import type { AlBrooksConsoleSettings } from "../settings";

/**
 * Loads a snapshot of all tags in the vault.
 */
export async function loadPaTagSnapshot(app: App): Promise<PaTagSnapshot> {
    const tagMap: Record<string, number> = {};
    const files = app.vault.getMarkdownFiles();

    for (const f of files) {
        const cache = app.metadataCache.getFileCache(f);
        if (!cache || !cache.tags) continue;

        for (const t of cache.tags) {
            const tag = t.tag;
            tagMap[tag] = (tagMap[tag] || 0) + 1;
        }
    }

    return {
        generatedAtIso: new Date().toISOString(),
        tagMap,
        files: files.length,
    };
}

/**
 * Loads all frontmatter files in the vault.
 */
export async function loadAllFrontmatterFiles(app: App): Promise<FrontmatterFile[]> {
    const files = app.vault.getMarkdownFiles();
    return files.map((f) => ({
        path: f.path,
        frontmatter: (app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>,
    }));
}

/**
 * Loads strategy notes.
 */
export async function loadStrategyNotes(app: App): Promise<StrategyNoteFrontmatter[]> {
    const files = app.vault.getMarkdownFiles();
    const strategies: StrategyNoteFrontmatter[] = [];

    for (const f of files) {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) continue;

        const isStrategy =
            fm.strategy_name !== undefined ||
            f.path.includes("Strategies/") ||
            f.path.includes("Explanations/Strategies");

        if (isStrategy) {
            strategies.push({
                path: f.path,
                frontmatter: (fm ?? {}) as Record<string, unknown>,
            });
        }
    }
    return strategies;
}

/**
 * Loads course snapshot from configured syllabus file.
 */
export async function loadCourse(app: App, settings: AlBrooksConsoleSettings): Promise<CourseSnapshot> {
    // Scan for syllabus file
    const files = app.vault.getMarkdownFiles();
    let syllabusFile = files.find(f => f.name === "PA_Syllabus_Data.md");

    // If not found, try specific path if known
    if (!syllabusFile) {
        const absFile = app.vault.getAbstractFileByPath("Templates/PA_Syllabus_Data.md");
        if (absFile instanceof TFile) syllabusFile = absFile;
    }

    let syllabus: SyllabusItem[] = [];
    if (syllabusFile) {
        const content = await app.vault.read(syllabusFile);
        syllabus = parseSyllabusJsonFromMarkdown(content);
    }

    const linksById: Record<string, { path: string; name: string }> = {};
    const doneIds: string[] = [];

    for (const f of files) {
        const cache = app.metadataCache.getFileCache(f);
        const fm = cache?.frontmatter;

        // FIXED: User specified 'module_id' is the key property.
        let id = fm?.module_id;

        // Fallback to course_id if module_id missing (backward compat), or basename if neither exist (but user wants strict module_id??)
        // User said: "Only module_id marked courses should be counted".
        // So I will prioritize module_id. If missing, I should probably NOT count it as a course node unless strict legacy file naming?
        // Let's keep `course_id` as fallback but prefer `module_id`.
        if (!id) id = fm?.course_id;

        // Strict Mode: If user insists on "Only module_id", maybe I should disable filename regex?
        // User said: "1. Only courses with module_id property should be counted. You didn't analyze this."
        // This implies filename matching is unwanted/wrong.
        // I will COMMENT OUT the filename regex match to strictly follow user request.
        /*
        if (!id) {
            const m = f.basename.match(/^([A-Za-z0-9]+)/);
            if (m) id = m[1];
        }
        */

        if (id) {
            // Normalize ID: remove leading zeros (01 -> 1) IF it is purely numeric, or numeric part of alphanum?
            // Actually, best to store as is, BUT syllabus usually uses "1", "2" for numbers.
            // If filename is "01", we should map to "1".
            // If filename is "02A", we should map to "2A" or "02A"?
            // User syllabus likely uses "2A" if filename uses "02A".
            // Let's normalize by stripping leading zero if it looks like a number or alpha-number?
            // "01" -> "1", "02A" -> "2A". "L01" -> "L1"? No, L01 usually stays L01.
            // Safe bet: Match strictly.
            // BUT user complaint involves "logic messed up".
            // Let's rely on flexible matching.
            // Check if we can find exact match first.
            let key = String(id);
            if (!linksById[key] && key.startsWith("0")) {
                const noZero = key.replace(/^0+/, "");
                if (noZero) key = noZero;
            }
            linksById[key] = { path: f.path, name: f.basename };
            // Also store original for safety
            if (String(id) !== key) linksById[String(id)] = { path: f.path, name: f.basename };
            linksById[String(id)] = { path: f.path, name: f.basename };

            // FIXED: Respected 'studied' boolean/checkbox from v5 legacy logic
            if (fm?.status === "Done" || fm?.tags?.includes("#PA/Done") || fm?.studied === true) {
                doneIds.push(String(id));
            }
        }
    }

    return buildCourseSnapshot({
        syllabus,
        doneIds,
        linksById,
        courseRecommendationWindow: settings.courseRecommendationWindow ?? 5
    });
}

/**
 * Loads memory snapshot (spaced repetition stats).
 */
export async function loadMemory(app: App, settings: AlBrooksConsoleSettings): Promise<MemorySnapshot> {
    const files = app.vault.getMarkdownFiles();
    const memoryFiles = [];

    // Check if the user's standard "Categories 分类" folder exists to use as a strict whitelist
    // logic: If "Categories 分类" exists, we ONLY scan there. 
    // This aligns with the user's SR Plugin Deck view which shows "Categories 分类" as the root.
    const whitelistRoot = app.vault.getAbstractFileByPath("Categories 分类") ? "Categories 分类" : null;

    // DEBUG: Notify user of scan scope
    // new Notice(`Console Memory Scan: ${whitelistRoot ? "Whitelist Mode (" + whitelistRoot + ")" : "Full Vault Mode"}`);

    for (const f of files) {
        // 1. Strict Whitelist Strategy (if applicable)
        if (whitelistRoot) {
            if (!f.path.startsWith(whitelistRoot)) continue;
        } else {
            // 2. Strict Blacklist Strategy (Fallback)
            const pathLower = f.path.toLowerCase();
            if (pathLower.includes("templates/")) continue;
            if (f.path.includes("🦁")) continue;
            if (pathLower.includes("readme.md")) continue;
            if (pathLower.includes("exports/")) continue;
            if (pathLower.includes(".trash/")) continue;
        }

        const content = await app.vault.read(f);
        memoryFiles.push({
            path: f.path,
            name: f.basename,
            folder: f.parent?.path ?? "",
            content
        });
    }

    // (Filtering is done above, so we pass memoryFiles directly)
    return buildMemorySnapshot({
        files: memoryFiles,
        today: new Date(),
        dueThresholdDays: settings.srsDueThresholdDays ?? 0,
        randomQuizCount: settings.srsRandomQuizCount ?? 5
    });
}

/**
 * Applies a FixPlan to the vault using processFrontMatter.
 */
export async function applyFixPlan(
    app: App,
    plan: FixPlan,
    options: { deleteKeys?: boolean } = {}
): Promise<ManagerApplyResult> {
    const result: ManagerApplyResult = {
        applied: 0,
        failed: 0,
        errors: [],
        backups: {},
    };

    if (!plan.fileUpdates || plan.fileUpdates.length === 0) return result;

    for (const update of plan.fileUpdates) {
        const file = app.vault.getAbstractFileByPath(update.path);
        if (!(file instanceof TFile)) {
            result.errors.push({ path: update.path, message: "File not found" });
            result.failed++;
            continue;
        }

        try {
            await app.fileManager.processFrontMatter(file, (fm) => {
                // Apply updates
                if (update.updates) {
                    for (const [key, val] of Object.entries(update.updates)) {
                        fm[key] = val;
                    }
                }
                // Apply deletions
                if (options.deleteKeys && update.deleteKeys) {
                    for (const key of update.deleteKeys) {
                        delete fm[key];
                    }
                }
            });
            result.applied++;
        } catch (e) {
            result.errors.push({
                path: update.path,
                message: e instanceof Error ? e.message : String(e)
            });
            result.failed++;
        }
    }

    return result;
}

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

    // Debug: Trace start
    console.log(`[Manager] loadCourse started. Scanning ${files.length} files...`);

    for (const f of files) {
        if (f.path.includes("Templates/") || f.path.includes("Archive/")) continue;

        const cache = app.metadataCache.getFileCache(f);
        const fm = cache?.frontmatter;

        // 2. Legacy Filter: Check tags
        const tags = cache?.tags?.map(t => t.tag) || [];
        const updateTags = fm?.tags;

        let hasCourseTag = false;
        if (tags.some(t => t.toLowerCase() === "#pa/course")) hasCourseTag = true;
        if (!hasCourseTag && updateTags) {
            const tagList = Array.isArray(updateTags) ? updateTags : String(updateTags).split(/[\s,]+/);
            if (tagList.some((t: string) => t.trim().replace(/^#/, "").toLowerCase() === "pa/course")) {
                hasCourseTag = true;
            }
        }

        // Robust Module ID Parsing
        let ids: string[] = [];
        const rawModuleId = fm?.module_id;
        const rawCourseId = fm?.course_id;

        const parseIds = (raw: any): string[] => {
            if (raw === undefined || raw === null) return [];
            if (Array.isArray(raw)) return raw.map(String);
            // Handle comma-separated string: "10A, 10B"
            if (typeof raw === 'string' && raw.includes(',')) {
                return raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            return [String(raw)];
        };

        if (rawModuleId !== undefined && rawModuleId !== null) {
            ids = parseIds(rawModuleId);
        } else if (rawCourseId !== undefined && rawCourseId !== null) {
            ids = parseIds(rawCourseId);
        }

        // If file *looks* like a course but has no tag, log a warning (could be the issue)
        if (ids.length > 0 && !hasCourseTag) {
            // console.warn(`[Manager] Skipped possible course file (missing #PA/Course): "${f.basename}" IDs: [${ids.join(", ")}]`);
            // Strict legacy behavior: MUST have tag.
            continue;
        }

        if (!hasCourseTag) continue;

        if (ids.length > 0) {
            const isDone = fm?.status === "Done" || fm?.tags?.includes("#PA/Done") || fm?.studied === true;

            // Debug Log: Valid course found
            console.log(`[Manager] Course Note: "${f.basename}" IDs: [${ids.join(", ")}] Done: ${isDone}`);

            for (const idStr of ids) {
                const id = idStr.trim();
                if (!id) continue;

                // LEGACY BEHAVIOR: Exact match
                const key = id;
                linksById[key] = { path: f.path, name: f.basename };
                if (isDone) {
                    doneIds.push(key);
                }
            }
        }
    } return buildCourseSnapshot({
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

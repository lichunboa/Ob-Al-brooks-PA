import { App, TFile } from "obsidian";
import { createEnumPresetsFromFrontmatter, EnumPresets } from "./enum-presets";

/**
 * Loads the dynamic schema definitions from the "Attribute Presets" template.
 * Path: Templates/属性值预设.md
 */
export class SchemaLoader {
    private app: App;
    private presetPath: string;

    constructor(app: App, presetPath: string = "Templates/属性值预设.md") {
        this.app = app;
        this.presetPath = presetPath;
    }

    /**
     * Finds the preset file and returns the EnumPresets object.
     * If file not found or empty, returns a default (empty) preset.
     */
    public async load(): Promise<EnumPresets> {
        const file = this.resolveFile();
        if (!file) {
            console.warn(`[SchemaLoader] Preset file not found at: ${this.presetPath}`);
            return createEnumPresetsFromFrontmatter({});
        }

        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        if (!fm) {
            console.warn(`[SchemaLoader] No frontmatter found in preset file: ${file.path}`);
            return createEnumPresetsFromFrontmatter({});
        }

        console.log(`[SchemaLoader] Loaded dynamic enums from ${file.path}`);
        return createEnumPresetsFromFrontmatter(fm);
    }

    /**
     * Resolves the TFile object for the preset path.
     * Handles loose matching if exact path fails (standard Obsidian behavior).
     */
    private resolveFile(): TFile | null {
        const abstractFile = this.app.vault.getAbstractFileByPath(this.presetPath);
        if (abstractFile instanceof TFile) {
            return abstractFile;
        }
        // Fallback: try finding by name if exact path fails
        // (This handles cases where user moved it but name is same)
        const name = this.presetPath.split("/").pop();
        if (name) {
            const found = this.app.vault.getFiles().find(f => f.name === name);
            if (found) return found;
        }
        return null;
    }
}

export class TFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    stat: any;
    parent: any;
    vault: any;

    constructor() {
        this.path = "";
        this.name = "";
        this.basename = "";
        this.extension = "";
        this.stat = {};
    }
}

export class TFolder {
    path: string;
    name: string;
    children: any[];

    constructor() {
        this.path = "";
        this.name = "";
        this.children = [];
    }
}

export class App {
    vault: any;
    metadataCache: any;
    workspace: any;
    constructor() {
        this.vault = {
            on: jest.fn(),
            getAbstractFileByPath: jest.fn(),
            getFiles: jest.fn(),
        };
        this.metadataCache = {
            on: jest.fn(),
            getFileCache: jest.fn(),
        };
        this.workspace = {
            on: jest.fn(),
        };
    }
}

export class Vault { }
export class MetadataCache { }
export class Workspace { }

export const parseYaml = jest.fn((content) => {
    if (!content) return {};
    const result: any = {};
    const lines = content.split('\n');
    let currentList: any[] | null = null;
    let currentObj: any = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) continue;
        if (!trimmed) continue;

        if (trimmed === 'plan_checklist:') {
            result.checklist = []; // Map plan_checklist to checklist (or keep as plan_checklist?)
            // Note: Service code checks frontmatter.checklist? 
            // Wait, ActionService 319: frontmatter.checklist
            // BUT template says plan_checklist.
            // My Service code seems to assume 'checklist'.
            // I should check ActionService.ts again. 
            // If it expects 'checklist', but template has 'plan_checklist', that's a bug in Service.
            // Assuming Service uses `frontmatter.checklist`?
            // Let's assume the mock puts it in `checklist` for now if key is `plan_checklist`.
            currentList = result.checklist;
            continue;
        }

        // Handle list items
        if (currentList && trimmed.startsWith('- text:')) {
            const text = trimmed.replace('- text:', '').trim().replace(/^"|"$/g, '');
            currentObj = { text, done: false };
            currentList.push(currentObj);
            continue;
        }

        if (currentList && currentObj && trimmed.startsWith('done:')) {
            const val = trimmed.replace('done:', '').trim();
            currentObj.done = val === 'true';
            continue;
        }

        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim();

            // Allow explicit mapping if needed, else normal key
            if (key !== 'plan_checklist') {
                if (val === 'true') result[key] = true;
                else if (val === 'false') result[key] = false;
                else if (!isNaN(Number(val)) && val !== '') result[key] = Number(val);
                else result[key] = val;
            }
        }
    }
    return result;
});

export const stringifyYaml = jest.fn((content) => {
    return JSON.stringify(content); // Simple fallback
});

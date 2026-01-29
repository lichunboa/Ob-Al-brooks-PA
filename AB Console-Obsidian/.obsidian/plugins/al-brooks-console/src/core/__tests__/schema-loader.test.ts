import { App, TFile, TFolder, MetadataCache, Vault } from "obsidian";
import { SchemaLoader } from "../schema-loader";

// Mock Obsidian types
const mockFile = (path: string, name: string): TFile => {
    const f = new TFile();
    f.path = path;
    f.name = name;
    f.basename = name.replace(".md", "");
    f.extension = "md";
    f.stat = { ctime: 0, mtime: 0, size: 0 };
    return f;
};

describe("SchemaLoader", () => {
    let mockApp: App;
    let mockVault: any;
    let mockMetadataCache: any;

    beforeEach(() => {
        mockVault = {
            getAbstractFileByPath: jest.fn(),
            getFiles: jest.fn(),
        };
        mockMetadataCache = {
            getFileCache: jest.fn(),
        };
        mockApp = {
            vault: mockVault,
            metadataCache: mockMetadataCache,
        } as unknown as App;
    });

    test("load() returns presets from file frontmatter", async () => {
        // Setup
        const presetPath = "Templates/属性值预设.md";
        const file = mockFile(presetPath, "属性值预设.md");
        const frontmatter = {
            "account_type": ["Live", "Demo"],
            "setup_category": ["Trend", "Range"]
        };

        mockVault.getAbstractFileByPath.mockReturnValue(file);
        mockMetadataCache.getFileCache.mockReturnValue({ frontmatter });

        // Execute
        const loader = new SchemaLoader(mockApp, presetPath);
        const presets = await loader.load();

        // Verify
        expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(presetPath);
        expect(presets.getCanonicalValues("account_type")).toEqual(["Live", "Demo"]);
        expect(presets.getCanonicalValues("setup_category")).toEqual(["Trend", "Range"]);
    });

    test("load() handles missing file gracefully", async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(null);
        mockVault.getFiles.mockReturnValue([]);

        const loader = new SchemaLoader(mockApp);
        const presets = await loader.load();

        expect(presets.getCanonicalValues("anything")).toEqual([]);
    });

    test("load() locates file by name if exact path fails", async () => {
        const presetPath = "Templates/属性值预设.md";
        const actualPath = "Inbox/属性值预设.md"; // Moved by user
        const file = mockFile(actualPath, "属性值预设.md");

        mockVault.getAbstractFileByPath.mockReturnValue(null);
        mockVault.getFiles.mockReturnValue([file]);
        mockMetadataCache.getFileCache.mockReturnValue({
            frontmatter: { "test_field": ["A", "B"] }
        });

        const loader = new SchemaLoader(mockApp, presetPath);
        const presets = await loader.load();

        expect(presets.getCanonicalValues("test_field")).toEqual(["A", "B"]);
    });
});

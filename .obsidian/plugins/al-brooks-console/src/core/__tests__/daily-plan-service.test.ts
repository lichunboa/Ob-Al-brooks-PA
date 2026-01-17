
import { App, TFile } from "obsidian";
import { DailyPlanService } from "../daily-plan-service";

// Mocking Obsidian App and Vault
const mockRead = jest.fn();
const mockModify = jest.fn();

const mockApp = {
    vault: {
        read: mockRead,
        modify: mockModify
    }
} as unknown as App;

describe("DailyPlanService", () => {
    let service: DailyPlanService;
    let mockFile: TFile;

    beforeEach(() => {
        service = new DailyPlanService(mockApp);
        mockFile = { path: "Daily/2026-01-16.md", basename: "2026-01-16" } as TFile;
        jest.clearAllMocks();
    });

    const SAMPLE_CONTENT = `---
date: 2026-01-16
---

# 🌅 1. 盘前准备

### ✅ 盘前检查清单

- [ ] Item 1
- [x] Item 2
- [ ] Item 3

# ⚔️ 2. 今日战况
`;

    test("getChecklist parses items correctly", async () => {
        mockRead.mockResolvedValue(SAMPLE_CONTENT);

        const items = await service.getChecklist(mockFile);

        expect(items).toHaveLength(3);
        expect(items[0]).toEqual({ text: "Item 1", done: false });
        expect(items[1]).toEqual({ text: "Item 2", done: true });
        expect(items[2]).toEqual({ text: "Item 3", done: false });
    });

    test("toggleChecklistItem updates content correctly", async () => {
        mockRead.mockResolvedValue(SAMPLE_CONTENT);

        // Toggle Item 1 (index 0) from [ ] to [x]
        await service.toggleChecklistItem(mockFile, 0, true);

        expect(mockModify).toHaveBeenCalledWith(
            mockFile,
            expect.stringContaining("- [x] Item 1")
        );
    });

    test("toggleChecklistItem unchecks correctly", async () => {
        mockRead.mockResolvedValue(SAMPLE_CONTENT);

        // Toggle Item 2 (index 1) from [x] to [ ]
        await service.toggleChecklistItem(mockFile, 1, false);

        expect(mockModify).toHaveBeenCalledWith(
            mockFile,
            expect.stringContaining("- [ ] Item 2")
        );
    });

    test("ignores lists outside checklist section", async () => {
        const trickyContent = `
# Other List
- [ ] Not me

### ✅ 盘前检查清单
- [ ] Real Item

# End
- [ ] Not me either
`;
        mockRead.mockResolvedValue(trickyContent);
        const items = await service.getChecklist(mockFile);

        expect(items).toHaveLength(1);
        expect(items[0].text).toBe("Real Item");
    });
});

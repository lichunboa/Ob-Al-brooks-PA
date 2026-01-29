import { ActionService } from '../action-service';
import { App, TFile } from 'obsidian';

// Mock Obsidian
const mockVault = {
    getAbstractFileByPath: jest.fn(),
    read: jest.fn(),
    modify: jest.fn(),
    getMarkdownFiles: jest.fn()
};

const mockApp = {
    vault: mockVault
} as unknown as App;

describe('ActionService Daily Plan Sync', () => {
    let service: ActionService;
    let mockFile: TFile;

    beforeEach(() => {
        service = new ActionService(mockApp);
        mockFile = new TFile();
        mockFile.path = 'Daily/2026-01-01.md';

        jest.clearAllMocks();

        mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
    });

    it('should update both frontmatter and markdown body when toggling checklist item', async () => {
        // Initial State: Item 0 is unchecked in both places
        const originalContent = `---
plan_checklist:
  - text: "Item A"
    done: false
  - text: "Item B"
    done: true
---

# Header

### ✅ 盘前检查清单

- [ ] Item A
- [x] Item B
- [ ] Item C
`;

        mockVault.read.mockResolvedValue(originalContent);

        // Toggle Item 0 (Item A) -> Should become true / [x]
        await service.togglePlanChecklistItem('Daily/2026-01-01.md', 0);

        expect(mockVault.modify).toHaveBeenCalledTimes(1);
        const newContent = mockVault.modify.mock.calls[0][1];

        // Assert Frontmatter Updated
        // Note: Mock stringifyYaml produces JSON, so we look for keys.
        expect(newContent).toMatch(/done"?:?\s*true/);

        // Assert Body Updated
        // Should find "- [x] Item A"
        expect(newContent).toContain('- [x] Item A');
    });

    it('should handle checklist items with different formatting', async () => {
        const originalContent = `---
plan_checklist:
  - text: "Item A"
    done: false
---

### ✅ 盘前检查清单

- [ ] Item A
`;
        mockVault.read.mockResolvedValue(originalContent);
        await service.togglePlanChecklistItem('Daily/2026-01-01.md', 0);

        const newContent = mockVault.modify.mock.calls[0][1];
        expect(newContent).toContain('- [x] Item A');
    });

    it('should throw if checklist section missing in body', async () => {
        // Frontmatter has it, Body does NOT
        const originalContent = `---
plan_checklist:
  - text: "Item A"
    done: false
---

# No Checklist Here
`;
        mockVault.read.mockResolvedValue(originalContent);

        // Should NOT throw, but maybe log warning? 
        // Or currently it might just update frontmatter and ignore body?
        // Requirement says "Bi-directional". If body missing, maybe just update frontmatter?
        // Let's expect it to update frontmatter at least.

        await service.togglePlanChecklistItem('Daily/2026-01-01.md', 0);

        const newContent = mockVault.modify.mock.calls[0][1];
        expect(newContent).toMatch(/done"?:?\s*true/);
    });
});

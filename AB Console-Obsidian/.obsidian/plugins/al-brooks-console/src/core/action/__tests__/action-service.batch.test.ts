import { ActionService } from '../action-service';
import { App, TFile } from 'obsidian';
import * as obsidian from 'obsidian';

// Mock Obsidian modules
jest.mock('obsidian');

describe('ActionService Batch Operations', () => {
    let app: App;
    let service: ActionService;
    let mockVault: any;
    let mockMetadataCache: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock files
        const createMockFile = (path: string, content: string) => {
            const file = new TFile();
            (file as any).path = path;
            (file as any).basename = path.split('/').pop()?.replace('.md', '');
            (file as any).extension = 'md';
            return file;
        };

        const file1 = createMockFile('Trades/Trade1.md', '---\nticker: AAPL\n---\n');
        const file2 = createMockFile('Trades/Trade2.md', '---\nticker: GOOGL\n---\n');

        mockVault = {
            getAbstractFileByPath: jest.fn((path) => {
                if (path === 'Trades/Trade1.md') return file1;
                if (path === 'Trades/Trade2.md') return file2;
                return null;
            }),
            read: jest.fn().mockResolvedValue(`---
ticker: OLD
date: 2023-01-01
outcome: win
pnl: 100
accountType: Demo
---
`),
            modify: jest.fn().mockResolvedValue(undefined),
            getMarkdownFiles: jest.fn().mockReturnValue([file1, file2]),
        };

        mockMetadataCache = {
            getFileCache: jest.fn((file) => ({
                frontmatter: {
                    ticker: 'OLD',
                    date: '2023-01-01',
                    outcome: 'win',
                    pnl: 100,
                    accountType: 'Demo'
                }
            })),
        };

        app = {
            vault: mockVault,
            metadataCache: mockMetadataCache,
        } as any;

        service = new ActionService(app);

        // Mock setPresets to avoid error
        service.setPresets({
            getCanonicalValues: (k: string): string[] => [],
            getCanonicalKey: (k: string): string => k,
            getAliases: (k: string): string[] => []
        } as any);

        // Spy on individual updateTrade
        jest.spyOn(service, 'updateTrade');
    });

    it('should process batch updates successfully', async () => {
        const items = [
            { path: 'Trades/Trade1.md', updates: { ticker: 'MSFT' } },
            { path: 'Trades/Trade2.md', updates: { ticker: 'AMZN' } }
        ];

        const result = await service.batchUpdateTrades(items, {
            dryRun: false,
        });

        expect(service.updateTrade).toHaveBeenCalledTimes(2);
        expect(result.total).toBe(2);
        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(0);

        // Verify modify called (since it's not dryRun)
        expect(mockVault.modify).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures', async () => {
        // file3 does not exist
        const items = [
            { path: 'Trades/Trade1.md', updates: { ticker: 'MSFT' } },
            { path: 'Trades/Ghost.md', updates: { ticker: 'GHOST' } }
        ];

        const result = await service.batchUpdateTrades(items, {
            dryRun: false,
            validateRisk: false
        });

        expect(result.total).toBe(2);
        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.results[1].success).toBe(false);
        expect(result.results[1].message).toMatch(/文件不存在/);
    });

    it('should respect dryRun option', async () => {
        const items = [
            { path: 'Trades/Trade1.md', updates: { ticker: 'MSFT' } }
        ];

        const result = await service.batchUpdateTrades(items, {
            dryRun: true,
            validateRisk: false
        });

        expect(result.succeeded).toBe(1);
        expect(mockVault.modify).not.toHaveBeenCalled();
    });
});

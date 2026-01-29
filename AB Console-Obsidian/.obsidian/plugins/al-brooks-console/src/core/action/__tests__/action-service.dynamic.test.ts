
import { App, TFile } from "obsidian";
import { ActionService } from "../action-service";
import type { EnumPresets } from "../../enum-presets";

// Mock App
const mockRead = jest.fn();
const mockModify = jest.fn();
const mockGetAbstractFileByPath = jest.fn();

const mockApp = {
    vault: {
        read: mockRead,
        modify: mockModify,
        getAbstractFileByPath: mockGetAbstractFileByPath
    }
} as unknown as App;

// Mock Presets
const mockPresets: EnumPresets = {
    canonicalizeFieldKey: (k) => k,
    getCanonicalValues: (key) => {
        if (key === "market_cycle") return ["Bull", "Bear"];
        return [];
    },
    resolve: () => ({ isCanonical: false }),
    normalize: () => undefined
};

describe("ActionService Dynamic Validation", () => {
    let service: ActionService;
    let mockFile: TFile;

    beforeEach(() => {
        service = new ActionService(mockApp);
        service.setPresets(mockPresets);
        mockFile = new TFile();
        mockFile.path = "Trades/TestTrade.md";
        mockFile.basename = "TestTrade";

        mockGetAbstractFileByPath.mockReturnValue(mockFile);
        mockRead.mockResolvedValue("---\n---\n"); // Empty initial content
    });

    test("schema creation smoke test", () => {
        const { createTradeRecordSchema } = require("../zod-schema");
        expect(() => createTradeRecordSchema(mockPresets)).not.toThrow();
        expect(() => createTradeRecordSchema(undefined)).not.toThrow();
    });

    test("validates marketCycle against presets", async () => {
        // Valid Cycle
        const result1 = await service.updateTrade("Trades/TestTrade.md", {
            marketCycle: "Bull",
            // Required fields for full validation
            date: new Date(),
            pnl: 100,
            outcome: "win",
            accountType: "Live"
        } as any, { validateRisk: false });

        // Should succeed (validation enabled by default)
        if (!result1.success) {
            console.error("Test 1 Failed:", result1.message, result1.errors);
        }
        expect(result1.success).toBe(true);
    });

    test("fails invalid marketCycle against presets", async () => {
        // Invalid Cycle
        const result = await service.updateTrade("Trades/TestTrade.md", {
            marketCycle: "InvalidCycle",
            date: new Date(),
            pnl: 100,
            outcome: "win",
            accountType: "Live"
        } as any, { validateRisk: false });

        if (result.success) {
            console.error("Test 2 Failed (Should be false):", result);
        }

        expect(result.success).toBe(false);
        expect(result.message).toContain("数据验证失败");
        // Check errors details if possible (validator returns errors array)
        if (result.errors) {
            const err = result.errors.find(e => e.field.includes("marketCycle"));
            expect(err).toBeDefined();
        }
    });

    test("allows string if no presets for field (e.g. strategyName)", async () => {
        const result = await service.updateTrade("Trades/TestTrade.md", {
            strategyName: "Any Value",
            date: new Date(),
            pnl: 100,
            outcome: "win",
            accountType: "Live"
        } as any);

        expect(result.success).toBe(true);
    });
});

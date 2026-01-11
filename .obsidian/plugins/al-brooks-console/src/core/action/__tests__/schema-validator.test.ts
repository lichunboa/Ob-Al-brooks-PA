/**
 * TRADE_SCHEMA 测试
 * 验证Schema定义的完整性和正确性
 */

import { TRADE_SCHEMA } from "../schema-validator";

describe('TRADE_SCHEMA', () => {
    it('应该包含所有核心必填字段', () => {
        expect(TRADE_SCHEMA.date).toBeDefined();
        expect(TRADE_SCHEMA.pnl).toBeDefined();
        expect(TRADE_SCHEMA.outcome).toBeDefined();
        expect(TRADE_SCHEMA.accountType).toBeDefined();
    });

    it('核心字段应该是必填的', () => {
        expect(TRADE_SCHEMA.date.required).toBe(true);
        expect(TRADE_SCHEMA.pnl.required).toBe(true);
        expect(TRADE_SCHEMA.outcome.required).toBe(true);
        expect(TRADE_SCHEMA.accountType.required).toBe(true);
    });

    it('应该包含所有可选字段', () => {
        expect(TRADE_SCHEMA.ticker).toBeDefined();
        expect(TRADE_SCHEMA.marketCycle).toBeDefined();
        expect(TRADE_SCHEMA.setupKey).toBeDefined();
        expect(TRADE_SCHEMA.strategyName).toBeDefined();
    });

    it('可选字段应该不是必填的', () => {
        expect(TRADE_SCHEMA.ticker.required).toBe(false);
        expect(TRADE_SCHEMA.marketCycle.required).toBe(false);
    });

    it('枚举字段应该有正确的枚举值', () => {
        expect(TRADE_SCHEMA.outcome.enum).toEqual([
            "win", "loss", "scratch", "open", "unknown"
        ]);
        expect(TRADE_SCHEMA.accountType.enum).toEqual([
            "Live", "Demo", "Backtest"
        ]);
    });

    it('所有字段应该有规范名称', () => {
        for (const [key, schema] of Object.entries(TRADE_SCHEMA)) {
            expect(schema.canonicalName).toBeDefined();
            expect(schema.canonicalName.length).toBeGreaterThan(0);
        }
    });

    it('所有字段应该有别名列表', () => {
        for (const [key, schema] of Object.entries(TRADE_SCHEMA)) {
            expect(schema.aliases).toBeDefined();
            expect(Array.isArray(schema.aliases)).toBe(true);
            expect(schema.aliases!.length).toBeGreaterThan(0);
        }
    });

    it('字段类型应该正确', () => {
        expect(TRADE_SCHEMA.date.type).toBe("date");
        expect(TRADE_SCHEMA.pnl.type).toBe("number");
        expect(TRADE_SCHEMA.outcome.type).toBe("enum");
        expect(TRADE_SCHEMA.ticker.type).toBe("string");
        expect(TRADE_SCHEMA.patternsObserved.type).toBe("array");
    });
});

// 导出测试对象（避免未使用警告）
export const schemaTests = {
    TRADE_SCHEMA
};

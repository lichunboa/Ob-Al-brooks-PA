import { SchemaValidator } from '../schema-validator';

describe('SchemaValidator (Zod Implementation)', () => {
    const validator = new SchemaValidator();

    test('validates a correct record', () => {
        const result = validator.validateRecord({
            date: new Date(),
            pnl: 100,
            outcome: 'win',
            accountType: 'Live'
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('handles aliases correctly', () => {
        const result = validator.validateRecord({
            // @ts-ignore
            '日期': '2023-01-01',
            'net_profit': 200,
            'result': 'win',
            '账户': 'Demo'
        });
        expect(result.valid).toBe(true);
    });

    test('coerces string numbers', () => {
        const result = validator.validateRecord({
            date: new Date(),
            // @ts-ignore
            pnl: "500",
            outcome: 'win',
            accountType: 'Live'
        });
        expect(result.valid).toBe(true);
    });

    test('detects invalid enum values', () => {
        const result = validator.validateRecord({
            date: new Date(),
            pnl: 100,
            // @ts-ignore
            outcome: 'invalid_outcome',
            accountType: 'Live'
        });
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain("Invalid enum value");
    });

    test('detects missing required fields', () => {
        const result = validator.validateRecord({
            pnl: 100
        });
        expect(result.valid).toBe(false);
        // Zod reports required errors
    });
});

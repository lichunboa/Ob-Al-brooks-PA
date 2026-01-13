/**
 * 类型定义测试
 * 用于验证所有类型定义是否正确
 */

import type {
    ActionResult,
    BatchActionResult,
    ActionOptions,
    ValidationError,
    FieldSchema,
    RecordSchema,
    ValidationResult
} from "../types";

// 测试 ActionResult
const testResult: ActionResult = {
    success: true,
    message: "测试成功",
    changes: {
        before: { pnl: 2.0 },
        after: { pnl: 2.5 }
    },
    errors: []
};

// 测试 BatchActionResult
const testBatchResult: BatchActionResult = {
    total: 10,
    succeeded: 9,
    failed: 1,
    results: [testResult]
};

// 测试 ActionOptions
const testOptions: ActionOptions = {
    dryRun: true,
    validate: true,
    recordHistory: true
};

// 测试 ValidationError
const testError: ValidationError = {
    field: "pnl",
    message: "必须是数字",
    value: "invalid"
};

// 测试 FieldSchema
const testFieldSchema: FieldSchema = {
    type: "number",
    required: true,
    min: 0,
    canonicalName: "盈亏/net_profit",
    aliases: ["pnl", "net_profit", "r"]
};

// 测试 RecordSchema
const testRecordSchema: RecordSchema = {
    pnl: testFieldSchema
};

// 测试 ValidationResult
const testValidationResult: ValidationResult = {
    valid: false,
    errors: [testError]
};

// 导出测试对象（避免未使用警告）
export const typeTests = {
    testResult,
    testBatchResult,
    testOptions,
    testError,
    testFieldSchema,
    testRecordSchema,
    testValidationResult
};

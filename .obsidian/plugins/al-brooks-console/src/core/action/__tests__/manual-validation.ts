/**
 * 手动验证TRADE_SCHEMA
 * 这个文件用于验证Schema定义，不需要测试框架
 */

import { TRADE_SCHEMA, SchemaValidator } from "../schema-validator";

// 验证Schema定义
console.log("=== TRADE_SCHEMA 验证 ===");
console.log("核心字段数量:", Object.keys(TRADE_SCHEMA).length);
console.log("必填字段:", Object.entries(TRADE_SCHEMA)
    .filter(([_, schema]) => schema.required)
    .map(([name]) => name)
);

// 验证getFieldSchema方法
const validator = new SchemaValidator();

// 测试规范名称
const pnlSchema = validator.getFieldSchema("pnl");
console.log("\n=== getFieldSchema 测试 ===");
console.log("通过'pnl'查找:", pnlSchema?.canonicalName);

// 测试别名
const netProfitSchema = validator.getFieldSchema("net_profit");
console.log("通过'net_profit'查找:", netProfitSchema?.canonicalName);

// 测试中文别名
const yingkuiSchema = validator.getFieldSchema("盈亏");
console.log("通过'盈亏'查找:", yingkuiSchema?.canonicalName);

// 验证所有字段都有规范名称和别名
let allValid = true;
for (const [key, schema] of Object.entries(TRADE_SCHEMA)) {
    if (!schema.canonicalName || !schema.aliases || schema.aliases.length === 0) {
        console.error(`字段 ${key} 缺少规范名称或别名`);
        allValid = false;
    }
}

console.log("\n所有字段验证:", allValid ? "✅ 通过" : "❌ 失败");

export const manualValidation = {
    TRADE_SCHEMA,
    validator
};

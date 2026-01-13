/**
 * ActionService 核心类型定义
 * 
 * 这个文件定义了ActionService所需的所有TypeScript类型
 */

import type { TradeRecord } from "../contracts";

/**
 * 操作结果
 */
export interface ActionResult {
    /** 操作是否成功 */
    success: boolean;
    /** 结果消息 */
    message?: string;
    /** 变更详情 (before/after) */
    changes?: {
        before: Record<string, unknown>;
        after: Record<string, unknown>;
    };
    /** 验证错误列表 */
    errors?: ValidationError[];
    /** 用于风控等额外信息 */
    details?: any;
}

/**
 * 批量操作结果
 */
export interface BatchActionResult {
    /** 总数 */
    total: number;
    /** 成功数 */
    succeeded: number;
    /** 失败数 */
    failed: number;
    /** 每个操作的结果 */
    results: ActionResult[];
    /** 执行时间(ms) */
    duration: number;
}

/**
 * 操作选项
 */
export interface ActionOptions {
    /** 仅预览，不实际修改 */
    dryRun?: boolean;
    /** 是否验证数据 (默认true) */
    validate?: boolean;
    /** 是否记录历史 (默认true) */
    recordHistory?: boolean;
}

/**
 * 验证错误
 */
export interface ValidationError {
    /** 字段名 */
    field: string;
    /** 错误消息 */
    message: string;
    /** 当前值 */
    value?: unknown;
}

/**
 * 字段Schema定义
 */
export interface FieldSchema {
    /** 字段类型 */
    type: "string" | "number" | "enum" | "array" | "date";
    /** 是否必填 */
    required?: boolean;
    /** 枚举值 (type为enum时) */
    enum?: string[];
    /** 最小值 (type为number时) */
    min?: number;
    /** 最大值 (type为number时) */
    max?: number;
    /** 正则验证 (type为string时) */
    pattern?: RegExp;
    /** 字段别名列表 */
    aliases?: string[];
    /** 规范名称 (用于写入) */
    canonicalName: string;
}

/**
 * 记录Schema (字段名 -> 字段Schema)
 */
export type RecordSchema = Record<string, FieldSchema>;

/**
 * 批量更新项
 */
export interface BatchUpdateItem {
    path: string;                    // 文件路径
    updates: Partial<TradeRecord>;   // 更新内容
}

/**
 * 操作记录
 */
export interface ChangeLogEntry {
    id: string;              // 唯一ID
    timestamp: number;       // 时间戳
    operation: 'update' | 'batchUpdate'; // 操作类型
    files: string[];         // 影响的文件
    changes: {
        path: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
    }[];
    success: boolean;        // 是否成功
    canUndo: boolean;        // 是否可撤销
}

/**
 * 操作历史
 */
export interface ChangeLog {
    entries: ChangeLogEntry[];
    maxEntries: number;      // 最大保留数量
}

/**
 * 验证结果
 */
export interface ValidationResult {
    /** 是否通过验证 */
    valid: boolean;
    /** 错误列表 */
    errors: ValidationError[];
}

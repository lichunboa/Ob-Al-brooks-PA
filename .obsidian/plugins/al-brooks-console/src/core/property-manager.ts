/**
 * 属性管理器核心服务 (Property Manager Service)
 * 
 * 基于老版本 pa-view-manager.js V18 Crystal Edition 重构
 * 提供属性扫描、分组、批量操作功能
 */

import type { App, TFile } from "obsidian";

// ============================================
// 类型定义
// ============================================

export interface PropertyValue {
    value: string;
    paths: string[];
}

export interface PropertyStats {
    key: string;
    valueCount: number;
    fileCount: number;
    values: PropertyValue[];
}

export interface PropertyGroup {
    name: string;
    icon: string;
    properties: PropertyStats[];
}

export type BatchOperationType =
    | 'RENAME_KEY'
    | 'DELETE_KEY'
    | 'UPDATE_VAL'
    | 'APPEND_VAL'
    | 'DELETE_VAL'
    | 'INJECT_PROP';

export interface BatchOperation {
    type: BatchOperationType;
    key?: string;
    oldKey?: string;
    newKey?: string;
    oldVal?: string;
    newVal?: string;
    val?: string;
}

export interface BatchResult {
    success: number;
    failed: { path: string; error: string }[];
}

// ============================================
// 分组配置 (沿用老版本)
// ============================================

export const GROUP_CONFIG: Record<string, string[]> = {
    "⭐ 核心要素 (Core)": [
        "status", "date", "ticker", "profit", "outcome", "strategy", "net"
    ],
    "📊 量化数据 (Data)": [
        "price", "entry", "exit", "risk", "amount", "r_", "cycle", "direction", "timeframe"
    ],
    "🏷️ 归档信息 (Meta)": [
        "tag", "source", "alias", "type", "class", "time", "week", "categories", "cover"
    ],
};

// ============================================
// 工具函数
// ============================================

/**
 * 规范化属性值
 */
function normalizeVal(v: any): string {
    if (v === undefined || v === null) return "null";

    if (typeof v === "string") {
        const s = v.trim();
        return s === "" ? "Empty" : s;
    }

    if (typeof v === "number" || typeof v === "boolean") {
        return String(v);
    }

    if (Array.isArray(v)) {
        return v.map(normalizeVal).join(", ");
    }

    if (typeof v === "object") {
        // 处理 Obsidian Link 对象
        if (typeof v.path === "string") return v.path;
        if (v.link && typeof v.link.path === "string") return v.link.path;

        try {
            const s = v.toString ? String(v.toString()).trim() : "";
            if (s && s !== "[object Object]") return s;
        } catch (e) { }

        try {
            const s = JSON.stringify(v);
            return s && s !== "{}" ? s : "Object";
        } catch (e) {
            return "Object";
        }
    }

    const s = String(v).trim();
    return s === "" ? "Empty" : s;
}

/**
 * 规范化比较
 */
function normEq(a: any, b: any): boolean {
    return normalizeVal(a) === normalizeVal(b);
}

/**
 * 数组包含检查
 */
function arrHas(arr: any[], v: any): boolean {
    return Array.isArray(arr) && arr.some(x => normEq(x, v));
}

// ============================================
// PropertyManagerService
// ============================================

export class PropertyManagerService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 扫描所有文件的 frontmatter 属性
     */
    async scanProperties(): Promise<{ keyMap: Record<string, string[]>, valMap: Record<string, Record<string, string[]>> }> {
        const keyMap: Record<string, string[]> = {};
        const valMap: Record<string, Record<string, string[]>> = {};

        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache || !cache.frontmatter) continue;

            for (const key in cache.frontmatter) {
                if (key === "position") continue; // 跳过内部字段

                // 记录 key → paths
                if (!keyMap[key]) keyMap[key] = [];
                keyMap[key].push(file.path);

                // 记录 key → value → paths
                if (!valMap[key]) valMap[key] = {};

                const rawValue = cache.frontmatter[key];
                const vals = Array.isArray(rawValue) ? rawValue : [rawValue];

                for (const v of vals) {
                    const s = normalizeVal(v);
                    if (!valMap[key][s]) valMap[key][s] = [];
                    valMap[key][s].push(file.path);
                }
            }
        }

        return { keyMap, valMap };
    }

    /**
     * 按分组配置整理属性
     */
    groupProperties(keyMap: Record<string, string[]>, valMap: Record<string, Record<string, string[]>>): PropertyGroup[] {
        const assignedKeys = new Set<string>();
        const groups: PropertyGroup[] = [];

        // 按配置分组
        for (const [groupName, keywords] of Object.entries(GROUP_CONFIG)) {
            const properties: PropertyStats[] = [];

            Object.keys(keyMap).sort().forEach(key => {
                if (assignedKeys.has(key)) return;

                const isMatch = keywords.some(kw =>
                    key.toLowerCase().includes(kw.toLowerCase())
                );

                if (isMatch) {
                    const values = valMap[key] || {};
                    properties.push({
                        key,
                        valueCount: Object.keys(values).length,
                        fileCount: keyMap[key].length,
                        values: Object.entries(values)
                            .sort((a, b) => b[1].length - a[1].length)
                            .map(([value, paths]) => ({ value, paths }))
                    });
                    assignedKeys.add(key);
                }
            });

            if (properties.length > 0) {
                groups.push({
                    name: groupName,
                    icon: groupName.split(" ")[0],
                    properties
                });
            }
        }

        // 其他属性
        const otherProperties: PropertyStats[] = [];
        Object.keys(keyMap).sort().forEach(key => {
            if (!assignedKeys.has(key)) {
                const values = valMap[key] || {};
                otherProperties.push({
                    key,
                    valueCount: Object.keys(values).length,
                    fileCount: keyMap[key].length,
                    values: Object.entries(values)
                        .sort((a, b) => b[1].length - a[1].length)
                        .map(([value, paths]) => ({ value, paths }))
                });
            }
        });

        if (otherProperties.length > 0) {
            groups.push({
                name: "📂 其他属性 (Others)",
                icon: "📂",
                properties: otherProperties
            });
        }

        return groups;
    }

    /**
     * 批量更新操作
     */
    async batchUpdate(paths: string[], operation: BatchOperation): Promise<BatchResult> {
        const result: BatchResult = { success: 0, failed: [] };

        for (const path of paths) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof this.app.vault.adapter.constructor)) {
                // 跳过无效文件
                continue;
            }

            try {
                await this.app.fileManager.processFrontMatter(file as TFile, (fm) => {
                    let changed = false;

                    switch (operation.type) {
                        case 'RENAME_KEY':
                            if (operation.oldKey && operation.newKey && fm[operation.oldKey] !== undefined) {
                                if (fm[operation.newKey] === undefined || operation.newKey === operation.oldKey) {
                                    fm[operation.newKey] = fm[operation.oldKey];
                                    if (operation.newKey !== operation.oldKey) {
                                        delete fm[operation.oldKey];
                                    }
                                    changed = operation.newKey !== operation.oldKey;
                                }
                            }
                            break;

                        case 'DELETE_KEY':
                            if (operation.key && fm[operation.key] !== undefined) {
                                delete fm[operation.key];
                                changed = true;
                            }
                            break;

                        case 'UPDATE_VAL':
                            if (operation.key && operation.oldVal && operation.newVal) {
                                const current = fm[operation.key];
                                if (Array.isArray(current)) {
                                    const idx = current.findIndex(v => normEq(v, operation.oldVal));
                                    if (idx !== -1) {
                                        current[idx] = operation.newVal;
                                        changed = true;
                                    }
                                } else if (current !== undefined && normEq(current, operation.oldVal)) {
                                    fm[operation.key] = operation.newVal;
                                    changed = true;
                                }
                            }
                            break;

                        case 'APPEND_VAL':
                            if (operation.key && operation.val) {
                                const current = fm[operation.key];
                                if (current === undefined) {
                                    fm[operation.key] = operation.val;
                                    changed = true;
                                } else if (Array.isArray(current)) {
                                    if (!arrHas(current, operation.val)) {
                                        current.push(operation.val);
                                        changed = true;
                                    }
                                } else if (!normEq(current, operation.val)) {
                                    fm[operation.key] = [current, operation.val];
                                    changed = true;
                                }
                            }
                            break;

                        case 'DELETE_VAL':
                            if (operation.key && operation.val) {
                                const current = fm[operation.key];
                                if (Array.isArray(current)) {
                                    const next = current.filter(v => !normEq(v, operation.val));
                                    if (next.length !== current.length) {
                                        fm[operation.key] = next;
                                        changed = true;
                                    }
                                } else if (current !== undefined && normEq(current, operation.val)) {
                                    delete fm[operation.key];
                                    changed = true;
                                }
                            }
                            break;

                        case 'INJECT_PROP':
                            if (operation.newKey && operation.newVal) {
                                if (fm[operation.newKey] === undefined) {
                                    fm[operation.newKey] = operation.newVal;
                                    changed = true;
                                } else {
                                    const current = fm[operation.newKey];
                                    if (Array.isArray(current)) {
                                        if (!arrHas(current, operation.newVal)) {
                                            current.push(operation.newVal);
                                            changed = true;
                                        }
                                    } else if (!normEq(current, operation.newVal)) {
                                        fm[operation.newKey] = [current, operation.newVal];
                                        changed = true;
                                    }
                                }
                            }
                            break;
                    }

                    if (changed) {
                        result.success++;
                    }
                });
            } catch (e: any) {
                result.failed.push({ path, error: e.message || String(e) });
            }
        }

        return result;
    }

    /**
     * 搜索属性
     */
    searchProperties(
        groups: PropertyGroup[],
        term: string
    ): PropertyGroup[] {
        if (!term.trim()) return groups;

        const lowerTerm = term.toLowerCase();

        return groups.map(group => ({
            ...group,
            properties: group.properties.filter(prop =>
                prop.key.toLowerCase().includes(lowerTerm) ||
                prop.values.some(v => v.value.toLowerCase().includes(lowerTerm))
            )
        })).filter(group => group.properties.length > 0);
    }
}

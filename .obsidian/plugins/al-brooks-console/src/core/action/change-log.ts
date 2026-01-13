/**
 * ChangeLogManager - 操作历史管理器
 * 
 * 负责记录所有数据修改操作,支持撤销和审计
 */

import type { ChangeLogEntry } from "./types";

export class ChangeLogManager {
    private entries: ChangeLogEntry[] = [];
    private maxEntries = 100;

    /**
     * 记录操作
     * 
     * @param entry 操作详情(不含id和timestamp)
     * @returns 新生成的记录ID
     */
    record(entry: Omit<ChangeLogEntry, 'id' | 'timestamp'>): string {
        const id = this.generateId();
        const fullEntry: ChangeLogEntry = {
            ...entry,
            id,
            timestamp: Date.now()
        };

        // 添加到头部 (最新的在最前)
        this.entries.unshift(fullEntry);

        // 限制数量 (移除最旧的)
        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(0, this.maxEntries);
        }

        return id;
    }

    /**
     * 获取历史记录
     * 
     * @param limit 获取数量限制
     * @returns 历史记录列表
     */
    getEntries(limit = 20): ChangeLogEntry[] {
        return this.entries.slice(0, limit);
    }

    /**
     * 查找特定记录
     * 
     * @param id 记录ID
     * @returns 记录详情或undefined
     */
    getEntry(id: string): ChangeLogEntry | undefined {
        return this.entries.find(e => e.id === id);
    }

    /**
     * 清空历史记录
     */
    clear(): void {
        this.entries = [];
    }

    /**
     * 生成唯一ID
     */
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

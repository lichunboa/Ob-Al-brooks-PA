/**
 * ActionService - 数据写入服务
 * 
 * 提供安全的数据写入能力，支持:
 * - 单个/批量更新
 * - 数据验证
 * - Dry Run预览
 * - 操作历史记录
 */

import type { App } from "obsidian";
import { TFile } from "obsidian";
import type { TradeRecord } from "../contracts";
import type { ActionResult, ActionOptions, BatchActionResult } from "./types";
import { SchemaValidator, TRADE_SCHEMA } from "./schema-validator";
import { FrontmatterUpdater } from "./frontmatter-updater";
import { ChangeLogManager } from "./change-log";
import type { ChangeLogEntry } from "./types";

export class ActionService {
    private app: App;
    private validator: SchemaValidator;
    private updater: FrontmatterUpdater;
    private changeLog: ChangeLogManager;

    constructor(app: App) {
        this.app = app;
        this.validator = new SchemaValidator();
        this.updater = new FrontmatterUpdater(app, this.validator);
        this.changeLog = new ChangeLogManager();
    }

    /**
     * 更新单个交易记录
     */
    async updateTrade(
        path: string,
        updates: Partial<TradeRecord>,
        options: ActionOptions = {}
    ): Promise<ActionResult> {
        try {
            // 1. 获取文件
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    message: `文件不存在: ${path}`
                };
            }

            // 2. 读取内容
            const content = await this.app.vault.read(file);
            const { frontmatter, body } = this.updater.parseFrontmatter(content);

            // 3. 应用更新 (使用规范名称)
            const updated = this.updater.applyUpdates(frontmatter, updates);

            // 4. 验证合并后的记录 (如果启用验证)
            if (options.validate !== false) {
                const validation = this.validator.validateRecord(
                    updated,  // 验证合并后的完整记录
                    TRADE_SCHEMA
                );
                if (!validation.valid) {
                    return {
                        success: false,
                        message: '数据验证失败',
                        errors: validation.errors
                    };
                }
            }

            // 5. 序列化
            const newContent = this.updater.serializeFrontmatter(updated, body);

            // 6. 写入文件 (如果不是Dry Run)
            if (!options.dryRun) {
                await this.app.vault.modify(file, newContent);
            }

            const result = {
                success: true,
                message: options.dryRun ? '预览成功 (未实际修改)' : '更新成功',
                changes: {
                    before: frontmatter,
                    after: updated
                }
            };

            // 7. 记录操作历史 (仅在非 DryRun 且成功时)
            if (!options.dryRun && options.recordHistory !== false) {
                this.changeLog.record({
                    operation: 'update',
                    files: [path],
                    changes: [{
                        path,
                        before: frontmatter,
                        after: updated
                    }],
                    success: true,
                    canUndo: true
                });
            }

            return result;
        } catch (e) {
            return {
                success: false,
                message: `更新失败: ${e instanceof Error ? e.message : String(e)}`
            };
        }
    }

    /**
     * 获取操作历史
     */
    getChangeLog(limit = 20): ChangeLogEntry[] {
        return this.changeLog.getEntries(limit);
    }

    /**
     * 撤销操作
     * 
     * @param entryId 操作记录ID
     */
    async undo(entryId: string): Promise<ActionResult> {
        const entry = this.changeLog.getEntry(entryId);

        if (!entry) {
            return {
                success: false,
                message: '未找到操作记录'
            };
        }

        if (!entry.canUndo) {
            return {
                success: false,
                message: '该操作不支持撤销'
            };
        }

        // 恢复所有文件到之前的状态
        const results: ActionResult[] = [];

        for (const change of entry.changes) {
            const result = await this.restoreFile(
                change.path,
                change.before
            );
            results.push(result);
        }

        const allSuccess = results.every(r => r.success);

        return {
            success: allSuccess,
            message: allSuccess ? '撤销成功' : '部分撤销失败',
            errors: results
                .filter(r => !r.success)
                .flatMap(r => r.errors || [])
        };
    }

    /**
     * 恢复文件到指定状态
     */
    private async restoreFile(
        path: string,
        frontmatter: Record<string, unknown>
    ): Promise<ActionResult> {
        try {
            // 1. 获取文件
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    message: `文件不存在: ${path}`
                };
            }

            // 2. 读取原始内容
            const content = await this.app.vault.read(file);
            const { body } = this.updater.parseFrontmatter(content);

            // 3. 序列化 (直接使用before状态的frontmatter)
            const newContent = this.updater.serializeFrontmatter(frontmatter, body);

            // 4. 写入文件
            await this.app.vault.modify(file, newContent);

            return {
                success: true,
                message: '恢复成功'
            };
        } catch (e) {
            return {
                success: false,
                message: `恢复失败: ${e instanceof Error ? e.message : String(e)}`
            };
        }
    }

    /**
     * 批量更新交易记录
     * 
     * @param items 批量更新项列表
     * @param options 操作选项
     * @returns 批量操作结果
     */
    async batchUpdateTrades(
        items: Array<{ path: string; updates: Partial<TradeRecord> }>,
        options: ActionOptions = {}
    ): Promise<BatchActionResult> {
        const startTime = Date.now();
        const results: ActionResult[] = [];
        const chunkSize = 50;

        // 分批处理,避免内存溢出
        for (let i = 0; i < items.length; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize);

            // 并行处理一批
            const chunkResults = await Promise.all(
                chunk.map(item =>
                    this.updateTrade(item.path, item.updates, options)
                        .catch(error => ({
                            success: false,
                            message: `批量更新失败: ${error instanceof Error ? error.message : String(error)}`,
                            errors: [{
                                field: 'batch',
                                message: error instanceof Error ? error.message : String(error)
                            }]
                        }))
                )
            );

            results.push(...chunkResults);

            // 进度日志
            const progress = Math.min(100,
                Math.round((i + chunk.length) / items.length * 100)
            );
            console.log(`[ActionService] 批量更新进度: ${progress}% (${i + chunk.length}/${items.length})`);
        }

        const duration = Date.now() - startTime;

        return {
            total: items.length,
            succeeded: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results,
            duration
        };
    }

    /**
     * 创建新交易记录
     */
    async createTrade(
        data: TradeRecord,
        options: ActionOptions = {}
    ): Promise<ActionResult> {
        // TODO: 实现
        return {
            success: false,
            message: "Not implemented yet"
        };
    }

    /**
     * 删除交易记录
     */
    async deleteTrade(
        path: string,
        options: ActionOptions = {}
    ): Promise<ActionResult> {
        // TODO: 实现
        return {
            success: false,
            message: "Not implemented yet"
        };
    }

    /**
     * 切换计划清单项的完成状态
     */
    async togglePlanChecklistItem(
        notePath: string,
        itemIndex: number
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) {
            throw new Error(`文件不存在: ${notePath}`);
        }

        const content = await this.app.vault.read(file);
        const { frontmatter, body } = this.updater.parseFrontmatter(content);

        // 切换checkbox状态
        if (!frontmatter.checklist || !Array.isArray(frontmatter.checklist)) {
            throw new Error("清单不存在");
        }

        if (itemIndex < 0 || itemIndex >= frontmatter.checklist.length) {
            throw new Error(`清单项索引越界: ${itemIndex}`);
        }

        const item = frontmatter.checklist[itemIndex];
        item.done = !item.done;

        // 写回文件
        const newContent = this.updater.serializeFrontmatter(frontmatter, body);
        await this.app.vault.modify(file, newContent);
    }

    /**
     * 更新计划的风险限制
     */
    async updatePlanRiskLimit(
        notePath: string,
        riskLimit: number
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) {
            throw new Error(`文件不存在: ${notePath}`);
        }

        const content = await this.app.vault.read(file);
        const { frontmatter, body } = this.updater.parseFrontmatter(content);

        // 更新风险限制
        frontmatter.riskLimit = riskLimit;

        // 写回文件
        const newContent = this.updater.serializeFrontmatter(frontmatter, body);
        await this.app.vault.modify(file, newContent);
    }

    /**
     * 追加到session_log数组
     * 用于记录盘中情绪、笔记等实时信息
     */
    async appendToSessionLog(
        notePath: string,
        entry: string
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) {
            throw new Error(`文件不存在: ${notePath}`);
        }

        const content = await this.app.vault.read(file);
        const { frontmatter, body } = this.updater.parseFrontmatter(content);

        // 追加到session_log数组
        if (!frontmatter.session_log) {
            frontmatter.session_log = [];
        }
        if (!Array.isArray(frontmatter.session_log)) {
            frontmatter.session_log = [frontmatter.session_log];
        }
        (frontmatter.session_log as string[]).push(entry);

        // 写回文件
        const newContent = this.updater.serializeFrontmatter(frontmatter, body);
        await this.app.vault.modify(file, newContent);
    }
}

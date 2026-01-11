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

export class ActionService {
    private app: App;
    private validator: SchemaValidator;
    private updater: FrontmatterUpdater;

    constructor(app: App) {
        this.app = app;
        this.validator = new SchemaValidator();
        this.updater = new FrontmatterUpdater(app, this.validator);
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

            // 3. 验证更新数据 (如果启用验证)
            if (options.validate !== false) {
                const validation = this.validator.validateRecord(
                    updates,
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

            // 4. 应用更新 (使用规范名称)
            const updated = this.updater.applyUpdates(frontmatter, updates);

            // 5. 序列化
            const newContent = this.updater.serializeFrontmatter(updated, body);

            // 6. 写入文件 (如果不是Dry Run)
            if (!options.dryRun) {
                await this.app.vault.modify(file, newContent);
            }

            // 7. 返回结果
            return {
                success: true,
                message: options.dryRun ? '预览成功 (未实际修改)' : '更新成功',
                changes: {
                    before: frontmatter,
                    after: updated
                }
            };
        } catch (e) {
            return {
                success: false,
                message: `更新失败: ${e instanceof Error ? e.message : String(e)}`
            };
        }
    }

    /**
     * 批量更新交易记录
     */
    async batchUpdateTrades(
        updates: Array<{ path: string; updates: Partial<TradeRecord> }>,
        options: ActionOptions = {}
    ): Promise<BatchActionResult> {
        // TODO: 实现
        return {
            total: 0,
            succeeded: 0,
            failed: 0,
            results: []
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
}

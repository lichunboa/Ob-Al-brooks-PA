/**
 * TodayPlanContext - 今日计划上下文
 * 
 * 负责读取和更新今日日记中的计划数据
 * 数据存储在每日日记的frontmatter中
 */

import { App, TFile } from "obsidian";
import type { ActionResult } from "./action/types";
import { ActionService } from "./action/action-service";
import { FrontmatterUpdater } from "./action/frontmatter-updater";
import { SchemaValidator } from "./action/schema-validator";

/**
 * 计划检查项
 */
export interface PlanChecklistItem {
    text: string;
    done: boolean;
}

/**
 * 每日计划数据结构
 */
export interface DailyPlan {
    date: string; // YYYY-MM-DD
    focusSymbols: string[]; // 关注品种
    strategies: string[]; // 计划策略
    riskLimit: number; // 最大亏损限制 (R倍数)
    maxTrades: number; // 最大交易数
    notes: string; // 计划备注
    checklist: PlanChecklistItem[]; // 检查清单
}

/**
 * 今日计划上下文类
 */
export class TodayPlanContext {
    private app: App;
    private actionService: ActionService;
    private updater: FrontmatterUpdater;

    constructor(app: App) {
        this.app = app;
        const validator = new SchemaValidator();
        this.actionService = new ActionService(app);
        this.updater = new FrontmatterUpdater(app, validator);
    }

    /**
     * 获取今日日记文件
     */
    private getTodayJournalFile(): TFile | null {
        const today = window.moment().format("YYYY-MM-DD");

        // 尝试多个可能的路径
        const possiblePaths = [
            `Daily/${today}.md`,
            `Daily/SPX/${today}.md`,
            `Daily/Trades/${today}.md`,
        ];

        for (const path of possiblePaths) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                return file;
            }
        }

        return null;
    }

    /**
     * 读取今日计划
     */
    async getTodayPlan(): Promise<DailyPlan | null> {
        const todayFile = this.getTodayJournalFile();
        if (!todayFile) {
            return null;
        }

        try {
            const content = await this.app.vault.read(todayFile);
            const { frontmatter } = this.updater.parseFrontmatter(content);

            // 从frontmatter中提取计划数据
            return {
                date: (frontmatter.date as string) || window.moment().format("YYYY-MM-DD"),
                focusSymbols: (frontmatter.plan_focus_symbols as string[]) || [],
                strategies: (frontmatter.plan_strategies as string[]) || [],
                riskLimit: (frontmatter.plan_risk_limit as number) || 3,
                maxTrades: (frontmatter.plan_max_trades as number) || 5,
                notes: (frontmatter.plan_notes as string) || "",
                checklist: (frontmatter.plan_checklist as PlanChecklistItem[]) || []
            };
        } catch (e) {
            console.error("[TodayPlanContext] 读取今日计划失败:", e);
            return null;
        }
    }

    /**
     * 更新计划数据
     */
    async updatePlan(updates: Partial<DailyPlan>): Promise<ActionResult> {
        const todayFile = this.getTodayJournalFile();
        if (!todayFile) {
            return {
                success: false,
                message: "今日日记不存在,请先创建今日日记"
            };
        }

        try {
            // 将DailyPlan字段映射到frontmatter字段
            const frontmatterUpdates: Record<string, any> = {};

            if (updates.focusSymbols !== undefined) {
                frontmatterUpdates.plan_focus_symbols = updates.focusSymbols;
            }
            if (updates.strategies !== undefined) {
                frontmatterUpdates.plan_strategies = updates.strategies;
            }
            if (updates.riskLimit !== undefined) {
                frontmatterUpdates.plan_risk_limit = updates.riskLimit;
            }
            if (updates.maxTrades !== undefined) {
                frontmatterUpdates.plan_max_trades = updates.maxTrades;
            }
            if (updates.notes !== undefined) {
                frontmatterUpdates.plan_notes = updates.notes;
            }
            if (updates.checklist !== undefined) {
                frontmatterUpdates.plan_checklist = updates.checklist;
            }

            // 使用ActionService更新
            return await this.actionService.updateTrade(
                todayFile.path,
                frontmatterUpdates,
                { validate: false } // 不验证,因为这不是交易记录
            );
        } catch (e) {
            return {
                success: false,
                message: `更新计划失败: ${e instanceof Error ? e.message : String(e)}`
            };
        }
    }

    /**
     * 切换检查清单项的完成状态
     */
    async toggleChecklistItem(index: number): Promise<ActionResult> {
        const plan = await this.getTodayPlan();
        if (!plan) {
            return {
                success: false,
                message: "今日计划不存在"
            };
        }

        if (!plan.checklist || index < 0 || index >= plan.checklist.length) {
            return {
                success: false,
                message: "检查清单项不存在"
            };
        }

        // 创建新的checklist数组,切换指定项的done状态
        const newChecklist = [...plan.checklist];
        newChecklist[index] = {
            ...newChecklist[index],
            done: !newChecklist[index].done
        };

        return await this.updatePlan({ checklist: newChecklist });
    }

    /**
     * 更新风险限制
     */
    async updateRiskLimit(riskLimit: number): Promise<ActionResult> {
        if (riskLimit <= 0) {
            return {
                success: false,
                message: "风险限制必须大于0"
            };
        }

        return await this.updatePlan({ riskLimit });
    }

    /**
     * 更新最大交易数
     */
    async updateMaxTrades(maxTrades: number): Promise<ActionResult> {
        if (maxTrades <= 0) {
            return {
                success: false,
                message: "最大交易数必须大于0"
            };
        }

        return await this.updatePlan({ maxTrades });
    }

    /**
     * 添加Flash Log记录
     */
    async addFlashLog(log: {
        timestamp: string;
        content: string;
        tags: string[];
    }): Promise<ActionResult> {
        const todayFile = this.getTodayJournalFile();
        if (!todayFile) {
            return {
                success: false,
                message: "今日日记不存在"
            };
        }

        try {
            const content = await this.app.vault.read(todayFile);

            // 格式化Flash Log条目
            const time = new Date(log.timestamp).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit"
            });
            const tagsStr = log.tags.length > 0
                ? ` ${log.tags.map(t => `#${t}`).join(" ")}`
                : "";
            const logEntry = `- **${time}**: ${log.content}${tagsStr}\n`;

            // 查找插入位置 (在"今日战况"章节之前)
            const insertMarker = "# ⚔️ 2. 今日战况";
            const insertIndex = content.indexOf(insertMarker);

            let newContent: string;
            if (insertIndex !== -1) {
                // 在"今日战况"之前插入
                newContent = content.slice(0, insertIndex) +
                    `\n### ⚡ Flash Log\n\n${logEntry}\n` +
                    content.slice(insertIndex);
            } else {
                // 如果找不到标记,追加到文件末尾
                newContent = content + `\n\n### ⚡ Flash Log\n\n${logEntry}`;
            }

            await this.app.vault.modify(todayFile, newContent);

            return {
                success: true,
                message: "Flash Log记录成功"
            };
        } catch (e) {
            return {
                success: false,
                message: `记录失败: ${e instanceof Error ? e.message : String(e)}`
            };
        }
    }
}

import { useMemo, useCallback } from "react";
import { Notice, type App } from "obsidian";
import type { TradeIndex } from "../core/trade-index";
import { ActionService } from "../core/action/action-service";

export const useDashboardActions = (app: any, index: TradeIndex) => {
    const actionService = useMemo(() => {
        // 确保 app 存在
        if (!app) return null;
        return new ActionService(app);
    }, [app]);

    /**
     * 获取今日笔记路径
     */
    const getTodayNotePath = useCallback((): string | null => {
        const today = new Date().toISOString().split('T')[0];
        return `📓 每日日记/${today}.md`;
    }, []);

    /**
     * 处理计划清单项切换
     */
    const handleToggleChecklistItem = useCallback(async (itemIndex: number): Promise<void> => {
        if (!actionService) return;
        try {
            const todayNote = getTodayNotePath();
            if (!todayNote) {
                new Notice('未找到今日笔记');
                return;
            }

            await actionService.togglePlanChecklistItem(todayNote, itemIndex);

            // 刷新索引
            if (index.rebuild) {
                await index.rebuild();
            }

            new Notice('✅ 已更新');
        } catch (error) {
            console.error('切换清单项失败:', error);
            new Notice(`❌ 更新失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [actionService, getTodayNotePath, index]);

    /**
     * 处理风险限制更新
     */
    const handleUpdateRiskLimit = useCallback(async (riskLimit: number): Promise<void> => {
        if (!actionService) return;
        try {
            const todayNote = getTodayNotePath();
            if (!todayNote) {
                new Notice('未找到今日笔记');
                return;
            }

            await actionService.updatePlanRiskLimit(todayNote, riskLimit);

            // 刷新索引
            if (index.rebuild) {
                await index.rebuild();
            }

            new Notice(`✅ 风险限制已更新为 ${riskLimit}R`);
        } catch (error) {
            console.error('更新风险限制失败:', error);
            new Notice(`❌ 更新失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [actionService, getTodayNotePath, index]);

    return {
        handleToggleChecklistItem,
        handleUpdateRiskLimit
    };
};

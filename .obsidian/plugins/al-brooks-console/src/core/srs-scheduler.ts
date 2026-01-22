/**
 * SRS 调度算法 (基于 obsidian-spaced-repetition)
 * MIT License - https://github.com/st3v3nmw/obsidian-spaced-repetition
 * 
 * 简化版本，用于计算复习后的新间隔和难度分数
 */

/**
 * 复习响应类型
 */
export enum ReviewResponse {
    Easy = 1,   // 简单 - 轻松回忆
    Good = 2,   // 记得 - 正常回忆成功
    Hard = 3,   // 较难 - 勉强记得
    Again = 4,  // 重来 - 完全忘记
}

/**
 * 卡片调度信息
 */
export interface CardSchedule {
    dueDate: string;      // 下次复习日期 (YYYY-MM-DD)
    interval: number;     // 当前间隔（天）
    ease: number;         // 难度分数 (130-310)
}

/**
 * SRS 设置
 */
export interface SrsSettings {
    baseEase: number;         // 初始难度分数 (默认 250)
    maximumInterval: number;  // 最大间隔天数 (默认 36500 = 100年)
    easyBonus: number;        // 简单奖励系数 (默认 1.3)
    lapsesIntervalChange: number; // 较难时间隔变化系数 (默认 0.5)
}

/**
 * 默认设置
 */
export const DEFAULT_SRS_SETTINGS: SrsSettings = {
    baseEase: 250,
    maximumInterval: 36500,
    easyBonus: 1.3,
    lapsesIntervalChange: 0.5,
};

/**
 * 计算新的调度信息
 * 
 * @param response - 用户复习响应
 * @param currentInterval - 当前间隔天数（新卡片为1）
 * @param currentEase - 当前难度分数（新卡片为baseEase）
 * @param settings - SRS设置
 * @returns 新的间隔和难度分数
 */
export function calculateSchedule(
    response: ReviewResponse,
    currentInterval: number,
    currentEase: number,
    settings: SrsSettings = DEFAULT_SRS_SETTINGS
): { interval: number; ease: number } {
    let interval = currentInterval;
    let ease = currentEase;

    switch (response) {
        case ReviewResponse.Easy:
            // 简单：增加难度分数，大幅增加间隔
            ease += 20;
            interval = (interval * ease) / 100;
            interval *= settings.easyBonus;
            break;

        case ReviewResponse.Good:
            // 记得：正常增加间隔
            interval = (interval * ease) / 100;
            break;

        case ReviewResponse.Hard:
            // 较难：减少难度分数，略微增加间隔
            ease = Math.max(130, ease - 20);
            interval = Math.max(1, interval * settings.lapsesIntervalChange);
            break;

        case ReviewResponse.Again:
            // 重来：重置间隔，大幅降低难度分数
            ease = Math.max(130, ease - 60);
            interval = 1;
            break;
    }

    // 限制最大间隔
    interval = Math.min(interval, settings.maximumInterval);
    // 四舍五入到一位小数
    interval = Math.round(interval * 10) / 10;

    return { interval, ease };
}

/**
 * 获取今天的日期字符串 (YYYY-MM-DD)
 */
export function getTodayDateString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * 计算新的调度信息并返回完整 CardSchedule
 */
export function getNewSchedule(
    response: ReviewResponse,
    currentSchedule?: CardSchedule,
    settings: SrsSettings = DEFAULT_SRS_SETTINGS
): CardSchedule {
    const currentInterval = currentSchedule?.interval ?? 1;
    const currentEase = currentSchedule?.ease ?? settings.baseEase;

    const { interval, ease } = calculateSchedule(
        response,
        currentInterval,
        currentEase,
        settings
    );

    // 计算新的到期日期
    const today = new Date();
    today.setDate(today.getDate() + Math.round(interval));
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const dueDate = `${y}-${m}-${d}`;

    return { dueDate, interval, ease };
}

/**
 * 格式化间隔为可读文本
 */
export function formatInterval(interval: number): string {
    if (!interval || interval < 1) return "新卡片";

    if (interval < 30) {
        return `${Math.round(interval)}天`;
    } else if (interval < 365) {
        const months = Math.round(interval / 30 * 10) / 10;
        return `${months}月`;
    } else {
        const years = Math.round(interval / 365 * 10) / 10;
        return `${years}年`;
    }
}

/**
 * 解析 SR 标记格式
 * 格式: <!--SR:!2025-12-22,4,270-->
 */
export function parseSrTag(tag: string): CardSchedule | null {
    const match = tag.match(/<!--SR:!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)-->/);
    if (!match) return null;

    return {
        dueDate: match[1],
        interval: parseInt(match[2], 10),
        ease: parseInt(match[3], 10),
    };
}

/**
 * 生成 SR 标记
 */
export function generateSrTag(schedule: CardSchedule): string {
    return `<!--SR:!${schedule.dueDate},${Math.round(schedule.interval)},${Math.round(schedule.ease)}-->`;
}

/**
 * 预览每个响应的预计间隔
 */
export function previewIntervals(
    currentSchedule?: CardSchedule,
    settings: SrsSettings = DEFAULT_SRS_SETTINGS
): Record<string, string> {
    const responses = [
        { key: "again", response: ReviewResponse.Again },
        { key: "hard", response: ReviewResponse.Hard },
        { key: "good", response: ReviewResponse.Good },
        { key: "easy", response: ReviewResponse.Easy },
    ];

    const result: Record<string, string> = {};
    for (const { key, response } of responses) {
        const newSchedule = getNewSchedule(response, currentSchedule, settings);
        result[key] = formatInterval(newSchedule.interval);
    }

    return result;
}

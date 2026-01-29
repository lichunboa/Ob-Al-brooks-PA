/**
 * SRS 复习结果写入服务
 * 将复习结果写入到笔记文件中的 SR 标记
 */

import { App, TFile } from "obsidian";
import {
    ReviewResponse,
    CardSchedule,
    getNewSchedule,
    generateSrTag,
    DEFAULT_SRS_SETTINGS
} from "./srs-scheduler";

/**
 * 更新卡片在笔记中的 SR 标记
 * 
 * @param app - Obsidian App 实例
 * @param filePath - 笔记文件路径
 * @param cardLine - 卡片所在的原始行内容
 * @param response - 用户复习响应
 * @param currentSchedule - 当前调度信息（可选）
 * @returns 是否更新成功
 */
export async function updateCardSrTag(
    app: App,
    filePath: string,
    cardLine: string,
    response: ReviewResponse,
    currentSchedule?: CardSchedule
): Promise<boolean> {
    try {
        const file = app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            console.error("[SRS Writer] File not found:", filePath);
            return false;
        }

        // 读取文件内容
        const content = await app.vault.read(file);

        // 计算新的调度信息
        const newSchedule = getNewSchedule(response, currentSchedule, DEFAULT_SRS_SETTINGS);
        const newSrTag = generateSrTag(newSchedule);

        // 查找并更新卡片行
        const lines = content.split("\n");
        let updated = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 检查是否是目标卡片行（移除现有 SR 标记后比较）
            const lineWithoutSr = line.replace(/<!--SR:![^>]+-->/g, "").trim();

            // 对于多行卡片，cardLine 可能包含换行符，取第一行作为匹配目标
            const cardFirstLine = cardLine.split("\n")[0].replace(/<!--SR:![^>]+-->/g, "").trim();

            if (lineWithoutSr === cardFirstLine || line.includes(cardFirstLine)) {
                // 移除旧的 SR 标记并添加新的
                const cleanLine = line.replace(/<!--SR:![^>]+-->/g, "").trimEnd();
                lines[i] = cleanLine + " " + newSrTag;
                updated = true;

                console.log("[SRS Writer] Updated line:", {
                    original: line,
                    updated: lines[i],
                    schedule: newSchedule
                });
                break;
            }
        }

        if (!updated) {
            console.warn("[SRS Writer] Card line not found in file:", cardLine);
            return false;
        }

        // 写回文件
        const newContent = lines.join("\n");
        await app.vault.modify(file, newContent);

        console.log("[SRS Writer] Successfully updated SR tag in:", filePath);
        return true;

    } catch (error) {
        console.error("[SRS Writer] Error updating SR tag:", error);
        return false;
    }
}

/**
 * 从卡片行中解析现有的调度信息
 */
export function parseCardScheduleFromLine(line: string): CardSchedule | null {
    const match = line.match(/<!--SR:!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)-->/);
    if (!match) return null;

    return {
        dueDate: match[1],
        interval: parseInt(match[2], 10),
        ease: parseInt(match[3], 10),
    };
}

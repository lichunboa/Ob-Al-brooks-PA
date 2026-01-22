/**
 * SRS 桥接模块
 * 连接 Al Brooks Console 和 obsidian-spaced-repetition 插件
 */

import { App, TFile } from "obsidian";

// SRS 插件类型定义
export interface SRPluginInstance {
    osrAppCore: {
        cardStats?: {
            totalCount: number;  // youngCount + matureCount
            newCount: number;    // 新卡片（未复习）
            youngCount: number;  // 年轻卡片（interval < 32）
            matureCount: number; // 成熟卡片（interval >= 32）
        };
        reviewableDeckTree?: any;
        remainingDeckTree?: any;
    };
    data: {
        settings: SRSettings;
    };
    openFlashcardModalForSingleNote: (file: TFile, mode: any) => Promise<void>;
    reviewByFilePath: (filePath: string, mode?: number) => Promise<boolean>; // 新 API
    sync: () => Promise<void>;
}

export interface SRSettings {
    flashcardTags: string[];
    noteFoldersToIgnore: string[];
    convertHighlightsToClozes: boolean;
    singleLineCardSeparator: string;
    multilineCardSeparator: string;
    baseEase: number;
    maximumInterval: number;
}

export interface SRStats {
    totalCards: number;      // 所有卡片
    reviewedCards: number;   // 已复习过的卡片
    dueCards: number;        // 到期卡片
    newCards: number;        // 新卡片（未复习）
    youngCards: number;      // 年轻卡片
    matureCards: number;     // 成熟卡片
    masteryPct: number;      // 掌握度百分比
    deckTree: any;
}

/**
 * 获取 SRS 插件实例
 */
export function getSRPlugin(app: App): SRPluginInstance | null {
    try {
        const plugins = (app as any).plugins?.plugins;
        return plugins?.["obsidian-spaced-repetition"] ?? null;
    } catch (e) {
        console.error("[SRS Bridge] 获取 SRS 插件失败:", e);
        return null;
    }
}

/**
 * 检查 SRS 插件是否可用
 */
export function isSRPluginAvailable(app: App): boolean {
    return getSRPlugin(app) !== null;
}

/**
 * 获取 SRS 卡片统计
 * @returns SRS 真实统计数据，包含已复习和未复习的区分
 */
export function getSRStats(app: App): SRStats | null {
    const sr = getSRPlugin(app);
    if (!sr?.osrAppCore) {
        console.warn("[SRS Bridge] osrAppCore 不可用");
        return null;
    }

    const core = sr.osrAppCore;
    const stats = core.cardStats;
    const remainingDeck = core.remainingDeckTree;

    if (!stats) {
        console.warn("[SRS Bridge] cardStats 不可用，可能需要先同步");
        return null;
    }

    // SRS 统计：
    // - newCount: 新卡片（从未复习过）
    // - youngCount: 年轻卡片（interval < 32天，已复习过）
    // - matureCount: 成熟卡片（interval >= 32天，掌握良好）
    // - totalCount: youngCount + matureCount（不含 new）

    // 计算到期卡片（从 remainingDeckTree 获取）
    let dueCount = 0;
    if (remainingDeck) {
        dueCount = remainingDeck.getDistinctCardCount?.(true) ?? 0;
    }

    return {
        totalCards: stats.newCount + stats.totalCount, // 所有卡片
        reviewedCards: stats.totalCount, // 已复习过的卡片
        dueCards: dueCount, // 到期卡片
        newCards: stats.newCount, // 新卡片（未复习）
        youngCards: stats.youngCount, // 年轻卡片
        matureCards: stats.matureCount, // 成熟卡片
        deckTree: core.reviewableDeckTree ?? null,
        // 掌握度 = 成熟卡片 / 已复习卡片
        masteryPct: stats.totalCount > 0
            ? Math.round((stats.matureCount / stats.totalCount) * 100)
            : 0,
    };
}

/**
 * 获取 SRS 设置
 */
export function getSRSettings(app: App): SRSettings | null {
    const sr = getSRPlugin(app);
    return sr?.data?.settings ?? null;
}

/**
 * 检查文件是否应该被忽略（基于 SRS 设置）
 */
export function shouldIgnoreFile(app: App, filePath: string): boolean {
    const settings = getSRSettings(app);
    if (!settings) return false;

    const ignorePatterns = settings.noteFoldersToIgnore || [];

    for (const pattern of ignorePatterns) {
        // 简单的通配符匹配
        if (pattern.startsWith("**/")) {
            // **/*.xxx 匹配任意路径下的特定文件
            const suffix = pattern.slice(3);
            if (filePath.endsWith(suffix.replace("*", ""))) {
                return true;
            }
        } else if (filePath.includes(pattern)) {
            // 直接包含匹配
            return true;
        }
    }
    return false;
}

/**
 * 检查文件是否有 flashcards 标签
 */
export async function hasFlashcardTag(app: App, file: TFile): Promise<boolean> {
    const settings = getSRSettings(app);
    if (!settings) return false;

    const tags = settings.flashcardTags || ["#flashcards"];
    const content = await app.vault.read(file);

    // 检查 frontmatter 和内容中的标签
    for (const tag of tags) {
        const tagWithoutHash = tag.replace("#", "");
        // 检查 YAML frontmatter
        if (content.includes(`- ${tagWithoutHash}`) ||
            content.includes(`tags:\n  - ${tagWithoutHash}`)) {
            return true;
        }
        // 检查内容中的标签
        if (content.includes(tag)) {
            return true;
        }
    }
    return false;
}

/**
 * 触发 SRS 同步
 */
export async function syncSRS(app: App): Promise<boolean> {
    const sr = getSRPlugin(app);
    if (!sr) return false;

    try {
        await sr.sync();
        return true;
    } catch (e) {
        console.error("[SRS Bridge] 同步失败:", e);
        return false;
    }
}
/**
 * 打开指定文件的卡片复习
 * 使用 SRS 的 reviewByFilePath API
 */
export async function openFlashcardReview(app: App, filePath: string, mode: number = 0): Promise<boolean> {
    const sr = getSRPlugin(app);
    if (!sr) {
        console.error("[SRS Bridge] SRS 插件不可用");
        return false;
    }

    // 使用新的 reviewByFilePath API
    if (sr.reviewByFilePath) {
        return await sr.reviewByFilePath(filePath, mode);
    }

    // 回退到旧方法
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
        console.error("[SRS Bridge] 文件不存在:", filePath);
        return false;
    }

    try {
        await sr.openFlashcardModalForSingleNote(file, mode);
        return true;
    } catch (e) {
        console.error("[SRS Bridge] 打开复习失败:", e);
        return false;
    }
}

/**
 * 开始全局复习（所有到期卡片）
 */
export function startGlobalReview(app: App): boolean {
    try {
        // 执行 SRS 命令
        (app as any).commands.executeCommandById("obsidian-spaced-repetition:srs-review-flashcards");
        return true;
    } catch (e) {
        console.error("[SRS Bridge] 启动全局复习失败:", e);
        return false;
    }
}

/**
 * 获取卡组树结构（用于显示）
 */
export function getDeckTree(app: App): any[] {
    const stats = getSRStats(app);
    if (!stats?.deckTree) return [];

    // 递归提取卡组信息
    const extractDecks = (deck: any, level = 0): any[] => {
        const result: any[] = [];

        if (deck) {
            result.push({
                name: deck.deckName || "Root",
                newCount: deck.newFlashcards?.length || 0,
                dueCount: deck.dueFlashcards?.length || 0,
                totalCount: deck.totalFlashcards?.length || 0,
                level,
            });

            // 递归子卡组
            for (const subDeck of deck.subdecks || []) {
                result.push(...extractDecks(subDeck, level + 1));
            }
        }

        return result;
    };

    return extractDecks(stats.deckTree);
}

/**
 * 策略表现数据
 */
export interface StrategyPerformance {
    name: string;
    winRate: number;  // 0-1
    trades: number;
    pnl: number;
}

/**
 * 带权重的卡片推荐
 */
export interface WeightedCardRecommendation {
    filePath: string;
    fileName: string;
    priority: number;  // 0-100，越高越优先
    reason: string;
    strategyMatch?: StrategyPerformance;
}

/**
 * 根据策略表现计算学习权重
 * 
 * 规则：
 * - 胜率 < 50% 的策略：优先级高（需要加强学习）
 * - 胜率 50-70%：中等优先级
 * - 胜率 > 70%：低优先级（已掌握良好）
 * - 新卡片（未复习）：中等优先级
 * - 到期卡片：最高优先级
 */
export function calculateLearningPriority(
    winRate: number,
    trades: number,
    isNew: boolean,
    isDue: boolean
): { priority: number; reason: string } {
    let priority = 50;
    let reason = "常规复习";

    // 到期卡片优先
    if (isDue) {
        priority += 30;
        reason = "到期复习";
    }

    // 新卡片
    if (isNew) {
        priority += 10;
        reason = "新卡片";
    }

    // 策略表现权重
    if (trades >= 3) {
        if (winRate < 0.5) {
            priority += 20;
            reason = `胜率低 (${Math.round(winRate * 100)}%)，需加强`;
        } else if (winRate < 0.7) {
            priority += 10;
            reason = `胜率中等 (${Math.round(winRate * 100)}%)`;
        } else {
            priority -= 10;
            reason = `胜率良好 (${Math.round(winRate * 100)}%)`;
        }
    }

    return { priority: Math.max(0, Math.min(100, priority)), reason };
}

/**
 * 获取策略权重推荐的卡片列表
 */
export function getWeightedCardRecommendations(
    app: App,
    strategies: StrategyPerformance[],
    maxCards: number = 10
): WeightedCardRecommendation[] {
    const stats = getSRStats(app);
    if (!stats?.deckTree) return [];

    const recommendations: WeightedCardRecommendation[] = [];

    // 创建策略名称到表现的映射
    const strategyMap = new Map<string, StrategyPerformance>();
    for (const s of strategies) {
        strategyMap.set(s.name.toLowerCase(), s);
    }

    // 遍历卡组获取卡片
    const processCards = (deck: any, isNew: boolean = false, isDue: boolean = false) => {
        if (!deck) return;

        const cards = isDue ? deck.dueFlashcards :
            isNew ? deck.newFlashcards :
                deck.totalFlashcards;

        for (const card of cards || []) {
            const filePath = card?.question?.note?.file?.path || "";
            const fileName = card?.question?.note?.file?.basename || "";

            if (!filePath) continue;

            // 匹配策略
            let matchedStrategy: StrategyPerformance | undefined;
            for (const [name, perf] of strategyMap) {
                if (fileName.toLowerCase().includes(name) ||
                    filePath.toLowerCase().includes(name)) {
                    matchedStrategy = perf;
                    break;
                }
            }

            const { priority, reason } = calculateLearningPriority(
                matchedStrategy?.winRate ?? 0.5,
                matchedStrategy?.trades ?? 0,
                isNew,
                isDue
            );

            recommendations.push({
                filePath,
                fileName,
                priority,
                reason,
                strategyMatch: matchedStrategy,
            });
        }

        // 递归子卡组
        for (const subDeck of deck.subdecks || []) {
            processCards(subDeck, isNew, isDue);
        }
    };

    // 先处理到期卡片，再处理新卡片
    processCards(stats.deckTree, false, true);  // due
    processCards(stats.deckTree, true, false);  // new

    // 按优先级排序并返回前 N 张
    return recommendations
        .sort((a, b) => b.priority - a.priority)
        .slice(0, maxCards);
}

/**
 * 策略卡片统计结果
 */
export interface StrategyCardStats {
    strategyName: string;
    totalCards: number;
    masteredCards: number;  // 成熟卡片
    learningCards: number;  // 年轻卡片
    newCards: number;       // 新卡片
    dueCards: number;       // 到期卡片
    masteryPct: number;     // 掌握度 (masteredCards / totalCards * 100)
}

/**
 * 获取每个策略对应的卡片统计
 */
export function getStrategyCardStats(
    app: App,
    strategies: StrategyPerformance[]
): StrategyCardStats[] {
    const stats = getSRStats(app);
    if (!stats?.deckTree) return [];

    const results: Map<string, StrategyCardStats> = new Map();

    // 初始化策略统计
    for (const s of strategies) {
        results.set(s.name.toLowerCase(), {
            strategyName: s.name,
            totalCards: 0,
            masteredCards: 0,
            learningCards: 0,
            newCards: 0,
            dueCards: 0,
            masteryPct: 0,
        });
    }

    // 遍历卡片统计
    const processCards = (deck: any, isNew: boolean, isDue: boolean) => {
        if (!deck) return;

        const cards = isNew ? deck.newFlashcards : deck.dueFlashcards;

        for (const card of cards || []) {
            const filePath = card?.question?.note?.file?.path?.toLowerCase() || "";
            const fileName = card?.question?.note?.file?.basename?.toLowerCase() || "";
            const interval = card?.scheduleInfo?.interval ?? 0;

            // 匹配策略
            for (const [name, stat] of results) {
                if (fileName.includes(name) || filePath.includes(name)) {
                    stat.totalCards++;
                    if (isNew) {
                        stat.newCards++;
                    } else if (isDue) {
                        stat.dueCards++;
                        if (interval >= 32) {
                            stat.masteredCards++;
                        } else {
                            stat.learningCards++;
                        }
                    }
                    break;
                }
            }
        }

        // 递归子卡组
        for (const subDeck of deck.subdecks || []) {
            processCards(subDeck, isNew, isDue);
        }
    };

    // 处理所有卡片
    processCards(stats.deckTree, true, false);  // new
    processCards(stats.deckTree, false, true);  // due

    // 计算掌握度并返回结果
    return Array.from(results.values()).map(stat => ({
        ...stat,
        masteryPct: stat.totalCards > 0
            ? Math.round((stat.masteredCards / stat.totalCards) * 100)
            : 0,
    }));
}

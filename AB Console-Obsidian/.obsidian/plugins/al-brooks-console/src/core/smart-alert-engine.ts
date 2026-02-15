/**
 * 智能预警引擎 (Smart Alert Engine)
 *
 * 整合项目现有数据结构生成智能交易警告：
 * - Templates/属性值预设.md → 属性定义
 * - Templates/PA标签体系.md → 标签体系 (#PA/Trade, #flashcards, #task/*)
 * - 策略仓库 (Strategy Repository) → 策略卡片
 * - Categories 分类 → 概念笔记链接
 * - Daily/Trades → 交易记录
 * - memory (学习卡片) → 薄弱点分析
 * - Backend Signals (AB Console) → 实时市场信号
 */

import type { TradeRecord } from "./contracts";
import type { MarketState } from "./market-state-machine";
import type { MemorySnapshot } from "./memory";
import type { SignalData, MarketCycleData, PatternData } from "../services/backend-client";

// ============================================
// 类型定义
// ============================================

export type AlertType = 'warning' | 'tip' | 'learn' | 'strategy' | 'pattern';

export interface SmartAlert {
    type: AlertType;
    priority: number;       // 1-5 (5最高)
    source: string;         // 来源标识
    message: string;        // 警告内容
    detail?: string;        // 详细说明
    action?: {              // 可点击动作
        label: string;
        path?: string;      // 跳转到笔记
        command?: string;   // 执行命令
    };
    tags?: string[];        // 相关标签
}

export interface StrategyNote {
    strategy: string;
    path: string;
    marketCycles?: string[];
    direction?: string;
    status?: 'Learning' | 'Active' | string;
    patterns?: string[];    // 关联形态
    aliases?: string[];     // 策略别名
}

export interface ConceptNote {
    name: string;
    path: string;
    folder: string;         // e.g. "Categories 分类/Al brooks/价格行为学"
    hasFlashcards?: boolean;
}

// ============================================
// 主函数
// ============================================

export interface SmartAlertInput {
    marketState: MarketState;
    marketCycle?: string;
    direction?: string;

    // 交易记录
    recentTrades: TradeRecord[];

    // 策略仓库
    strategies: StrategyNote[];

    // 学习卡片 & 薄弱点
    memory?: MemorySnapshot | null;

    // 当前笔记标签
    activeTags?: string[];

    // 概念笔记库 (可选，用于推荐相关学习)
    concepts?: ConceptNote[];

    // 属性预设 (从 Templates/属性值预设.md 解析)
    executionQualities?: string[];  // 执行评价枚举
    missedReasons?: string[];       // 错过原因枚举

    // ============================================
    // Backend Integration (AB Console)
    // ============================================
    /** 后端实时信号 */
    backendSignals?: SignalData[];
    /** 后端市场周期分析 */
    backendMarketCycle?: MarketCycleData;
    /** 后端形态识别 */
    backendPatterns?: PatternData;
}

/**
 * 构建智能警告列表
 */
export function buildSmartAlerts(input: SmartAlertInput): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    // 1. 标签警告 (#PA/*, #task/*)
    if (input.activeTags && input.activeTags.length > 0) {
        alerts.push(...analyzeTagWarnings(input.activeTags));
    }

    // 2. 失败模式分析 (基于 execution_quality 属性)
    alerts.push(...analyzeFailurePatterns(input.recentTrades));

    // 3. 策略与市场周期匹配
    alerts.push(...analyzeStrategyMatch(
        input.marketState,
        input.marketCycle,
        input.strategies
    ));

    // 4. 形态识别推荐 (基于 patterns_observed)
    alerts.push(...analyzePatternRecommendations(
        input.recentTrades,
        input.strategies,
        input.concepts
    ));

    // 5. 学习薄弱点 (基于 #flashcards 卡片)
    if (input.memory) {
        alerts.push(...analyzeLearningWeakness(input.memory, input.marketState));
    }

    // 6. 后端实时信号 (AB Console Integration)
    if (input.backendSignals && input.backendSignals.length > 0) {
        alerts.push(...analyzeBackendSignals(input.backendSignals));
    }

    // 7. 后端市场周期分析
    if (input.backendMarketCycle) {
        alerts.push(...analyzeBackendMarketCycle(input.backendMarketCycle, input.strategies));
    }

    // 8. 后端形态识别
    if (input.backendPatterns && input.backendPatterns.patterns.length > 0) {
        alerts.push(...analyzeBackendPatterns(input.backendPatterns, input.strategies));
    }

    // 按优先级排序
    alerts.sort((a, b) => b.priority - a.priority);

    return alerts;
}

// ============================================
// 规则引擎
// ============================================

/**
 * 分析标签警告（基于 PA标签体系.md）
 */
function analyzeTagWarnings(tags: string[]): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    // PA 标签体系中定义的核心标签
    const tagRules: Record<string, { message: string; priority: number; type: AlertType }> = {
        // 系统标签
        'PA/Trade': { message: '📊 交易笔记已识别', priority: 1, type: 'tip' },
        'PA/Daily': { message: '📓 每日复盘', priority: 1, type: 'tip' },
        'PA/Textbook': { message: '⭐ 教科书案例', priority: 2, type: 'tip' },

        // 任务标签 (#task/*)
        'task/urgent': { message: '🚨 紧急任务待处理', priority: 5, type: 'warning' },
        'task/question': { message: '❓ 有疑难问题待解决', priority: 4, type: 'warning' },
        'task/verify': { message: '🔍 策略待验证', priority: 3, type: 'tip' },

        // 情绪/风控标签
        'review': { message: '📚 该笔记在复习队列中', priority: 2, type: 'learn' },
    };

    tags.forEach(tag => {
        // 移除 # 前缀
        const cleanTag = tag.replace(/^#/, '');

        Object.entries(tagRules).forEach(([key, config]) => {
            if (cleanTag.toLowerCase().includes(key.toLowerCase())) {
                alerts.push({
                    type: config.type,
                    priority: config.priority,
                    source: '标签体系',
                    message: config.message,
                    tags: [tag],
                });
            }
        });
    });

    return alerts;
}

/**
 * 分析失败模式（基于 execution_quality 属性）
 */
function analyzeFailurePatterns(trades: TradeRecord[]): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    if (!trades || trades.length < 3) return alerts;

    const recent = trades.slice(0, 15);

    // 统计执行评价问题
    const qualityIssues: Record<string, number> = {};
    recent.forEach(t => {
        const quality = t.executionQuality;
        if (quality && quality.includes('🔴')) {
            qualityIssues[quality] = (qualityIssues[quality] || 0) + 1;
        }
    });

    // 高频问题警告
    Object.entries(qualityIssues).forEach(([quality, count]) => {
        if (count >= 2) {
            const shortName = quality.replace(/^🔴\s*/, '').split('(')[0].trim();
            alerts.push({
                type: 'warning',
                priority: 4,
                source: '执行评价',
                message: `⚠️ "${shortName}" 发生 ${count} 次`,
                detail: '建议复盘分析并调整交易计划',
            });
        }
    });

    // 策略失败统计
    const strategyLosses: Record<string, { losses: number; wins: number }> = {};
    recent.forEach(t => {
        const strategy = t.strategyName || t.setupKey;
        if (!strategy) return;

        if (!strategyLosses[strategy]) {
            strategyLosses[strategy] = { losses: 0, wins: 0 };
        }

        if (t.outcome === 'loss') {
            strategyLosses[strategy].losses++;
        } else if (t.outcome === 'win') {
            strategyLosses[strategy].wins++;
        }
    });

    Object.entries(strategyLosses).forEach(([strategy, stats]) => {
        if (stats.losses >= 2 && stats.losses > stats.wins) {
            alerts.push({
                type: 'warning',
                priority: 4,
                source: '策略分析',
                message: `"${strategy}" 近期表现不佳 (${stats.wins}胜/${stats.losses}负)`,
                detail: '建议复习策略或暂停使用',
            });
        }
    });

    // 连续亏损警告
    let consecutiveLosses = 0;
    for (const t of recent) {
        if (t.outcome === 'loss') consecutiveLosses++;
        else break;
    }

    if (consecutiveLosses >= 3) {
        alerts.push({
            type: 'warning',
            priority: 5,
            source: '风控提醒',
            message: `🛑 连续 ${consecutiveLosses} 笔亏损`,
            detail: '建议暂停交易，进行复盘分析',
        });
    }

    return alerts;
}

/**
 * 分析策略与市场周期匹配（基于 策略仓库）
 */
function analyzeStrategyMatch(
    state: MarketState,
    cycle: string | undefined,
    strategies: StrategyNote[]
): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    if (!strategies || strategies.length === 0) return alerts;

    // 市场状态到关键词映射（基于 属性值预设.md 的 market_cycle）
    const stateKeywords: Record<MarketState, string[]> = {
        strong_trend_bull: ['多', 'Long', 'H1', 'H2', 'Gap', 'Breakout', '突破', '趋势'],
        strong_trend_bear: ['空', 'Short', 'L1', 'L2', 'Bear', '突破', '趋势'],
        weak_trend_bull: ['Channel', '通道', 'Wedge', 'H2', 'Pullback', '回调'],
        weak_trend_bear: ['Channel', '通道', 'Wedge', 'L2', 'Pullback', '回调'],
        tight_range: ['Fade', 'Scalp', 'Range', '区间', '看衰'],
        broad_range: ['Range', '区间', 'Double', 'Wedge', 'Flag', '双顶', '双底'],
        breakout_bull: ['Breakout', 'Gap', 'Spike', '突破', '缺口'],
        breakout_bear: ['Breakout', 'Gap', 'Spike', '突破', '缺口'],
        unknown: [],
    };

    const keywords = stateKeywords[state] || [];
    if (keywords.length === 0) return alerts;

    // 找匹配的活跃策略
    const matched = strategies.filter(s => {
        const name = (s.strategy || '').toLowerCase();
        return s.status === 'Active' && keywords.some(k =>
            name.includes(k.toLowerCase())
        );
    }).slice(0, 3);

    if (matched.length > 0) {
        alerts.push({
            type: 'strategy',
            priority: 3,
            source: '策略仓库',
            message: `📌 当前周期推荐: ${matched.map(s => s.strategy).join(', ')}`,
            action: matched[0] ? {
                label: `查看策略`,
                path: matched[0].path,
            } : undefined,
        });
    }

    return alerts;
}

/**
 * 分析形态识别推荐（基于 patterns_observed）
 */
function analyzePatternRecommendations(
    trades: TradeRecord[],
    strategies: StrategyNote[],
    concepts?: ConceptNote[]
): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    if (!trades || trades.length === 0) return alerts;

    // 统计最近交易中的成功形态
    const patternSuccess: Record<string, { wins: number; total: number }> = {};

    trades.slice(0, 20).forEach(t => {
        const patterns = t.patternsObserved || [];
        patterns.forEach(pattern => {
            if (!patternSuccess[pattern]) {
                patternSuccess[pattern] = { wins: 0, total: 0 };
            }
            patternSuccess[pattern].total++;
            if (t.outcome === 'win') {
                patternSuccess[pattern].wins++;
            }
        });
    });

    // 找到高胜率形态
    Object.entries(patternSuccess).forEach(([pattern, stats]) => {
        if (stats.total >= 3 && stats.wins / stats.total >= 0.7) {
            alerts.push({
                type: 'pattern',
                priority: 2,
                source: '形态分析',
                message: `✨ "${pattern}" 胜率优秀 (${stats.wins}/${stats.total})`,
                detail: '继续关注此形态',
            });
        }
    });

    return alerts;
}

/**
 * 分析学习薄弱点（基于 #flashcards 卡片）
 * 增强版：根据市场状态推荐相关概念复习
 */
function analyzeLearningWeakness(
    memory: MemorySnapshot,
    state: MarketState
): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    // 市场状态对应的学习关键词
    const stateToLearningTopics: Record<MarketState, string[]> = {
        strong_trend_bull: ['趋势', '突破', 'EMA', '回调', 'H1', 'H2', '测量移动'],
        strong_trend_bear: ['趋势', '突破', 'EMA', '反弹', 'L1', 'L2', '测量移动'],
        weak_trend_bull: ['通道', '回调', '楔形', '区间', '止盈'],
        weak_trend_bear: ['通道', '反弹', '楔形', '区间', '止盈'],
        tight_range: ['区间', '假突破', '剥头皮', '限价单'],
        broad_range: ['区间', '双顶', '双底', '旗形', '高抛低吸'],
        breakout_bull: ['突破', '缺口', '极速', '通道', '测量移动'],
        breakout_bear: ['突破', '缺口', '极速', '通道', '测量移动'],
        unknown: ['基础', '入门', '规则'],
    };

    const topics = stateToLearningTopics[state] || [];

    // 到期卡片提醒
    if (memory.due > 5) {
        // 如果有 focusFile（最困难的笔记），推荐先从那里开始复习
        const targetPath = memory.focusFile?.path;
        alerts.push({
            type: 'learn',
            priority: 2,
            source: '学习提醒',
            message: `📚 ${memory.due} 张卡片待复习`,
            detail: targetPath ? `建议从薄弱点开始` : undefined,
            action: targetPath ? {
                label: '开始复习',
                path: targetPath,
            } : {
                label: '开始复习',
                command: 'obsidian-spaced-repetition:srs-review-flashcards',
            },
        });
    }

    // 焦点卡片（最困难的）
    if (memory.focusFile && memory.focusFile.avgEase < 230) {
        const fileName = memory.focusFile.name.replace('.md', '');
        alerts.push({
            type: 'learn',
            priority: 3,
            source: '薄弱点',
            message: `🎯 建议复习: ${fileName}`,
            detail: `难度评分: ${memory.focusFile.avgEase} (需要加强)`,
            action: {
                label: '立即复习',
                path: memory.focusFile.path,
            },
        });
    }

    // 智能推荐：根据当前市场状态推荐相关卡片
    if (memory.quizPool && memory.quizPool.length > 0 && topics.length > 0) {
        // 在题库中找与当前市场状态相关的问题
        const relevantCards = memory.quizPool.filter(card => {
            const q = (card.q || '').toLowerCase();
            const file = (card.file || '').toLowerCase();
            return topics.some(topic =>
                q.includes(topic.toLowerCase()) || file.includes(topic.toLowerCase())
            );
        }).slice(0, 3);

        if (relevantCards.length > 0) {
            const firstCard = relevantCards[0];
            alerts.push({
                type: 'learn',
                priority: 2,
                source: '情境学习',
                message: `💡 当前周期相关: ${firstCard.file.replace('.md', '')}`,
                detail: `问题: ${firstCard.q.slice(0, 40)}...`,
                action: {
                    label: '复习此概念',
                    path: firstCard.path,
                },
            });
        }
    }

    // 掌握度分析
    if (memory.masteryPct < 70 && memory.total > 20) {
        alerts.push({
            type: 'learn',
            priority: 2,
            source: '掌握度',
            message: `📊 整体掌握度 ${memory.masteryPct}%`,
            detail: '建议每天坚持复习，提高掌握度',
        });
    }

    return alerts;
}

// ============================================
// Backend Integration (AB Console)
// ============================================

/**
 * 分析后端实时信号
 */
function analyzeBackendSignals(signals: SignalData[]): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    // 按时间排序，取最新的信号
    const sortedSignals = [...signals].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 处理最近的高强度信号
    const recentHighStrength = sortedSignals.filter(s => s.strength >= 0.7).slice(0, 3);

    recentHighStrength.forEach(signal => {
        const directionEmoji = signal.direction === 'BUY' ? '🟢' : signal.direction === 'SELL' ? '🔴' : '⚠️';
        const priority = signal.strength >= 0.9 ? 5 : signal.strength >= 0.8 ? 4 : 3;

        alerts.push({
            type: 'warning',
            priority,
            source: '后端信号',
            message: `${directionEmoji} ${signal.signal_name} (${signal.symbol})`,
            detail: signal.message,
            tags: [`signal:${signal.direction.toLowerCase()}`, `strength:${Math.round(signal.strength * 100)}%`],
        });
    });

    // 统计信号方向
    const buyCount = signals.filter(s => s.direction === 'BUY').length;
    const sellCount = signals.filter(s => s.direction === 'SELL').length;

    if (signals.length >= 3) {
        if (buyCount > sellCount * 2) {
            alerts.push({
                type: 'tip',
                priority: 2,
                source: '信号统计',
                message: `📈 多头信号占优 (${buyCount}买/${sellCount}卖)`,
                detail: '多数技术指标显示看多',
            });
        } else if (sellCount > buyCount * 2) {
            alerts.push({
                type: 'tip',
                priority: 2,
                source: '信号统计',
                message: `📉 空头信号占优 (${sellCount}卖/${buyCount}买)`,
                detail: '多数技术指标显示看空',
            });
        }
    }

    return alerts;
}

/**
 * 分析后端市场周期
 */
function analyzeBackendMarketCycle(
    cycle: MarketCycleData,
    strategies: StrategyNote[]
): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    // 市场周期映射到中文描述
    const cycleDescriptions: Record<string, string> = {
        strong_trend: '强趋势',
        weak_trend: '弱趋势',
        trading_range: '交易区间',
        breakout: '突破',
    };

    const aiDirections: Record<string, string> = {
        long: '多头',
        short: '空头',
        neutral: '中性',
    };

    const cycleDesc = cycleDescriptions[cycle.cycle] || cycle.cycle;
    const dirDesc = aiDirections[cycle.always_in] || cycle.always_in;

    // 市场周期警告
    if (cycle.confidence >= 0.7) {
        alerts.push({
            type: 'tip',
            priority: 3,
            source: 'AI市场分析',
            message: `📊 ${cycleDesc} (${dirDesc}) - 置信度 ${Math.round(cycle.confidence * 100)}%`,
            detail: `${cycle.symbol} ${cycle.interval} 周期分析`,
            tags: [`cycle:${cycle.cycle}`, `direction:${cycle.always_in}`],
        });
    }

    // 找到匹配当前周期的策略
    const cycleKeywords: Record<string, string[]> = {
        strong_trend: ['趋势', '突破', '追踪', 'H1', 'H2', 'L1', 'L2', 'Breakout'],
        weak_trend: ['通道', '回调', '楔形', 'Channel', 'Wedge', 'Pullback'],
        trading_range: ['区间', '高抛低吸', 'Range', 'Fade', 'Scalp'],
        breakout: ['突破', '缺口', 'Gap', 'Spike', 'Breakout'],
    };

    const keywords = cycleKeywords[cycle.cycle] || [];
    const matchedStrategies = strategies.filter(s => {
        const name = (s.strategy || '').toLowerCase();
        return s.status === 'Active' && keywords.some(k => name.includes(k.toLowerCase()));
    }).slice(0, 2);

    if (matchedStrategies.length > 0) {
        alerts.push({
            type: 'strategy',
            priority: 3,
            source: 'AI策略匹配',
            message: `🎯 推荐策略: ${matchedStrategies.map(s => s.strategy).join(', ')}`,
            detail: `基于当前 ${cycleDesc} 市场周期`,
            action: matchedStrategies[0] ? {
                label: '查看策略',
                path: matchedStrategies[0].path,
            } : undefined,
        });
    }

    return alerts;
}

/**
 * 分析后端形态识别
 */
function analyzeBackendPatterns(
    patternData: PatternData,
    strategies: StrategyNote[]
): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    // 取高置信度的形态
    const highConfPatterns = patternData.patterns
        .filter(p => p.confidence >= 0.7)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);

    highConfPatterns.forEach(pattern => {
        alerts.push({
            type: 'pattern',
            priority: pattern.confidence >= 0.9 ? 4 : 3,
            source: 'AI形态识别',
            message: `🔍 ${pattern.name} (${pattern.type})`,
            detail: `置信度 ${Math.round(pattern.confidence * 100)}% - K线 #${pattern.bar_index}`,
            tags: [`pattern:${pattern.type}`],
        });
    });

    // 形态与策略匹配
    const patternNames = highConfPatterns.map(p => p.name.toLowerCase());
    const matchedStrategies = strategies.filter(s => {
        const strategyName = (s.strategy || '').toLowerCase();
        const patterns = (s.patterns || []).map(p => p.toLowerCase());
        return s.status === 'Active' && (
            patternNames.some(pn => strategyName.includes(pn)) ||
            patterns.some(sp => patternNames.some(pn => sp.includes(pn) || pn.includes(sp)))
        );
    }).slice(0, 2);

    if (matchedStrategies.length > 0) {
        alerts.push({
            type: 'strategy',
            priority: 3,
            source: '形态策略匹配',
            message: `📌 形态关联策略: ${matchedStrategies.map(s => s.strategy).join(', ')}`,
            detail: `检测到的形态可应用这些策略`,
            action: matchedStrategies[0] ? {
                label: '查看策略',
                path: matchedStrategies[0].path,
            } : undefined,
        });
    }

    return alerts;
}

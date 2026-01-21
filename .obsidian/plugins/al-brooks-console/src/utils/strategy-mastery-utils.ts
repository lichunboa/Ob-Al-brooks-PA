/**
 * 策略掌握度计算工具
 * 
 * 掌握度 = SRS易度(50%) + 实战胜率(30%) + 使用频率(20%)
 */

export interface StrategyMasteryData {
    strategyName: string;
    // SRS 数据
    srsEase?: number;      // 平均易度 (0-300+)
    srsDueCount?: number;  // 到期卡片数
    srsCardCount?: number; // 总卡片数
    // 交易数据
    winRate?: number;      // 实战胜率 (0-100)
    tradeCount?: number;   // 交易次数
    avgR?: number;         // 平均R值
}

export interface MasteryResult {
    strategyName: string;
    masteryScore: number;  // 0-100
    srsScore: number;      // 0-100
    practiceScore: number; // 0-100
    frequencyScore: number; // 0-100
    level: 'mastered' | 'familiar' | 'learning' | 'new';
    suggestion: string;
}

/**
 * 计算单个策略的掌握度
 */
export function calculateMastery(data: StrategyMasteryData): MasteryResult {
    // SRS易度得分 (权重50%)
    // 易度范围通常 150-300+，200以下较难，250+较易
    const avgEase = data.srsEase ?? 200;
    const srsScore = Math.min(100, Math.max(0, ((avgEase - 100) / 200) * 100));

    // 实战胜率得分 (权重30%)
    const winRate = data.winRate ?? 0;
    const practiceScore = Math.min(100, winRate);

    // 使用频率得分 (权重20%)
    // 10次以上视为高频使用
    const tradeCount = data.tradeCount ?? 0;
    const frequencyScore = Math.min(100, (tradeCount / 10) * 100);

    // 综合掌握度
    const masteryScore = Math.round(
        srsScore * 0.5 +
        practiceScore * 0.3 +
        frequencyScore * 0.2
    );

    // 掌握等级
    let level: MasteryResult['level'];
    let suggestion: string;

    if (masteryScore >= 80) {
        level = 'mastered';
        suggestion = '继续保持';
    } else if (masteryScore >= 60) {
        level = 'familiar';
        suggestion = '可实战应用';
    } else if (masteryScore >= 30) {
        level = 'learning';
        suggestion = '需要复习';
    } else {
        level = 'new';
        suggestion = '加强学习';
    }

    return {
        strategyName: data.strategyName,
        masteryScore,
        srsScore: Math.round(srsScore),
        practiceScore: Math.round(practiceScore),
        frequencyScore: Math.round(frequencyScore),
        level,
        suggestion,
    };
}

/**
 * 获取掌握度颜色
 */
export function getMasteryColor(score: number): string {
    if (score >= 80) return '#22c55e';  // 绿色 - 精通
    if (score >= 60) return '#60a5fa';  // 蓝色 - 熟悉
    if (score >= 30) return '#fbbf24';  // 黄色 - 学习中
    return '#ef4444';                   // 红色 - 新手
}

/**
 * 获取掌握度等级标签
 */
export function getMasteryLabel(level: MasteryResult['level']): string {
    switch (level) {
        case 'mastered': return '精通';
        case 'familiar': return '熟悉';
        case 'learning': return '学习中';
        case 'new': return '新手';
    }
}

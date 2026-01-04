/* 文件名: Scripts/core/pa-smart-analyst.js
   用途: 智能分析引擎 (概率校准、知行合一审计、形态矩阵)
   依赖: pa-utils.js
*/

// ============================================================
// 1. Pattern-Outcome Matrix (形态-结果矩阵)
// ============================================================
// 统计不同市场周期下，各个 Setup/形态 的表现 (胜率、盈亏、R值)

function buildPatternMatrix(trades) {
    const matrix = {}; // { cycle: { pattern: { wins, total, pnl, rSum ... } } }

    // Helper to get or create node
    const getNode = (cycle, pattern) => {
        if (!matrix[cycle]) matrix[cycle] = {};
        if (!matrix[cycle][pattern]) {
            matrix[cycle][pattern] = {
                count: 0, wins: 0, losses: 0, pnl: 0, rSum: 0,
                // List of trade IDs for drill-down
                ids: []
            };
        }
        return matrix[cycle][pattern];
    };

    for (const t of trades) {
        // 清洗 key
        const cycle = t.market_cycle && t.market_cycle !== "Unknown" ? t.market_cycle : "All/Unspecified";
        const patterns = Array.isArray(t.patterns) && t.patterns.length > 0 ? t.patterns : ["None"];

        // 一个交易可能属于多个 pattern，这里简单处理：对每个 pattern 都统计一次
        // 注意：累加 PnL 时要小心重复计算总和，但 Matrix 本意是看局部表现，所以没问题
        for (const p of patterns) {
            const node = getNode(cycle, p);
            node.count++;
            node.pnl += (Number(t.pnl) || 0);
            if (typeof t.r === 'number') node.rSum += t.r;

            // Outcome check
            const outcome = (t.outcome || "").toString().toLowerCase();
            if (outcome.includes("win") || (t.pnl > 0)) node.wins++;
            else if (outcome.includes("loss") || (t.pnl < 0)) node.losses++;

            node.ids.push(t.id);
        }
    }

    // Post-process: Calculate WinRate & Expectancy
    const result = [];
    for (const cKey in matrix) {
        for (const pKey in matrix[cKey]) {
            const d = matrix[cKey][pKey];
            const winRate = d.count > 0 ? Math.round((d.wins / d.count) * 100) : 0;
            const avgR = d.count > 0 ? d.rSum / d.count : 0;
            const expectancy = avgR * (winRate / 100) - (1 * (1 - winRate / 100)); // Simplified Expectancy Formula (assuming 1R risk)

            result.push({
                cycle: cKey,
                pattern: pKey,
                stats: {
                    ...d,
                    winRate,
                    avgR,
                    expectancy: parseFloat(expectancy.toFixed(2))
                }
            });
        }
    }

    // Sort by "Urgency" (Losses in high frequency) or PnL
    result.sort((a, b) => a.stats.pnl - b.stats.pnl); // Most negative PnL first (Identify leaks)

    return result;
}

// ============================================================
// 2. Probability Calibrator (概率校准器)
// ============================================================
// 检查单笔交易：如果是低胜率架构 (如 MTR)，是否具备高 R 值？

function calibrateProbability(trade, utils) {
    const alerts = [];

    // 理论基准 (Al Brooks General Rules)
    const RULES = {
        "MTR": { minR: 2.0, maxWinRate: 40, label: "Major Trend Reversal" },
        "Low Probability": { minR: 2.0, maxWinRate: 40, label: "Low Prob Setup" },
        "Scalp": { minR: 1.0, minWinRate: 60, label: "Scalp" },
        "Breakout": { minR: 1.0, minWinRate: 50, label: "Breakout" }
    };

    const setup = (trade.setup || "").toString();
    const strategy = (trade.strategyName || "").toString();
    const cycle = (trade.market_cycle || "").toString();

    // Detect context
    let rule = null;
    if (setup.includes("MTR") || setup.includes("Reversal") || strategy.includes("MTR")) {
        rule = RULES["MTR"];
    } else if (cycle.includes("Trading Range") && setup.includes("Breakout")) {
        // Breakout in TR is often low prob
        rule = RULES["Low Probability"];
        rule.desc = "Breakout in Trading Range";
    }

    // Check R
    if (rule && typeof trade.r === 'number') {
        // If trade is planned (r is target R) or executed (r is actual R)
        // Here we assume 'r' in trade object is actual/realized or initial planned R
        // We usually want to check PLANNED R. But trade object format in loaders puts realized R in 'r'.
        // Let's assume we can also parse "Target" from Frontmatter if available, currently 'r' is outcome based.
        // So this is more of a "Review" calibrator.

        const rAbs = Math.abs(trade.r);
        if (rAbs < rule.minR && rAbs > 0.1) {
            alerts.push({
                type: "probability_mismatch",
                msg: `⚠️ 数学期望警告: ${rule.desc || rule.label} 通常胜率 < ${rule.maxWinRate}%，需要至少 ${rule.minR}R。当前仅 ${rAbs.toFixed(2)}R。`,
                score: 5
            });
        }
    }

    return alerts;
}

// ============================================================
// 3. Plan-Trade Auditor (知行合一审计)
// ============================================================
// 对比 Daily Journal 的 Plan 和实际 Trade 的 Execution

function auditPlan(dailyJournal, dayTrades) {
    if (!dailyJournal || !dayTrades || dayTrades.length === 0) return null;

    const issues = [];
    const planCycle = dailyJournal.market_cycle || "Unknown";

    // Check 1: Cycle Deviations
    // e.g. Plan says "Trading Range", but Trader did "Breakout" setups aggressively?
    // Hard to strict check without logic, but we can check if Trade Context matches Plan Context
    let deviationCount = 0;

    for (const t of dayTrades) {
        const tradeCycle = t.market_cycle || "";
        if (tradeCycle && planCycle !== "Unknown" && tradeCycle !== "Unknown") {
            // Simple string mismatch check
            if (!tradeCycle.includes(planCycle) && !planCycle.includes(tradeCycle)) {
                // Ignore subtle diffs, look for major conflicts
                if (
                    (planCycle.includes("Range") && tradeCycle.includes("Strong Trend")) ||
                    (planCycle.includes("Bear") && tradeCycle.includes("Bull Trend"))
                ) {
                    deviationCount++;
                }
            }
        }
    }

    if (deviationCount > 0) {
        issues.push({
            type: "plan_deviation",
            title: "知行背离",
            msg: `今日计划是 "${planCycle}"，但有 ${deviationCount} 笔交易标记为完全不同的市场背景。是市场变了还是你偏离了计划？`,
            count: deviationCount
        });
    }

    return issues.length > 0 ? issues : null;
}

module.exports = {
    buildPatternMatrix,
    calibrateProbability,
    auditPlan
};

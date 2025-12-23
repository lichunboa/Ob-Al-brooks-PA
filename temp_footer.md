
---

## 📚 实战案例库 (Case Library)

> [!example] 自动关联的实战交易
> 系统自动抓取所有标记为 **`$= dv.current().patterns_observed ? dv.current().patterns_observed[0] : "此形态"`** 或策略名为 **`$= dv.current().strategy_name`** 的交易。

```dataviewjs
const currentPatterns = dv.current().patterns_observed || [];
const currentStrategy = dv.current().strategy_name;

// 辅助函数：检查数组交集
function hasIntersection(arr1, arr2) {
    if (!arr1 || !arr2) return false;
    const a1 = Array.isArray(arr1) ? arr1 : [arr1];
    const a2 = Array.isArray(arr2) ? arr2 : [arr2];
    return a1.some(item1 => a2.some(item2 => item1.includes(item2) || item2.includes(item1)));
}

dv.table(["日期", "品种", "方向", "结果", "盈亏", "执行"],
    dv.pages('"Daily/Trades"')
    .where(p => {
        const tradePatterns = p.patterns_observed;
        const tradeStrategy = p.strategy_name;
        
        // 1. 策略名称完全匹配
        if (currentStrategy && tradeStrategy && tradeStrategy === currentStrategy) return true;
        
        // 2. 形态标签共振 (只要有一个形态重叠)
        if (hasIntersection(currentPatterns, tradePatterns)) return true;
        
        return false;
    })
    .sort(p => p.date, "desc")
    .map(p => [
        p.file.link,
        p.ticker,
        p.direction,
        p.outcome == "止盈 (Win)" ? "✅ 止盈" : (p.outcome == "止损 (Loss)" ? "❌ 止损" : "⚪ 平手"),
        p.net_profit,
        p.execution_quality
    ])
)
```

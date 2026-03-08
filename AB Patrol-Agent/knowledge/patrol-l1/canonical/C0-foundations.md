# C0 Foundations

> 来源锚点：
> - `AL brooks原课程大纲.md`
> - `价格行为学总览.md`
> - `12A/12B/13A/14B/21D/22A/31A/39B/39C`

## 最高原则

1. **Context > pattern > signal bar**
2. 市场永远在循环：`trend -> channel -> TR -> BO -> trend`
3. 不是强 BO，就优先按 `channel / TR / breakout-mode` 思考
4. 大多数交易只有 `40%~60%` 概率，不存在完美单
5. **交易系统要服务于概率与结构，不要服务于恐惧**

## 80% / 40-60 规则

- 大多数 breakout 会失败
- 大多数 reversal 一开始只是 minor reversal
- 如果不是非常清晰的强趋势/强 BO，就默认它更接近 `TR` 或 `channel`
- `P` 通常不需要精确到小数，重要的是：
  - 是不是高概率 scalp
  - 还是低概率但高回报的 swing / reversal

## 系统责任

这些判断应该主要由 agent 完成：

- 当前 context 是 `trend / channel / TR / BO / climax`
- 当前是顺势、逆势、还是 `breakout-mode`
- 当前适合 `scalp / swing / 反转试探`
- 当前更像“继续原 thesis”还是“旧 thesis 失效，切换新 thesis”

代码只负责：

- 持久化状态
- 执行安全
- 动作白名单
- 交易所接口

代码**不得**自创新的交易理论阈值。

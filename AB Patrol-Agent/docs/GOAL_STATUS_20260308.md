# AB Patrol-Agent Goal Status

更新日期: 2026-03-08

## 最终目标

按原 Claude patrol 的 `skill / S 文件` 逻辑运行 `AB Patrol-Agent`，尽可能稳定地从市场中提取利润。

主链必须覆盖:

1. 数据获取
2. 多周期 Al Brooks 结构分析
3. 动态扫描与机会路由
4. 开仓执行
5. 持仓管理
6. TG / Web 可见
7. watchdog 恢复
8. 可复盘、可调参、可继续迭代知识库

## 当前完成度

- 架构完成度: 约 75%
- 与原 Claude skill 流程的 parity: 约 70%
- 可以开始稳定积累新交易数据的程度: 约 60%
- 可以放心说达到原来开仓频率和质量的程度: 还没到

## 已完成

- 原始 `SKILL.md` 与原始 `S` 文件已接回，运行时不再依赖 `runtime-brief`
- `ab_ema / ab_sr / ab_mm / ab_patterns` 已接入 live 分析链
- `Codex CLI` 已改成长会话 session，不再每轮 cold start
- session 编号已持久化，可供 watchdog / 复盘 / 恢复使用
- `Query Service / TG / Web / watchdog` 骨架已接通
- `execution-service` 可用，`can_trade = true`

## 主要不足

- 还没有新架构下的自然 `OPEN_ORDER`
- `Scalp 快速通道` 还未被真实开仓样本验证
- `Step 5` 动态扫描逻辑还没和原 Claude 版完全等价
- `开仓 -> 持仓管理 -> 平仓` 的整条链还没在新架构中用真实订单完整验证
- 展示层可用，但还不是最终交易员视图

## 接下来优先级

1. 保持 `Codex CLI` 长会话稳定常驻，不再停住
2. 继续逼近原 Claude patrol 的扫描 / 路由 / 持仓管理逻辑
3. 盯到第一笔自然 `OPEN_ORDER`
4. 核对该订单是否符合原 `skill / S 文件`
5. 核对持仓管理是否正常接上
6. 再优化 TG / Web 的交易员视图

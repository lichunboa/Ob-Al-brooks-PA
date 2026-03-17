# Brooks 实盘链重设计方案

## 1. 背景

当前实盘链和回测链虽然已经开始共用部分模块，但整体上仍然带着旧结构：

- `signal-service` 里既做背景识别，也做策略 detector，也混了部分节奏、冷却、路由判断
- `runtime` 还保留了偏早期的编排方式
- 不同策略虽然在往模板化走，但正式 live 入口还没有完全变成“模板注册 + 公共模块组装”

这会带来三个问题：

1. 策略越来越多后，`pa_engine.py` 会继续膨胀
2. live / backtest 很容易出现“理论一样、实现细节不一样”
3. 单个策略优化后的共用能力，不能快速复制到别的策略族

## 2. 重设计目标

目标不是推翻现有系统，而是把系统改造成：

`统一主链 + 策略模板注册 + 公共 Brooks 模块复用`

要求：

- live / backtest 使用同一套策略模板定义
- live / backtest 使用同一套多周期角色定义
- live / backtest 使用同一套 `entry / stop / actual risk / target tiers / management intent`
- 策略族之间只在模板层有差异，不再在执行链重复写条件

## 3. 新主链

### 3.1 统一角色层

所有策略先读取统一的多周期角色：

- `结构周期`
- `主背景周期`
- `锚定周期`

说明：

- `结构周期`：看 setup 是否还完整
- `主背景周期`：看更大一级趋势、TR、通道质量
- `锚定周期`：看更大级别关键位、机构参考位、主要磁体

这层现在已经有基础实现，后续应继续作为唯一来源：

- [timeframe_roles.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/market/timeframe_roles.py)

### 3.2 统一信号模板层

每个策略都要落成独立模板文件，模板内部只负责：

- setup 前提
- signal bar 类型学
- entry trigger
- stop plan
- target tiers
- management intent

建议的模板目录结构：

```text
services/signal-service/src/engines/pa/
├── h1_l1_template.py
├── h2_l2_template.py
├── breakout_pullback_template.py
├── ema_gap_template.py
├── mtr_template.py
├── climax_trap_template.py
└── ...
```

### 3.3 统一信号标准对象层

所有策略模板最终都必须只产出一个标准化信号对象，字段统一，包括：

- `signal_type`
- `direction`
- `entry_type`
- `entry_trigger`
- `signal_bar_high / low`
- `stop_loss`
- `stop_type`
- `actual_risk`
- `first_target`
- `rescue_target`
- `close_test_target`
- `swing_target`
- `management_template`
- `management_style_override`
- `playbook_id`
- `route_style`

要求：

- live / backtest 只认标准字段，不认策略内部私货
- 新策略进来时，必须先能完整产出这套字段

### 3.4 统一路由层

所有策略在模板层产出信号后，统一进入：

- playbook 路由
- route style 决定
- management style 决定

而不是每个 detector 再自己偷偷带一套 route 逻辑。

当前可以继续作为核心共享层：

- [playbook_router.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/market/playbook_router.py)

### 3.5 统一执行层

执行层只关心：

- 是否触发
- 风险和仓位
- 目标层级
- 管理模板

而不再回头理解策略细节。

目标是：

- 策略模板产出“怎么做”
- 执行层只负责“按这个做”

## 4. 推荐的新目录职责

### 4.1 signal-service

职责收缩为：

- K 线与多周期上下文读取
- 策略模板运行
- 产出标准化信号对象

不再继续膨胀：

- 冷却特调
- 额外策略分叉
- 执行级细节回写

### 4.2 runtime

职责改成纯编排：

- 拉取标准信号
- 写运行态
- 发通知
- 把信号交给执行服务

不再承担策略判断。

### 4.3 execution-service

职责明确为：

- 仓位计算
- 杠杆/保证金约束
- 成交桥接
- 风险限制
- 实盘状态回写

### 4.4 backtest

职责为：

- 复用同一模板
- 复用同一路由
- 复用同一管理语义
- 只在“成交模拟 / 成本模拟 / 回测统计”层区别于 live

## 5. 推荐的数据流

```mermaid
flowchart LR
    A["K线与多周期数据"] --> B["统一角色层\n结构/主背景/锚定"]
    B --> C["策略模板注册表"]
    C --> D["标准化 PASignalV2"]
    D --> E["Playbook 路由"]
    E --> F["执行层\nentry/stop/targets/management"]
    F --> G["live 下单 / backtest 成交模拟"]
    G --> H["统计 / 通知 / 运行态"]
```

## 6. 为什么现在要重构

因为我们已经验证出：

- `H1/L1`
- `H2/L2`
- `突破回调`
- `gap 族`

这些策略并不是一套 detector 条件加一套统一止盈止损就够了。

真正有效的是：

- 统一 Brooks 知识点模块
- 每个策略再按模板组装

所以现在重构是顺势而为，不是额外负担。

## 7. 当前可以直接复用的公共模块

### 7.1 已证明有效

- `STOP trigger`
- `signal bar` 类型学骨架
- `actual risk`
- `first target / rescue / close-test / swing`
- `setup_valid -> management_style` 降级
- `多周期角色统一`

### 7.2 还需继续收口

- `gap` 族 detector 的最终触发窗口
- `fade_candidate` 的实盘接管
- `5m` 弱背景边界

## 8. 推荐迁移顺序

### 阶段 1：只做结构统一

- 保留现有功能
- 把 live / backtest 的多周期角色统一
- 把标准字段统一
- 把模板模块注册表建起来

### 阶段 2：先迁移已稳定策略

顺序建议：

1. `H1/L1`
2. `H2/L2`
3. `突破回调`
4. `20-gap / 第一均线缺口 / MAG`

### 阶段 3：再迁移其他策略族

- `MTR`
- `高潮/陷阱反转`
- `突破追随`

## 9. 不该做的事

- 不要为 live 单独写一套策略逻辑
- 不要让 runtime 继续承担策略判断
- 不要让 `pa_engine.py` 继续无限加条件
- 不要把单品种、单周期修补直接扩散成全局规则

## 10. 给接手窗口的直接建议

如果另一个窗口接手 live 链，应先做这三件事：

1. 建 `策略模板注册表`
2. 定义标准化信号字段清单
3. 把 live 入口改成“只消费标准化信号对象”

这样后面的策略扩展，才能真正复用我们已经打磨过的 Brooks 模块。

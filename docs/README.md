# AB 项目文档中心

> 更新于 2026-03-11

当前项目只有三套真实主系统：

| 系统 | 根目录 | 当前定位 |
| --- | --- | --- |
| `AB Patrol-Agent` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent` | 当前后端、巡逻主脑、规则引擎、执行桥和 sidecar 服务 |
| `AB Patrol-Web` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web` | 当前独立 Web，读取 Patrol Runtime / Query Service / Execution Service |
| `AB Console-Obsidian` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian` | Al Brooks 知识库、复盘资料与 Obsidian 插件 |

## 当前交易主线

```text
AB Console-Obsidian
  -> AB Patrol-Agent/knowledge/patrol-l1
  -> runtime/pa_runtime.py loop/run_cycle
  -> execution 快照 + market cache + phase plan
  -> should_use_llm()
       -> 未触发: rule_engine_decision()
       -> 触发: prompt_builder + providers
  -> hydrate_open_order_action() / execute_action()
  -> execution-service
  -> query-service / sync-service / vis-service
  -> AB Patrol-Web / 控制脚本 / Telegram 可见
```

当前实际配置与运行结论：

- `AB_PATROL_DECISION_PROVIDER=openclaw`
- `AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1`
- `AB_PATROL_RULE_ENGINE_PRIORITY=0`
- `AB_PATROL_FORCE_LLM=0`
- `execution-service` 当前 `trading_enabled=true`
- Patrol 最新 cycle 里的 `OPEN_ORDER` 结果仍是 `DRY_RUN_VALIDATED`，说明巡逻主链当前只做仓位计算与订单载荷生成，不实际发送订单

因此，当前模式不是“每轮都调 LLM”，也不是“全局永久纯代码”；更准确地说是：

- 巡逻编排、开仓候选、持仓管理、执行桥接，已经主要是代码路径
- LLM 只在触发器命中时介入
- Patrol 当前实际执行仍是 `dry_run`

## 当前权威文档

| 文档 | 说明 |
| --- | --- |
| [AGENTS.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AGENTS.md) | 当前仓库协作约束、命令约束与开发规范 |
| [CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_TRADING_FLOW.md) | 当前真实交易流程、LLM 触发逻辑、执行链和模块调用关系 |
| [FOLDER_STRUCTURE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/FOLDER_STRUCTURE.md) | 当前完整目录与功能结构 |
| [ROOT_LAYOUT.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/ROOT_LAYOUT.md) | 顶层目录边界，区分主目录、运行产物、历史资料与个人工作区 |
| [backend/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/backend/README.md) | Patrol 后端与 sidecar 服务入口 |
| [web/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/web/README.md) | Patrol Web 入口 |
| [AB Patrol-Agent/docs/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/README.md) | Patrol 主脑内部文档索引 |

## 历史归档

- `AB Console-Backend` 已在 2026-03-10 删除。
- 带旧路径、旧架构、03-10 过程性报告与一次性计划文档，统一归档到 `docs/archive/`。
- Patrol 主脑那批过程文档已统一收进 `docs/archive/patrol-agent/`。
- 当前默认入口见 [archive/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/archive/README.md)。

## 分系统入口

- Patrol 主线：

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
./scripts/start.sh start
./scripts/start.sh status
```

- Patrol Web：

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web"
bash scripts/start.sh
```

- Obsidian 知识库结构：
  [OBSIDIAN-NOTES-STRUCTURE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/OBSIDIAN-NOTES-STRUCTURE.md)

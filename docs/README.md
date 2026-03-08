# AB 项目文档中心

> 更新于 2026-03-08

## 当前四套系统

| 系统 | 根目录 | 当前定位 |
| --- | --- | --- |
| `AB Patrol-Agent` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent` | Al Brooks 交易主脑，负责巡逻、分析、决策、交易前校验 |
| `AB Patrol-Web` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web` | 独立 Web 展示层，读取 Patrol Query Service，不再挂在 Backend/web |
| `AB Console-Backend` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend` | 基础设施与参考后端，提供数据、执行、Telegram、TimescaleDB 等底座 |
| `AB Console-Obsidian` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian` | Al Brooks 知识库、复盘、Obsidian 插件与课程材料 |

当前最重要的边界：

- `AB Patrol-Agent` 是交易脑子，不是 `AB Console-Backend` 的零散脚本。
- `AB Patrol-Web` 是 Patrol 的独立展示层，主入口不是 `AB Console-Backend/web`。
- `AB Console-Backend` 当前更像基础设施和参考项目，不是这条 Al Brooks 主线的宿主。
- `AB Console-Obsidian` 是知识 authority，后续优化仍然要回到这里的 Al Brooks 知识体系。

## 当前真实运行方式

当前交易主链是：

```text
原始 SKILL.md + S0-S7
  -> AB Patrol-Agent
  -> codex_cli 长会话决策
  -> patrol_trade.py 交易前校验
  -> execution-service
  -> Binance demo
  -> Query Service / Web / TG 可见
```

其中：

- `codex_cli` 是当前默认决策执行层。
- `OpenClaw` 负责 host / TG operator / 工作区记忆，不再是唯一决策后端。
- `watchdog` 负责卡死恢复。
- `Query Service + Web + TG` 负责可见性。

## 最重要的两份当前文档

| 文档 | 说明 |
| --- | --- |
| [CURRENT_SYSTEM_OVERVIEW_20260308.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_SYSTEM_OVERVIEW_20260308.md) | 2026-03-08 最新系统状态、运行链、当前已知缺口 |
| [PROJECT_BOUNDARIES_20260308.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/PROJECT_BOUNDARIES_20260308.md) | 当前系统边界、归属、谁负责什么、哪些模块只是参考 |

## 分系统入口

### AB Patrol-Agent

- [AB Patrol-Agent/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/README.md)
- [AB Patrol-Agent/docs/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/README.md)

### AB Patrol-Web

- [AB Patrol-Web/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Web/README.md)

### AB Console-Backend

- [backend/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/backend/README.md)
- [local-dev.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/local-dev.md)

### AB Console-Obsidian / 知识库

- [OBSIDIAN-NOTES-STRUCTURE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/OBSIDIAN-NOTES-STRUCTURE.md)

## 当前已修与未修

### 已修

- `P×R` 规则已对齐回 `S5-evaluation`
- `S6` 路由已从单路由增强到多路由
- `S7` 动作已扩展到加仓 / 分批减仓 / 撤挂单 / 调整止损 / 调整止盈
- `execution-service` 已补 Binance 时间同步恢复
- `AB Patrol-Web` 已从 `AB Console-Backend/web` 分离

### 仍未完成

- `codex_cli` 决策仍会有 timeout，稳定性还不够
- 新架构下首笔自然自动成交还没稳定复现
- `S7-management` 还缺新架构下的 live 仓位管理闭环验证
- `query-service / watchdog` 的长期驻留仍有不稳定迹象

## 运行入口

### Patrol 主线

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
./scripts/start.sh start
./scripts/start.sh status
```

### Patrol Web

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web"
bash scripts/start.sh
```

### Finder 启动工具

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/📁 启动工具/🚀 一键启动.command`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/📁 启动工具/📊 状态检查.command`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/📁 启动工具/🌐 AB Patrol Web.command`

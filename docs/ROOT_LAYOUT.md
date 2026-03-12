# 顶层目录边界

> 更新于 2026-03-11

本文只回答一个问题：项目根目录里哪些是当前真实运行目录，哪些只是历史资料或个人工作区。

## 1. 当前真实主目录

以下目录是当前开发、运行、部署时默认会引用的主目录：

| 目录 | 用途 | 备注 |
| --- | --- | --- |
| `AB Patrol-Agent/` | 当前后端、巡逻主脑、sidecar 服务、运行态 | 当前唯一后端主目录 |
| `AB Patrol-Web/` | 当前独立 Web | 当前唯一 Web 主目录 |
| `AB Console-Obsidian/` | Al Brooks 知识库、课程、Obsidian 插件 | 最高权威知识源 |
| `docs/` | 项目级文档入口 | 当前结构、运行说明、历史归档索引 |
| `📁 启动工具/` | Finder 启动脚本 | 面向本机操作 |

## 2. 运行产物目录

以下目录可能经常变化，但它们不是“业务源码目录”：

| 目录 | 内容 |
| --- | --- |
| `AB Patrol-Agent/data/` | 巡逻状态、cycle、图表、缓存 |
| `AB Patrol-Agent/run/` | pid、日志、运行期状态 |
| `AB Patrol-Web/.next/` | Next.js 构建产物 |
| `AB Patrol-Web/node_modules/` | Web 依赖 |
| `logs/` | 顶层日志 |

处理原则：

- 这些目录允许有大量运行时变化。
- 不应把结构整理和运行数据清理混为一件事。
- 除非用户明确要求，不批量删除 `AB Patrol-Agent/data/pa_trader/`。

## 3. 历史与个人工作区

以下目录当前保留在根目录，但不作为默认运行路径：

| 目录 | 定位 | 处理原则 |
| --- | --- | --- |
| `📁 开发文档/` | 历史开发记录、升级分析、方案草稿 | 视为历史资料，后续逐步归档，不直接参与运行 |
| `春波的笔记/` | 个人笔记与思考草稿 | 视为个人工作区，不擅自迁移 |
| `🦁 交易员控制台 (Trader Command)/` | 个人任务与工作台资料 | 视为个人工作区，不擅自迁移 |

如果后续要继续清理，只建议做两类动作：

1. 把纯历史技术文档逐步转移到 `docs/archive/`
2. 给个人工作区保留原位，但在文档中标明“非运行目录”

## 4. 当前整理规则

- 不再创建新的平行后端目录。
- 新增 Patrol 相关代码，统一进入 `AB Patrol-Agent/`。
- 新增 Web 相关代码，统一进入 `AB Patrol-Web/`。
- 新增项目说明，优先进入 `docs/` 或对应子系统的 `docs/`。
- 带旧路径、旧架构的历史文档，统一归到 `docs/archive/`。
- 目录的详细功能拆分，统一以 `docs/FOLDER_STRUCTURE.md` 为准。

## 5. 最近一次结构调整

- 已删除：`AB Console-Backend/`
- 已删除：`AB%20Patrol-Agent/`
- 已删除：顶层空目录 `AB/`
- 已新增明确子包：`AB Patrol-Agent/services/signal-service/src/engines/pa/`
- 已新增结构索引：`docs/CURRENT_TRADING_FLOW.md`、`docs/FOLDER_STRUCTURE.md`

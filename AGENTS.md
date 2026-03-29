# AB Patrol 项目操作手册

> 本文档面向 AI 编码 Agent，以当前仓库真实结构为准。
> 更新于 2026-03-28。

---

## 0. 项目结构

```text
Al-brooks-PA/                          项目根目录
├── AB Patrol-Agent/                   当前后端与巡逻主脑
│   ├── config/                        配置文件（`.env`、`.env.example`）
│   ├── data/                          运行态、图表、回测缓存
│   ├── libs/                          共享库与 SQLite 数据
│   ├── runtime/                       巡逻运行时
│   ├── scripts/                       启停脚本
│   ├── services/                      当前启用服务
│   │   ├── consumption/query-service/
│   │   ├── execution-service/
│   │   ├── api-service/
│   │   ├── sync-service/
│   │   ├── signal-service/
│   │   └── vis-service/
│   ├── tools/                         控制脚本与工具
│   ├── docs/                          Patrol 专属文档
│   └── tests/                         测试
├── AB Patrol-Web/                     当前独立 Web（Next.js，端口 3001）
├── AB Console-Obsidian/               Al Brooks 知识库与 Obsidian 插件
├── docs/                              项目级文档
├── 📁 启动工具/                       Finder 启动脚本
└── AGENTS.md                          本文件
```

### 当前目录归属

- `AB Patrol-Agent`：当前唯一后端主目录。
- `AB Patrol-Web`：当前唯一 Web 目录。
- `AB Console-Obsidian`：知识库、课程、复盘与 Obsidian 插件。
- `AB Console-Backend`：已删除，不再作为运行目录。
- `AB%20Patrol-Agent`：已删除，视为历史污染目录。

### 历史文档说明

- `docs/archive/` 与 `AB Patrol-Agent/docs/` 下部分带日期的历史文档，可能保留迁移前路径，仅用于回溯背景。
- 任何当前操作、命令、路径判断，都以本文件和代码现状为准，不以历史快照为准。

### 当前真实运行口径

- live 决策主链默认以规则引擎为主，不再把 LLM 当作开仓必经链路。
- 当前 live 开仓默认只使用 `15m` 交易周期。
- `1h` 只做背景、边界与顺逆势语义，不直接触发开仓。
- 当前 Web 主图是 `lightweight-charts + Python Brooks overlay`，不是静态图片链。
- 当前图表已经是 `策略图 + 市场图` 双标签，并支持按组勾选 Brooks 信号图层。
- 如需评估图表是否替换，优先看：
  `AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md`
- 如需看当前已集成的信号目录、模板字段和可视化落位，优先看：
  `AB Patrol-Agent/docs/BROOKS_SIGNAL_CATALOG_AND_TEMPLATE_VIS_20260328.md`

---

## 1. 允许与禁止

### 1.1 允许的操作

- 修改 `AB Patrol-Agent/runtime/`、`AB Patrol-Agent/tools/`、`AB Patrol-Agent/scripts/`
- 修改 `AB Patrol-Agent/services/*/src/`
- 修改 `AB Patrol-Agent/libs/` 下共享代码
- 修改 `AB Patrol-Agent/config/.env.example`
- 修改 `AB Patrol-Web/src/`、`AB Patrol-Web/scripts/`
- 修改 `AB Console-Obsidian/.obsidian/plugins/al-brooks-console/src/`
- 更新 `README.md`、`AGENTS.md`、`docs/`、`AB Patrol-Agent/docs/`

### 1.2 禁止的操作

- **禁止修改** `AB Patrol-Agent/config/.env`
- **禁止删除** `AB Patrol-Agent/libs/database/` 下真实数据文件，除非用户明确要求
- **禁止修改** 数据库 schema，除非用户明确要求
- **禁止** 无确认地引入未验证第三方依赖
- **禁止** 为了“整理”而回退用户已有改动
- **禁止** 再创建新的“参考后端”平行目录

### 1.3 敏感区域

| 路径 | 说明 | 操作限制 |
|:---|:---|:---|
| `AB Patrol-Agent/config/.env` | 当前生产配置 | 只读 |
| `AB Patrol-Agent/libs/database/services/telegram-service/market_data.db` | 指标展示库 | 只读 |
| `AB Patrol-Agent/libs/database/services/signal-service/cooldown.db` | 信号冷却持久化 | 只读 |
| `AB Patrol-Agent/data/pa_trader/` | 巡逻运行态与历史 cycle | 非必要不批量清理 |

---

## 2. 推荐执行路径

### 2.1 AB Patrol-Agent

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"

# 初始化单服务依赖（Python 项目统一使用 uv）
cd services/api-service
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt

# 返回主目录启动
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
./scripts/start.sh start
./scripts/start.sh status

# 仅拉起 Web 依赖的 sidecar
./scripts/start.sh web-start
./scripts/start.sh web-stop

# 巡逻常驻
./scripts/start.sh loop
./scripts/start.sh loop-stop
```

### 2.2 AB Patrol-Web

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web"
npm install
npm run dev

# 或使用仓库内脚本
bash scripts/start.sh
```

### 2.3 常用验证

```bash
# 后端脚本语法
bash -n "AB Patrol-Agent/scripts/start.sh"

# Python 语法
uv run --no-project python -m py_compile "AB Patrol-Agent/runtime/pa_runtime.py"

# Web 编译
cd "AB Patrol-Web"
npm run build

# 运行态接口
curl "http://127.0.0.1:3001/api/pa-bot/runtime"
curl "http://127.0.0.1:8088/health"
curl "http://127.0.0.1:8089/api/v1/health"
curl "http://127.0.0.1:8087/health"
```

---

## 3. 当前核心模块

### 3.1 后端主线

| 模块 | 路径 | 职责 |
|:---|:---|:---|
| runtime | `AB Patrol-Agent/runtime/` | 巡逻运行时、知识装配、状态读写 |
| query-service | `AB Patrol-Agent/services/consumption/query-service/` | Web / TG 查询接口 |
| execution-service | `AB Patrol-Agent/services/execution-service/` | 持仓、下单、改单、执行桥 |
| api-service | `AB Patrol-Agent/services/api-service/` | Web API 网关 |
| sync-service | `AB Patrol-Agent/services/sync-service/` | Obsidian / 业务数据同步 |
| signal-service | `AB Patrol-Agent/services/signal-service/` | 信号检测与历史 |
| vis-service | `AB Patrol-Agent/services/vis-service/` | 图表与可视化渲染 |

### 3.2 Web 主线

| 模块 | 路径 | 职责 |
|:---|:---|:---|
| Dashboard | `AB Patrol-Web/src/app/` | 页面与 API Route |
| `pa-bot` | `AB Patrol-Web/src/app/(dashboard)/pa-bot/` | Patrol 运行态面板 |
| Charts API | `AB Patrol-Web/src/app/api/charts/` | 图表文件读取与路径映射 |
| Runtime API | `AB Patrol-Web/src/app/api/pa-bot/runtime/` | Patrol 运行态聚合接口 |

### 3.3 当前图表主链

| 模块 | 路径 | 职责 |
|:---|:---|:---|
| 图表数据装配 | `AB Patrol-Agent/tools/diagnostics/trade_chart_data.py` | 组装 live / backtest 图表 payload |
| Brooks 覆盖层 | `AB Patrol-Agent/tools/diagnostics/brooks_chart_overlay.py` | 计算 `H/L`、`ii/ioi/oo`、`MAG`、`MM`、边界位等图层 |
| Web 图表组件 | `AB Patrol-Web/src/components/pa-bot/trade-chart-panel.tsx` | 用 `lightweight-charts` 渲染 K 线、按钮、图层与辅助线 |

### 3.4 知识库

| 模块 | 路径 | 职责 |
|:---|:---|:---|
| Canonical / S 文件 | `AB Console-Obsidian/` | Al Brooks 规则权威来源 |
| Obsidian 插件 | `AB Console-Obsidian/.obsidian/plugins/al-brooks-console/src/` | 知识与控制台插件 |

### 3.5 Al Brooks 原文资料目录

- 当前统一使用的原文资料目录：
  `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/al brooks参考资料agent专用版`
- 之后如果文档里提到“原文资料目录”，都以上述 `agent专用版` 目录为准。

### 3.6 当前权威文档

- 仓库级：
  - `AGENTS.md`
  - `docs/README.md`
  - `docs/CURRENT_TRADING_FLOW.md`
- Patrol 级：
  - `AB Patrol-Agent/docs/README.md`
  - `AB Patrol-Agent/docs/CURRENT_TRADING_FLOW.md`
  - `AB Patrol-Agent/docs/RUNTIME_FLOW.md`
  - `AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md`
  - `AB Patrol-Agent/docs/BROOKS_SIGNAL_CATALOG_AND_TEMPLATE_VIS_20260328.md`

### 3.7 当前 Web 口径

- 当前 Web 必须把两层信息拆开显示：
  - `当前轮次候选 / 可执行 / Gate 拒绝`
  - `真实持仓 / 活动挂单 / 账户快照`
- 当前图表必须支持：
  - `策略图 / 市场图` 双标签
  - 交易品种切换
  - 周期切换
  - 按组勾选 Brooks 信号

---

## 4. 修改约束

### 4.1 架构边界

- `AB Patrol-Agent` 负责巡逻、执行前校验、执行链、运行态、后端接口。
- `AB Patrol-Web` 只负责展示与 Web API 适配，不承载巡逻决策。
- `AB Console-Obsidian` 只负责知识库、插件、课程、复盘，不承载后端服务。

### 4.2 路径原则

- 不再把任何运行时数据写回已经删除的目录。
- 图表统一写到 `AB Patrol-Agent/data/charts/`。
- 巡逻状态统一写到 `AB Patrol-Agent/data/pa_trader/`。
- SQLite 统一位于 `AB Patrol-Agent/libs/database/services/`。

### 4.3 Python 规则

- Python 项目统一使用 `uv` 管理依赖与虚拟环境。
- 优先使用服务自己的 `.venv`，不要混用全局 Python。
- 修改服务依赖后，优先更新该服务的 `requirements.txt` 或对应锁文件。

### 4.4 文档规则

- 目录结构、启动命令、服务位置变更后，必须同步更新 `AGENTS.md` 与相关 README。
- 新增的计划文档、实现文档优先使用中文。
- 代码注释必须使用中文。

---

## 5. 常见命令

```bash
# 查看 Patrol 服务状态
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
./scripts/start.sh status

# 查看最近日志
./scripts/start.sh logs

# 只启动 Web 依赖服务
./scripts/start.sh web-start

# 停止 Web 依赖服务
./scripts/start.sh web-stop

# 启动 Web
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web"
npm run dev

# 检查旧路径残留
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA"
rg -n "AB Console-Backend|AB%20Patrol-Agent" "AB Patrol-Agent" "AB Patrol-Web" "docs"
```

---

## 6. 提交前检查

- 代码是否仍符合当前目录边界
- 是否误引用已删除目录
- 是否跑过必要的语法检查、构建或冒烟测试
- 是否同步更新了相关文档
- 是否避免清理用户生成但仍在使用的数据文件

---

## 7. 一句话原则

当前工程只有三块真实主目录：`AB Patrol-Agent`、`AB Patrol-Web`、`AB Console-Obsidian`。任何实现、文档、脚本如果还把 `AB Console-Backend` 当成当前运行目录，默认视为需要修正。

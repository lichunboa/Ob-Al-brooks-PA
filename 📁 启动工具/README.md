# AB Patrol - 启动工具

一键管理当前主线使用的启动入口。

当前默认主线已经切到 `AB Patrol-Agent`。
`AB Console-Backend` 只保留为基础设施来源和参考项目，不再作为默认一键启动主入口。

## 文件说明

| 脚本 | 功能 |
|------|------|
| `🚀 一键启动.command` | 启动 AB Patrol 主链，可选同时启动 Web |
| `🛑 一键停止.command` | 停止 AB Patrol 主链，可选同时停止 Web |
| `📊 状态检查.command` | 查看 AB Patrol 主链状态 |
| `🚀 交易后端启动.command` | 旧参考入口，保留用于 `AB Console-Backend` 调试 |
| `🤖 Patrol-Agent 一键启动.command` | 启动 AB Patrol 主链别名 |
| `🤖 Patrol-Agent 停止.command` | 停止新 Patrol 架构 |
| `🤖 Patrol-Agent 状态.command` | 查看新 Patrol 架构状态 |
| `🦞 OpenClaw GPT 登录.command` | 使用 OpenAI Codex OAuth 登录 OpenClaw（GPT-5.4） |
| `🦞 打开 OpenClaw 控制台.command` | 使用带 Gateway Token 的地址打开 OpenClaw Control UI |
| `🦞 OpenClaw 状态.command` | 查看 OpenClaw 版本、状态和模型配置 |

## 使用方式

### 方式 1: 在 Obsidian 控制台中

打开控制台 → 后端服务 → 点击「启动后端」按钮

### 方式 2: 终端运行

```bash
# 启动
bash "📁 启动工具/🚀 一键启动.command"

# 停止
bash "📁 启动工具/🛑 一键停止.command"

# 状态
bash "📁 启动工具/📊 状态检查.command"

# 旧参考后端入口（不建议日常使用）
bash "📁 启动工具/🚀 交易后端启动.command"

# 新 Patrol 架构
bash "📁 启动工具/🤖 Patrol-Agent 一键启动.command"
bash "📁 启动工具/🤖 Patrol-Agent 停止.command"
bash "📁 启动工具/🤖 Patrol-Agent 状态.command"

# OpenClaw / GPT 登录与状态
bash "📁 启动工具/🦞 OpenClaw GPT 登录.command"
bash "📁 启动工具/🦞 打开 OpenClaw 控制台.command"
bash "📁 启动工具/🦞 OpenClaw 状态.command"
```

### 方式 3: 双击运行

在 Finder 中双击 `.command` 文件即可。

## 当前建议只用这 4 个入口

- `🚀 一键启动.command`
- `🛑 一键停止.command`
- `📊 状态检查.command`
- `🌐 AB Patrol Web.command`

其余脚本保留给调试和专项场景，不再作为日常主入口。

## 默认主链启动的服务

| 服务 | 端口 | 说明 |
|------|------|------|
| OpenClaw Gateway | 18789 | GPT / agent 网关 |
| execution-service | 8092 | 执行、仓位、风控接口（基础设施） |
| query-service | 8086 | Patrol 状态读取接口 |
| AB Patrol-Agent loop | - | Al Brooks patrol 决策运行时 |
| watchdog | - | 长会话与巡逻卡死恢复 |
| AB Patrol-Web | 3001 | Web 看板（可选） |

## 长会话运行说明

- `AB Patrol-Agent loop`、`query-service`、`watchdog` 默认在 macOS Terminal 标签页中启动。
- 每个标签页现在都带轻量监督壳：子进程异常退出后会自动续跑。
- `watchdog` 不再走整套全栈恢复，而是按故障类型只处理 `loop` 或 `query-service`。
- 如果你需要手动运维，可用这些内部命令：

```bash
bash "AB Patrol-Agent/scripts/start.sh" loop-start
bash "AB Patrol-Agent/scripts/start.sh" loop-stop
bash "AB Patrol-Agent/scripts/start.sh" loop-restart
bash "AB Patrol-Agent/scripts/start.sh" query-start
bash "AB Patrol-Agent/scripts/start.sh" query-stop
bash "AB Patrol-Agent/scripts/start.sh" query-restart
bash "AB Patrol-Agent/scripts/start.sh" watchdog-start
bash "AB Patrol-Agent/scripts/start.sh" watchdog-stop
bash "AB Patrol-Agent/scripts/start.sh" watchdog-restart
```

## 说明

- `AB Patrol-Agent` 的实时交易脑子使用原 `patrol-l1` skill 与 S 文件。
- `PA交易 Crypto` 是 TG 话题里的操作 / 状态输出入口。
- `@abconsole_backend_bot` 属于旧 Backend 侧 Bot，不是 `PA交易 Crypto`。
- `AB Console-Backend` 默认不再由一键启动拉起整套服务，只按需借用 `execution-service`。

## OpenClaw Control UI

- 正确入口：`openclaw dashboard` 或 `bash "📁 启动工具/🦞 打开 OpenClaw 控制台.command"`
- 不要直接访问 `http://127.0.0.1:18789/overview`
- 原因：裸地址不会附带 Gateway Token，页面会提示“缺少网关令牌 / gateway token missing”

## 查看日志

```bash
# AB Patrol-Agent
tail -f "AB Patrol-Agent/run/service.log"

# watchdog
tail -f "AB Patrol-Agent/run/watchdog.log"

# Web
tail -f "AB Patrol-Agent/run/web.log"
```

# AB Patrol-Agent 启动工具

快速启动和管理 AB Patrol-Agent 系统的工具集。

## 📁 文件说明

### 核心工具（保留 4 个）

1. **🚀 一键启动.command**
   - 主启动脚本，支持多种模式
   - 模式 1：交易主链（execution + patrol + query + watchdog）
   - 模式 2：交易主链 + Web
   - 模式 3：仅 Web
   - 模式 4：仅状态检查

2. **🛑 一键停止.command**
   - 停止服务脚本
   - 模式 1：停止交易主链
   - 模式 2：停止交易主链 + Web
   - 模式 3：仅停止 Web

3. **📊 状态检查.command**
   - 查看所有服务的运行状态
   - 显示端口占用情况
   - 显示进程信息

4. **🤖 Patrol-Agent 一键启动.command**
   - 快速启动 Patrol-Agent（带可见控制台）
   - 适合调试和观察日志

**已删除的脚本**（重复或不常用）：
- ~~🚀 交易后端启动.command~~
- ~~🤖 Patrol-Agent 停止.command~~
- ~~🤖 Patrol-Agent 状态.command~~
- ~~🤖 Patrol-Agent 调试.command~~
- ~~🦞 OpenClaw GPT 登录.command~~
- ~~🦞 OpenClaw 状态.command~~
- ~~🦞 打开 OpenClaw 控制台.command~~
- ~~🌐 AB Patrol Web.command~~

## 🚀 快速开始

### 首次使用

1. 配置环境变量
   ```bash
   cd "AB Patrol-Agent"
   cp config/.env.example config/.env
   # 编辑 config/.env，填入必要的配置
   ```

2. 双击 `🚀 一键启动.command`

3. 选择启动模式（推荐选择 2：交易主链 + Web）

### 日常使用

- **启动系统**：双击 `🚀 一键启动.command`
- **停止系统**：双击 `🛑 一键停止.command`
- **查看状态**：双击 `📊 状态检查.command`
- **调试模式**：双击 `🤖 Patrol-Agent 一键启动.command`

## 📊 服务说明

### 交易主链包含：

| 服务 | 端口 | 说明 |
|------|------|------|
| execution-service | 8092 | 交易执行服务，管理订单和持仓 |
| patrol-agent | - | 主交易逻辑，市场扫描和信号生成 |
| query-service | 8086 | 数据查询服务，K 线数据缓存 |
| watchdog | - | 监控服务健康状态，自动重启异常服务 |
| OpenClaw Gateway | 18789 | GPT / agent 网关（可选） |

### Web 界面：

- **AB Patrol-Web** (端口 3001)
  - 访问地址：http://localhost:3001/pa-bot
  - 实时监控交易状态
  - 查看持仓和订单
  - 查看市场分析

## 🔧 高级用法

### 命令行启动

如果你更喜欢命令行，可以直接使用：

```bash
# 启动交易主链
cd "AB Patrol-Agent"
bash scripts/start.sh stack-start --execute

# 启动 Web
bash scripts/start.sh web-start

# 停止所有服务
bash scripts/start.sh stack-stop

# 查看状态
bash scripts/start.sh status
```

### 单独管理服务

```bash
# patrol-agent
bash "AB Patrol-Agent/scripts/start.sh" loop-start
bash "AB Patrol-Agent/scripts/start.sh" loop-stop
bash "AB Patrol-Agent/scripts/start.sh" loop-restart

# query-service
bash "AB Patrol-Agent/scripts/start.sh" query-start
bash "AB Patrol-Agent/scripts/start.sh" query-stop
bash "AB Patrol-Agent/scripts/start.sh" query-restart

# watchdog
bash "AB Patrol-Agent/scripts/start.sh" watchdog-start
bash "AB Patrol-Agent/scripts/start.sh" watchdog-stop
bash "AB Patrol-Agent/scripts/start.sh" watchdog-restart
```

### 查看日志

```bash
# 查看 patrol-agent 日志
tail -f "AB Patrol-Agent/run/patrol.log"

# 查看 execution-service 日志
tail -f "AB Patrol-Agent/run/execution.log"

# 查看 query-service 日志
tail -f "AB Patrol-Agent/run/query.log"

# 查看 watchdog 日志
tail -f "AB Patrol-Agent/run/watchdog.log"

# 查看 Web 日志
tail -f "AB Patrol-Agent/run/web.log"
```

## ⚠️ 注意事项

1. **首次启动**：首次启动可能需要几分钟来初始化数据和缓存

2. **端口占用**：确保以下端口未被占用
   - 8092 (execution-service)
   - 8086 (query-service)
   - 3001 (web)
   - 18789 (OpenClaw Gateway，可选)

3. **OpenClaw Gateway**：
   - 如果需要 Telegram 对话功能，需要启动 OpenClaw Gateway
   - 脚本会自动检测并尝试启动
   - 正确入口：`openclaw dashboard` 或使用带 Gateway Token 的地址

4. **停止服务**：
   - 使用 `🛑 一键停止.command` 停止服务
   - OpenClaw Gateway 默认保留运行（方便 TG 继续可用）

5. **长会话运行**：
   - patrol-agent、query-service、watchdog 在 macOS Terminal 标签页中启动
   - 每个标签页带轻量监督壳：子进程异常退出后会自动续跑
   - watchdog 按故障类型只处理 loop 或 query-service

## 🐛 故障排查

### 服务启动失败

1. 检查日志文件：`AB Patrol-Agent/run/*.log`
2. 检查端口是否被占用：`lsof -i :8092`
3. 检查配置文件：`AB Patrol-Agent/config/.env`

### Web 无法访问

1. 确认 Web 服务已启动：`lsof -i :3001`
2. 检查 Web 日志：`AB Patrol-Agent/run/web.log`
3. 尝试重新构建：`cd "AB Patrol-Web" && npm run build`

### 交易不执行

1. 检查 `AB_PATROL_ENABLE_AUTOTRADE` 是否设置为 1
2. 检查 execution-service 是否正常运行
3. 查看 patrol-agent 日志确认是否有信号生成

### OpenClaw Gateway 问题

1. 检查 Gateway 是否运行：`lsof -i :18789`
2. 不要直接访问 `http://127.0.0.1:18789/overview`（会提示缺少 token）
3. 使用 `openclaw dashboard` 命令打开控制台

## 📚 相关文档

- [系统检查结果](../AB Patrol-Agent/docs/SYSTEM_CHECK_RESULTS_20260310.md)
- [代码与 SKILL 差异分析](../AB Patrol-Agent/docs/SKILL_CODE_GAP_ANALYSIS_20260310.md)
- [最终总结](../AB Patrol-Agent/docs/FINAL_SUMMARY_20260310.md)
- [cTrader 配置说明](../AB Patrol-Agent/docs/CTRADER_SETUP.md)

## 🆘 获取帮助

如果遇到问题：

1. 查看日志文件
2. 运行 `📊 状态检查.command` 查看服务状态
3. 查阅相关文档
4. 提交 Issue 到 GitHub

---

**最后更新**：2026-03-10

**当前架构**：AB Patrol-Agent 是主线，AB Console-Backend 只保留为基础设施来源和参考项目

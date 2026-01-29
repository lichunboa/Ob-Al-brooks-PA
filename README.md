# 🦁 AB Console - Al Brooks 交易控制台

> 基于 Al Brooks 价格行为方法论的专业交易工作空间

---

## 📁 项目结构

```
Al-brooks-PA/                          # 项目根目录
│
├── 📁 启动工具/              # 🚀 启动脚本和工具
│   ├── 🚀 启动 AB Console.command      # macOS 启动图标
│   ├── 🚀 启动 AB Console.bat          # Windows 启动图标
│   ├── 🛑 停止 AB Console.command      # macOS 停止图标
│   ├── 🛑 停止 AB Console.bat          # Windows 停止图标
│   ├── 🎯 快速启动.html                # HTML 启动器
│   ├── 📖 启动指南.md                  # 详细启动说明
│   ├── start-all.sh                    # Bash 启动脚本
│   ├── stop-all.sh                     # Bash 停止脚本
│   ├── start-backend.sh                # Bash 仅后端脚本
│   └── 🔧 修复并启动Docker.sh          # Docker 修复脚本
│
├── 📁 开发文档/              # 📚 技术文档
│   ├── AGENTS.md                       # AI Agent 操作手册
│   ├── BACKEND_INTEGRATION.md          # 后端集成说明
│   ├── SYNC_ARCHITECTURE.md            # 同步架构设计
│   ├── ARCHITECTURE_COMPARISON.md      # 架构对比分析
│   └── PROJECT_STRUCTURE.md            # 项目结构说明
│
├── 📁 任务记录/              # 📝 分析报告和记录
│   ├── ANALYSIS_REPORT.md
│   ├── COMPLETION_REPORT.md
│   ├── FUNCTION_CHECK.md
│   ├── USER_REQUIREMENTS.md
│   ├── BACKEND_CONTROLS.md
│   └── 文件整理报告.md
│
├── 📁 项目管理/              # ⚙️ 项目配置
│   ├── config.json
│   └── views.json
│
├── AB Console-Backend/       # 🔧 后端服务 (Docker)
│   ├── services/                       # 微服务目录
│   │   ├── api-gateway/               # API 网关 + Obsidian 同步
│   │   ├── data-service/              # 数据采集服务
│   │   ├── trading-service/           # 指标计算服务
│   │   ├── signal-service/            # 信号检测服务
│   │   ├── telegram-service/          # Telegram Bot
│   │   └── ai-service/                # AI 分析服务
│   └── docker-compose.yml             # Docker 编排
│
├── AB Console-Obsidian/      # 📒 Obsidian Vault + 插件
│   └── .obsidian/plugins/al-brooks-console/
│
├── AB Console-Web/           # 🌐 Web Dashboard (Next.js)
│
└── (其他 Obsidian Vault 目录...)
```

---

## 🚀 快速开始

### 系统要求

- **Docker Desktop** - 必需，用于运行后端服务
- **Obsidian** - 知识管理和插件
- **Node.js 18+** - Web Dashboard (可选)

### 1. 启动服务

**macOS**:
```bash
# 双击图标
📁 启动工具/🚀 启动 AB Console.command

# 或终端
./📁\ 启动工具/start-all.sh
```

**Windows**:
```bash
# 双击图标
📁 启动工具/🚀 启动 AB Console.bat
```

### 2. 访问服务

| 服务 | URL |
|------|-----|
| Web Dashboard | http://localhost:3000 |
| API Gateway | http://localhost:8088 |
| API 文档 | http://localhost:8088/docs |

### 3. 打开 Obsidian

使用 AB Console 插件进行交易记录和分析。

---

## ⚠️ 重要说明

### 只支持完整后端

AB Console **只提供完整后端方案**，所有功能都依赖 Docker 运行：

- ✅ TimescaleDB 数据库
- ✅ 实时数据采集
- ✅ 技术指标计算
- ✅ 交易信号检测
- ✅ AI 分析服务
- ✅ Obsidian 同步

**如果 Docker 有问题，请修复 Docker**，没有简化替代方案。

### Docker 故障修复

如果 Docker 启动失败:

1. **重启 Docker Desktop**
   ```bash
   killall Docker
   sleep 10
   open /Applications/Docker.app
   ```

2. **使用修复脚本**
   ```bash
   ./📁\ 启动工具/🔧\ 修复并启动Docker.sh
   ```

3. **查看完整指南**
   ```
   📁 启动工具/📖 启动指南.md
   ```

---

## 📖 文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 启动指南 | `📁 启动工具/📖 启动指南.md` | 启动说明和故障排查 |
| 后端控制 | `📁 任务记录/BACKEND_CONTROLS.md` | 控制方式汇总 |
| AI 手册 | `📁 开发文档/AGENTS.md` | Agent 操作手册 |
| 集成说明 | `📁 开发文档/BACKEND_INTEGRATION.md` | 后端集成详情 |

---

## 📝 版本信息

- **AB Console**: v2.1.0
- **Obsidian 插件**: v1.7.0
- **后端服务**: v2.1.0

---

*基于 Al Brooks 价格行为方法论构建*

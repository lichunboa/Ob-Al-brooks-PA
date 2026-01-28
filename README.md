# 🦁 AB Console 交易员控制台

> Al Brooks 价格行为交易系统的完整解决方案

---

## 📁 新的项目结构

为了优化 Obsidian 性能，项目已重新组织为三个独立文件夹：

```
Al-brooks-PA/
├── AB Console-Obsidian/          # Obsidian Vault（知识管理）
├── AB Console-Web/               # Web Dashboard（实时交易）
├── AB Console-Backend/           # 后端服务（数据服务）
└── docs/                       # 项目文档
```

**重要**: 现在需要在 Obsidian 中打开 `AB Console-Obsidian` 文件夹，而不是整个项目根目录。

---

## 🚀 快速开始

### 1. 启动后端服务

```bash
cd AB Console-Backend/backend/tradecat-core/services/websocket-service
python3 simple_server.py

# 服务运行在 http://localhost:8088
# 自动从 Binance 获取真实市场数据
```

### 2. 启动 Web Dashboard

```bash
cd AB Console-Web/tradecat-dashboard
npm run dev

# 访问 http://localhost:3000
```

### 3. 使用 Obsidian

1. 在 Obsidian 中打开 `AB Console-Obsidian` 文件夹
2. 启用 "Al Brooks Console" 插件

---

## 📖 详细文档

- [项目结构说明](./PROJECT_STRUCTURE.md)
- [架构设计文档](./docs/architecture/架构分析-三分离方案.md)
- [开发指南](./docs/)

---

## 📊 功能状态

| 组件 | 状态 | 版本 |
|------|------|------|
| Obsidian 插件 | 🟡 稳定 | v1.7.0 |
| Web Dashboard | 🟡 开发中 | v0.1.0 |
| 后端服务 | 🟢 运行中 | v2.0.0 |

---

*详细文档见 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)*

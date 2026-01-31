> **⚠️ 历史文档 (2026-01 重组前)** — 本文记录的路径和架构可能已过时，仅供参考。当前项目结构请查看 `📁 开发文档/PROJECT_STRUCTURE.md`。

# Obsidian 插件文档

## 简介

Al Brooks Console 是 Obsidian 的原生插件，用于交易知识管理和复盘分析。

## 功能

### 核心功能

- **交易笔记**: 从模板创建交易笔记
- **复盘分析**: 自动生成交易复盘报告
- **策略卡片**: 管理和维护交易策略
- **知识库索引**: 标签和笔记的快速检索

### 与 Web Dashboard 的区别

| 功能 | Obsidian 插件 | Web Dashboard |
|------|---------------|---------------|
| 交易笔记 | ✅ 主力 | 查看 |
| 复盘分析 | ✅ 主力 | 查看 |
| 策略卡片 | ✅ 主力 | 查看 |
| K线图表 | ❌ 已移除 | ✅ 主力 |
| 市场扫描 | ❌ 已移除 | ✅ 主力 |
| 实时信号 | ❌ 已移除 | ✅ 主力 |

## 项目结构

```
.obsidian/plugins/al-brooks-console/
├── src/
│   ├── core/              # 核心业务逻辑
│   ├── views/             # UI 视图
│   ├── components/        # React 组件
│   ├── hooks/             # React Hooks
│   └── main.ts            # 插件入口
├── manifest.json          # 插件配置
└── package.json
```

## 安装

### 从源码安装

```bash
cd .obsidian/plugins/al-brooks-console
npm install
npm run build
```

### 启用插件

1. 打开 Obsidian 设置
2. 进入 "第三方插件"
3. 启用 "Al Brooks Console"

## 使用

### 命令

- `打开交易员控制台`: 打开主视图
- `新建交易笔记`: 从模板创建交易笔记
- `导出索引快照`: 导出交易数据

### 模板

模板文件位于 `Templates/` 目录：

- `单笔交易模版 (Trade Note).md`
- `每日复盘模版 (Daily Journal).md`
- `属性值预设.md`

## 配置

### 插件设置

在 Obsidian 设置中配置：

- 交易笔记保存路径
- 复盘模板选择
- 后端 API 地址

### 与 Web Dashboard 联动

插件可以打开 Web Dashboard：

```typescript
// 在浏览器中打开图表
window.open('http://localhost:3000/chart?symbol=BTCUSDT', '_blank');
```

## 开发

### 构建

```bash
npm run dev      # 开发模式
npm run build    # 生产构建
```

### 调试

1. 打开 Obsidian 开发者工具 (Ctrl+Shift+I)
2. 查看控制台输出
3. 使用 debugger 语句断点调试

## 迁移说明

### 已移除的功能

以下功能已迁移到 Web Dashboard：

- 实时 K线图表
- 市场扫描仪
- 信号监控面板
- 策略回测界面

### 保留的核心功能

- 交易笔记管理
- 复盘分析
- 策略卡片
- 知识库索引

## 数据同步

Obsidian 笔记可以通过以下方式与 Web Dashboard 同步：

1. **文件系统**: Web Dashboard 读取 Obsidian vault
2. **后端 API**: 通过后端服务中转
3. **手动导出**: 导出笔记为 JSON

## Roadmap

### Phase 1: 精简版 ✅
- [x] 移除重型组件
- [x] 添加 Web Dashboard 入口
- [x] 优化启动速度

### Phase 2: 集成版 🟡
- [ ] 笔记自动同步到 Web
- [ ] Web 交易记录回写 Obsidian
- [ ] 统一登录认证

### Phase 3: AI 版 ❌
- [ ] AI 辅助复盘
- [ ] 智能标签推荐
- [ ] 知识图谱

---

*详见 API 文档: [API.md](./API.md)*

# AL-Brooks PA 项目操作规范

## 项目结构（v2.5.0 基线）

```
根目录/
├── AB Console-Backend/        # 后端 6 微服务（唯一后端）
├── AB Console-Obsidian/       # Obsidian vault（唯一笔记库）
├── docs/                      # 项目级文档
├── AGENTS.md, LICENSE, config.json, views.json
├── 📁 任务记录/ 📁 启动工具/ 📁 开发文档/ 📁 项目管理/
└── 🦁 交易员控制台 (Trader Command)/
```

**规则：根目录只有以上内容，不允许出现其他文件夹或笔记文件。**

## 踩过的坑 — 必须避免

### 1. git 分支切换导致旧文件复现
- **问题**：main 分支跟踪着旧文件（Categories/、Notes/、services/ 等），切到 main 时 git 恢复这些文件，切回修复分支时如果有本地修改则不会自动清理，导致根目录出现大量垃圾
- **规则**：在当前分支完成所有操作后再切换分支。切换前确认工作区干净（git status）。切换后立即 `ls` 验证根目录结构

### 2. git add -A / git add . 误添加大量文件
- **问题**：曾经 `git add -A` 误将 4608 个 Obsidian vault 文件加入暂存区
- **规则**：永远用 `git add <具体文件>` 添加，不要用 `git add -A` 或 `git add .`

### 3. 移动文件夹时创建重复
- **问题**：用 `mv` 移动 🦁 交易员控制台到根目录后，Obsidian vault 内的原版没有删除，导致两个位置都有但内容不同
- **规则**：移动文件夹时，移动完成后立即验证源位置已删除。如果两个位置内容不同，先合并再删除旧的

### 4. 未跟踪文件不会被 git rm 管理
- **问题**：📁 文件夹不在 git 跟踪中，用 `git mv` 会失败
- **规则**：移动前先确认文件是否被 git 跟踪（`git ls-files`），未跟踪的用 `mv`，已跟踪的用 `git mv`

### 5. 插件 main.js 被 gitignore 不可恢复
- **问题**：插件构建产物 main.js 被 .gitignore 排除，git 历史中没有，丢失后只能从源码重新构建
- **规则**：修改插件源码后必须 `npm run build` 重新构建。源码在 git 中，main.js 不在

### 6. 大操作前必须确认范围
- **规则**：涉及文件移动、删除、目录结构变更时，先列出将要执行的操作，等用户确认后再执行。操作后用 `ls` 验证结果

## 服务端口

| 服务 | 端口 |
|------|------|
| API Service | 8088 |
| Sync Service | 8089 |
| TimescaleDB | 5434 |
| Web Dashboard | 3000 |

## 插件构建

```bash
cd "AB Console-Obsidian/.obsidian/plugins/al-brooks-console"
npm run build
```

## Git 标签

- `v1.7.0-stable` — 策略匹配修复前的基线
- `v2.0.0` — 首个后端完整版
- `v2.4.0` — PA Engine + 健康检查 + OpenClaw 配置同步
- `v2.5.0` — Gemini 多模型 + 信号路由优化 + 账户重置（当前）

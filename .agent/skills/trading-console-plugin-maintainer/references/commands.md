# Commands & Debug Quickstart（命令速查）

> 目标：最短路径完成“定位 → 小步修改 → build 门禁 → Obsidian 内验证 → 出问题可回滚”。

## 进入插件目录

```bash
cd "/Users/mitchellcb/Library/Mobile Documents/iCloud~md~obsidian/Documents/Al-brooks-PA/.obsidian/plugins/al-brooks-console"
```

## 构建门禁（每次结构性改动后必跑）

```bash
npm run build
```

建议用法（更稳）：

```bash
npm run build && echo "BUILD OK"
```

## 快速定位（大文件改动前）

### 在仓库内搜索关键词（例如模块标题/锚点）

```bash
rg "✅ 每日行动|📥 导出|交易中心|最近活动" -S
```

### 只在 Dashboard.tsx 内查（避免误删其它文件）

```bash
rg "✅ 每日行动|daily|activePage" src/views/Dashboard.tsx -n
```

## Git 安全网（回滚与对照）

### 看当前改了什么

```bash
git status
```

### 看工作区差异

```bash
git diff
```

### 丢弃某个文件的本地改动（单文件回退）

> 适用：出现“半截 JSX / import 被污染”导致大量解析错误时。

```bash
git restore src/views/Dashboard.tsx
```

### 从某个 commit 恢复单文件（需要你指定 commit）

```bash
git checkout <commit_sha> -- src/views/Dashboard.tsx
```

## Obsidian 内验证（手工步骤）

- 打开 Obsidian → 设置 → 第三方插件
- 确认 `AL-Brooks Console` 已启用
- 修改后如未生效：
  - 关闭并重新打开 Obsidian（最可靠）
  - 或在“插件”里禁用 → 启用一次

## 常见故障排查

### 1) `npm run build` 报一堆 TSX 语法错误

- 典型原因：删除/替换块边界不完整（残留半截 JSX）。
- 建议动作：
  - 先 `git restore src/views/Dashboard.tsx`
  - 重新用“稳定锚点”夹住范围分小步删改

### 2) Build 通过但 Obsidian 里 UI 没变化

- 确认你改的是正确 vault 下的插件目录（避免改到复制品）
- 关开 Obsidian 或重启插件

### 3) 某功能依赖外部插件（Tasks/QuickAdd）导致报错

- 原则：调用前必须 capability 检测（`can("...")`）
- 处理：缺失则显示提示，不要直接调用命令

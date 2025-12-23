# 🦁 交易员控制台 v5.0 (Minimalist)

```dataviewjs
// --- 核心引擎加载 ---
await dv.view("scripts/pa-core");
```

### ⚔️ 交易中心 (Trading Hub)
> 盘中专注区域：左侧监控今日状态，右侧快速开仓与趋势概览。

```dataviewjs
await dv.view("scripts/pa-view-hub-trading");
```

---

### 📊 数据中心 (Analytics Hub)
> 盘后复盘区域：账户总览与深度分析（资金曲线、环境分析、错误归因）。

```dataviewjs
await dv.view("scripts/pa-view-hub-analytics");
```

---

### 📚 学习中心 (Learning Hub)
> 知识积累区域

```dataviewjs
// 1. 课程进度
await dv.view("scripts/pa-view-course");
```

> [!quote]- 🧠 记忆与策略 (点击展开)
> ```dataviewjs
> await dv.view("scripts/pa-view-memory");
> ```
> ```dataviewjs
> await dv.view("scripts/pa-view-playbook");
> ```

---

### ⚙️ 系统管理 (System)

> [!bug]- 🛡️ 系统巡检 (Admin Only)
> ```dataviewjs
> await dv.view("scripts/pa-view-inspector");
> ```
> ```dataviewjs
> await dv.view("scripts/pa-view-schema");
> ```
> ```dataviewjs
> // 导出按钮
> const btn = dv.el("button", "📥 备份数据库");
> btn.onclick = async () => {
>     const exportData = JSON.stringify(window.paData, null, 2);
>     await app.vault.adapter.write("pa-db-export.json", exportData);
>     new Notice("✅ 备份完成");
> };
> ```


# 🦁 交易员控制台 v5.0 (Minimalist)

```dataviewjs
// --- 核心引擎加载 ---
await dv.view("scripts/pa-core");

// 样式定义
const style = {
    hub: "background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 16px; margin-bottom: 20px;",
    header: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;",
    title: "font-size: 1.1em; font-weight: 700; opacity: 0.9; display: flex; align-items: center; gap: 8px;",
    grid2: "display: grid; grid-template-columns: 1fr 1fr; gap: 16px;",
    grid3: "display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;",
};

// --- 1. ⚔️ 交易中心 (Trading Hub) ---
dv.el("div", `
    <div style="${style.header}">
        <div style="${style.title}">⚔️ 交易中心 (Trading Hub)</div>
        <div style="font-size: 0.8em; opacity: 0.6;">Focus & Execute</div>
    </div>
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px;">
        <div id="hub-trading-left"></div>
        <div id="hub-trading-right" style="display: flex; flex-direction: column; gap: 16px;"></div>
    </div>
    <div id="hub-trading-bottom" style="margin-top: 16px;"></div>
`, { attr: { style: style.hub } });

// 渲染子视图 (使用现有脚本)
// 注意：由于现有脚本通常直接输出，我们需要一点技巧或者接受它们按顺序渲染
// 更好的方式是重构脚本，但这里我们先按顺序展示，模拟布局
```

> [!tip] 布局说明
> 由于当前脚本直接输出到流，无法通过简单的 HTML 容器包裹。
> 下方展示的是 **逻辑分组** 后的视图顺序。
> **下一步计划**: 将这些视图的代码封装为可调用的函数，以便嵌入到上面的 Grid 布局中。

### ⚔️ 交易中心 (Trading Hub)
> 盘中专注区域

```dataviewjs
// 1. 今日看板 (左侧)
await dv.view("scripts/pa-view-today");
```
```dataviewjs
// 2. 快速行动 (右侧)
await dv.view("scripts/pa-view-actions");
```
```dataviewjs
// 3. 实时趋势 (底部)
await dv.view("scripts/pa-view-trend");
```

---

### 📊 数据中心 (Analytics Hub)
> 盘后复盘区域

```dataviewjs
// 1. 账户总览
await dv.view("scripts/pa-view-account");
```

> [!example]- 📈 深度分析图表 (点击展开)
> ```dataviewjs
> dv.header(4, "资金曲线");
> await dv.view("scripts/pa-view-strategy");
> ```
> ```dataviewjs
> dv.header(4, "环境分析");
> await dv.view("scripts/pa-view-cycle");
> ```
> ```dataviewjs
> dv.header(4, "错误归因");
> await dv.view("scripts/pa-view-tuition");
> ```

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


# ⌨️ 总控制台

```dataviewjs
// 加载引擎
await dv.view("scripts/pa-core");
```
## 📚 学习模块
```dataviewjs
// 加载记忆库
await dv.view("scripts/pa-view-memory");
```
```dataviewjs
// 🗺️ 课程地图 (Course Matrix)
await dv.view("scripts/pa-view-course");
```
```dataviewjs
// 📘 策略仓库 (Strategy Repository)
await dv.view("scripts/pa-view-playbook");
```
```dataviewjs
// 🖼️ 最新复盘 (Charts)
await dv.view("scripts/pa-view-gallery");
```

## ⚔️ 交易模块
```dataviewjs
// 🚀 快速行动 (Quick Actions)
await dv.view("scripts/pa-view-actions");
```
```dataviewjs
// 📊 今日实时监控
await dv.view("scripts/pa-view-today");
```
```dataviewjs
// 账户数据
await dv.view("scripts/pa-view-account");
```
```dataviewjs
// 资金增长曲线 (Capital Growth)
await dv.view("scripts/pa-view-strategy");
```
```dataviewjs
// 📈 综合趋势 (R-Multiples)
await dv.view("scripts/pa-view-trend");
```
```dataviewjs
// 不同市场环境表现 (Live PnL)
await dv.view("scripts/pa-view-cycle");
```
```dataviewjs
// 💸 错误的代价 (学费统计)
await dv.view("scripts/pa-view-tuition");
```
## �️ 系统管理与巡检 (Admin & Inspector)
```dataviewjs// 导出数据按钮 (Manual Export)
const btnExport = dv.el("button", "📥 导出 JSON (App)", { attr: { style: "margin-bottom: 10px; cursor: pointer; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 6px 12px; border-radius: 6px; color: #ccc;"} });
btnExport.onclick = async () => {
    const exportData = JSON.stringify(window.paData, null, 2);
    await app.vault.adapter.write("pa-db-export.json", exportData);
    new Notice("✅ 数据已导出到根目录: pa-db-export.json");
};
```
```dataviewjs// 数据治理与巡检
await dv.view("scripts/pa-view-inspector");
```
```dataviewjs
// 数据治理与巡检2
await dv.view("scripts/pa-view-schema");
```
```dataviewjs
// 属性管理
await dv.view("scripts/pa-view-manager");
```

> [!quote] 🛠️ 维护任务 (Maintenance Tasks)
> **🖨️ 待打印 (Print Queue)**
>
> ```tasks
> not done
> tag includes #task/print
> path does not include Templates
> hide backlink
> short mode
> ```
>
> **📂 待整理 (Organize)**
>
> ```tasks
> not done
> tag includes #task/organize
> path does not include Templates
> hide backlink
> short mode
> ```
# ✅ 每日行动 (Actions)

> [!COLUMN]
>
> > [!failure] 🔥 必须解决 (Inbox & Urgent)
> > **❓ 疑难杂症 (Questions)**
> >
> > ```tasks
> > not done
> > tag includes #task/question
> > path does not include Templates
> > hide backlink
> > short mode
> > ```
> >
> > **🚨 紧急事项 (Urgent)**
> >
> > ```tasks
> > not done
> > tag includes #task/urgent
> > path does not include Templates
> > hide backlink
> > short mode
> > ```
>
> > [!todo] 🛠️ 持续改进 (Improvement)
> > **🧪 回测任务 (Backtest)**
> >
> > ```tasks
> > not done
> > tag includes #task/backtest
> > path does not include Templates
> > hide backlink
> > short mode
> > ```
> >
> > **📝 复盘任务 (Review)**
> >
> > ```tasks
> > not done
> > tag includes #task/review
> > path does not include Templates
> > hide backlink
> > short mode
> > ```
> >
> > **📖 待学习/阅读 (Study)**
> >
> > ```tasks
> > not done
> > (tag includes #task/study) OR (tag includes #task/read) OR (tag includes #task/watch)
> > path does not include Templates
> > limit 5
> > hide backlink
> > short mode
> > ```
> >
> > **🔬 待验证想法 (Verify)**
> >
> > ```tasks
> > not done
> > tag includes #task/verify
> > path does not include Templates
> > hide backlink
> > short mode
> > ```

> [!COLUMN]
>
> > [!NOTE] 📅 每日例行 (Routine)
> > **📝 手动打卡 (Checklist)**
> >
> > - [ ] ☀️ **盘前**：阅读新闻，标记关键位 (S/R Levels) 🔁 every day
> > - [ ] 🧘 **盘中**：每小时检查一次情绪 (FOMO Check) 🔁 every day
> > - [ ] 🌙 **盘后**：填写当日 `复盘日记` 🔁 every day
> >
> > **🧹 杂项待办 (To-Do)**
> >
> > ```tasks
> > not done
> > tag includes #task/todo
> > path does not include Templates
> > hide backlink
> > short mode
> > limit 5
> > ```

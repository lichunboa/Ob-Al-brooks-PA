# 🦁 交易员控制台 v5.0

```dataviewjs
// --- 核心引擎加载 ---
await dv.view("scripts/pa-core");
```

## ⚔️ 交易中心 (Trading Hub)

```dataviewjs
// 1. 今日看板 (含快速行动)
await dv.view("scripts/pa-view-today");
```

## 📊 数据中心 (Analytics Hub)

```dataviewjs
// 整合了: 账户总览 + 资金曲线 + 环境分析 + 错误归因
await dv.view("scripts/pa-view-hub-analytics");
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

## 📉 管理模块

```dataviewjs
// 数据治理与巡检
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

> [!quote] 🛠️ 等待任务 (Maintenance Tasks)
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

```dataviewjs
// 导出按钮
const btn = dv.el("button", "📥 备份数据库");
btn.onclick = async () => {
    const exportData = JSON.stringify(window.paData, null, 2);
    await app.vault.adapter.write("pa-db-export.json", exportData);
    new Notice("✅ 备份完成");
};
```

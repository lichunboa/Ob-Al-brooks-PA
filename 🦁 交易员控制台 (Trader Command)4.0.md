# ⌨️ 总控制台

```dataviewjs
// 导出数据按钮 (Manual Export)
const btnExport = dv.el("button", "📥 导出 JSON (App)", { attr: { style: "margin-bottom: 20px; cursor: pointer;"} });
btnExport.onclick = async () => {
    // 这里的 window.paData 就是引擎算好的数据
    const exportData = JSON.stringify(window.paData, null, 2);
    // 写入到根目录的 pa-db-export.json 文件中
    await app.vault.adapter.write("pa-db-export.json", exportData);
    new Notice("✅ 数据已导出到根目录: pa-db-export.json");
};
```

```dataviewjs
// 加载引擎
await dv.view("scripts/pa-core");
```

```dataviewjs
// 📊 今日实时监控
await dv.view("scripts/pa-view-today");
```

## 🧠 知识与记忆

```dataviewjs
// 🗺️ 课程地图 (Course Matrix)
await dv.view("scripts/pa-view-course");
```

```dataviewjs
// 📘 策略剧本 (Playbook)
await dv.view("scripts/pa-view-playbook");
```

## 📊 账户全景

```dataviewjs
await dv.view("scripts/pa-view-account");
```

```dataviewjs
// 📈 综合趋势 (R-Multiples)
await dv.view("scripts/pa-view-trend");
```

## 📉 策略实验室

```dataviewjs
// 资金增长曲线 (Capital Growth)
await dv.view("scripts/pa-view-strategy");
```

```dataviewjs
// 不同市场环境表现 (Live PnL)
await dv.view("scripts/pa-view-cycle");
```

```dataviewjs
// 💸 错误的代价 (学费统计)
await dv.view("scripts/pa-view-tuition");
```

## 🖼️ 综合画廊

```dataviewjs
// 🖼️ 最新复盘 (Charts)
await dv.view("scripts/pa-view-gallery");
```

```dataviewjs
// 🚀 快速行动 (Quick Actions)
await dv.view("scripts/pa-view-actions");
```

## 🧹 数据治理与巡检

```dataviewjs
await dv.view("scripts/pa-view-inspector");
```

```dataviewjs
await dv.view("scripts/pa-view-manager");
```

```dataviewjs
await dv.view("scripts/pa-view-schema");
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
> > [!example] 📚 进修与验证 (Growth)
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
>
> > [!quote] 🛠️ 系统维护 (Admin)
> > **🖨️ 待打印 (Print Queue)**
> >
> > ```tasks
> > not done
> > tag includes #task/print
> > path does not include Templates
> > hide backlink
> > short mode
> > ```
> >
> > **📂 待整理 (Organize)**
> >
> > ```tasks
> > not done
> > tag includes #task/organize
> > path does not include Templates
> > hide backlink
> > short mode
> > ```

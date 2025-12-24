---
categories:
  - 模版
tags:
  - PA/Course
封面/cover:
module_id:
studied: false
关联知识/associated knowledge:
aliases:
市场周期/market_cycle:
设置类别/setup_category:
概率/probability:
来源/source:
---
# 📺 1. 课程概览 (Module Overview)

## 📸 封面预览（自动）

```dataviewjs
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;
const cur = dv.current();

const raw = cur["封面/cover"] ?? cur["cover"];
const toArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v?.constructor && v.constructor.name === "Proxy") return Array.from(v);
  return [v];
};
const asStr = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (v?.path) return v.path;
  return v.toString?.() ?? "";
};
const unwrapWiki = (s) => {
  let t = (s || "").toString().trim();
  t = t.replace(/^!\[\[/, "").replace(/\]\]$/, "");
  if (t.startsWith("[[") && t.endsWith("]]")) t = t.slice(2, -2);
  t = t.split("|")[0].trim();
  return t;
};
const resolvePath = (p) => {
  const linkpath = unwrapWiki(p);
  const dest = app.metadataCache.getFirstLinkpathDest(linkpath, cur?.file?.path || "");
  return dest?.path || linkpath;
};

const covers = toArr(raw)
  .map(asStr)
  .map(resolvePath)
  .map((s) => s.trim())
  .filter(Boolean);

if (covers.length === 0) {
  dv.paragraph("（未设置封面：可留空）");
} else {
  for (const p of covers.slice(0, 2)) {
    const f = app.vault.getAbstractFileByPath(p);
    if (!f) {
      dv.paragraph(`⚠️ 找不到封面文件：${p}`);
      continue;
    }
    dv.el("div", "", {
      attr: {
        style: `margin: 8px 0; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.10); border-left: 4px solid ${c.accent};`,
      },
    }).innerHTML = `
      <div style="font-size:0.8em; opacity:0.8; margin-bottom:6px;">${p}</div>
      <img src="${app.vault.getResourcePath(f)}" style="max-width:100%; height:auto; display:block; border-radius:6px;" />
    `;
  }
}
```

> **本节核心 (Core Theme)**：
> *在此处简述本节课主要解决什么问题（例如：如何识别并交易开盘即形成的趋势）*

> [!COLUMN] 🚀 核心知识点
> 1. 开盘时的趋势 (Trend from Open)
> 2. 交易区间的趋势 (Trend in Trading Range)
> 3. 宽通道趋势 (Broad Channel Trend)
> 4. 


---

# 📝 2. 核心知识点拆解 (Key Topics)
*根据大纲，本节课包含以下部分，请分别记录细节：*

## 🔹 2.1 开盘时的趋势 (Trend from Open)
* **特征 (Characteristics)**：📖
    * 第一根K线就是强趋势K线吗？
    * 缺口有多大？

### 🔍  结构拆解 (Micro-Structure)
*这里结合 Al Brooks 的逐根 K 线讲解 (Bar-by-bar analysis)*

* **信号棒 (Signal Bar)**：
* **入场棒 (Entry Bar)**：
* **后续跟进 (Follow-through)**：

> [!EXAMPLE] ⚖️ 优质 vs 劣质形态对比 (Comparison)
> *Al Brooks 经常强调 setup 的质量差异，请填下表*
> 
| 特征 (Feature) | ✅ 高胜率版本 (High Prob) | ❌ 低胜率/陷阱版本 (Trap/Low Prob) |
| :--- | :--- | :--- |
| **位置 (Location)** | e.g. 均线支撑处 | e.g. 虚空中，无左侧支撑 |
| **K线重叠 (Overlap)** | 少，动能强 | 多，像铁丝网 (Barbwire) |
| **收盘 (Close)** | 强收盘，光头光脚 | 弱收盘，有长影线 |
| **背景 (Context)** | 顺大势 | 逆强势 |
| ![1.《价格行为学》（基础篇1-36章）, p.601](../Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf#page=601&rect=3,3,1917,1082) | ![1.《价格行为学》（基础篇1-36章）, p.601](../Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf#page=601&rect=3,3,1917,1082) |  |

---
### 📊 图表案例 (Chart Examples)


|                                                    ✅ 正面案例 (Good Example)                                                    | ❌ 反面/失败案例 (Bad Example/Failure) |
| :-------------------------------------------------------------------------------------------------------------------------: | :------------------------------ |
| ![1.《价格行为学》（基础篇1-36章）, p.601](../Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf#page=601&rect=3,3,1917,1082) | ![[Pasted_Img_02.png]]          |
|                                                      **分析**：强阳线收盘，无重叠                                                       | **分析**：长上影线，这就是陷阱               |

---

> [!TIP] 🧠 市场心理 (Psychology)
> * **被套方 (Trapped)**：
> * **获利方 (Profit)**：

> [!TIP] 细节与例外 (Nuances & Exceptions)
> * "When the market is in a broad channel, you trade it like a trading range."
> * (在此记录他在视频里随口说的重要规则)


### ⚔️ 交易策略 (Strategy)
* **入场 (Entry)**：
    * Stop Order (突破单):
    * Limit Order (限价单):
* **止损 (Stop)**：
* **目标 (Target / MM)**：

> [!DANGER] ⚠️ 陷阱与失败 (Failure Mode)
> * 如果此形态失败 (Failure)，通常演变为：[[ ]]

---

## 🔹 2.2 交易区间的趋势 (Trend in Trading Range)
* **识别方法**：
* **操作策略**：

---

## 🔹 2.3 宽通道趋势 (Broad Channel Trend)
* **特征**：
* **止损位置**：

---

# 🧠 3. 课后总结 (Summary) #task/Summary
> [!CHECK] 学习检查清单
> - [ ] 我能区分宽通道和窄通道吗？
> - [ ] 我知道开盘趋势的止损放在哪吗？

---

# 🗂️ 4. 制卡/复习（可选 / SR）

> [!note] 规则对齐当前卡片模块
> - 只有你给本笔记加了 `#flashcards`（标签）时，系统才会纳入复习。
> - 卡片语法支持：`问题 :: 答案`、`答案 ::: 问题`、以及 `==cloze==`。
> - 示例放在代码块里，不会被系统计入；你要制卡就把格式写在正文普通段落里。

```text
什么是 Trend from Open（TFO）？ :: （一句话定义 + 最关键的交易含义）
（一句话） ::: TFO 的核心判断标准是什么？
宽通道趋势更像 ==交易区间==（如何执行）
```

- （在这里写你的卡片，每行一张；不要写在代码块里）
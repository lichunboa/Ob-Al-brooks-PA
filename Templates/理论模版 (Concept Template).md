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

# ✅ 课程快照（项目联动）

## 📸 图表/封面预览（自动）

（`封面/cover` 为空时，会从锚点下第一张图自动写入）

```dataviewjs
const cur = dv.current();

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

const isImagePath = (s) => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test((s || "").toString());

async function ensureCoverFromPasteAnchor() {
  const rawCover = cur["封面/cover"] ?? cur["cover"];
  const existing = toArr(rawCover).map(asStr).join(" ").trim();
  if (existing) return;

  const tFile = app.vault.getAbstractFileByPath(cur?.file?.path);
  if (!tFile) return;

  const md = await app.vault.read(tFile);
  const anchor = "<!--PA_COVER_SOURCE-->";
  const idx = md.indexOf(anchor);
  if (idx === -1) return;

  const after = md.slice(idx + anchor.length);
  const scope = after.split(/\n#{1,6}\s/)[0] || after;

  let m;
  const wikiRe = /!\[\[([^\]]+?)\]\]/g;
  while ((m = wikiRe.exec(scope)) !== null) {
    const linkpath = (m[1] || "").split("|")[0].trim();
    const dest = app.metadataCache.getFirstLinkpathDest(linkpath, cur?.file?.path || "");
    const p = dest?.path || linkpath;
    if (isImagePath(p)) {
      await app.fileManager.processFrontMatter(tFile, (fm) => {
        if (fm["封面/cover"] === undefined && fm["cover"] === undefined) {
          fm["封面/cover"] = `![[${p}]]`;
        }
      });
      return;
    }
  }

  const mdImgRe = /!\[[^\]]*\]\(([^)]+)\)/g;
  while ((m = mdImgRe.exec(scope)) !== null) {
    const link = (m[1] || "").trim();
    if (!link) continue;
    if (/^https?:\/\//i.test(link)) {
      await app.fileManager.processFrontMatter(tFile, (fm) => {
        if (fm["封面/cover"] === undefined && fm["cover"] === undefined) {
          fm["封面/cover"] = link;
        }
      });
      return;
    }
    const dest = app.metadataCache.getFirstLinkpathDest(link, cur?.file?.path || "");
    const p = dest?.path || link;
    if (isImagePath(p)) {
      await app.fileManager.processFrontMatter(tFile, (fm) => {
        if (fm["封面/cover"] === undefined && fm["cover"] === undefined) {
          fm["封面/cover"] = `![[${p}]]`;
        }
      });
      return;
    }
  }
}

(async () => {
  await ensureCoverFromPasteAnchor();

  const raw = cur["封面/cover"] ?? cur["cover"];
  const covers = toArr(raw)
    .map(asStr)
    .map(resolvePath)
    .map((s) => s.trim())
    .filter(Boolean);

  if (covers.length === 0) {
    dv.paragraph("（未设置封面：把截图粘贴到下方锚点区域即可自动写入 `封面/cover`）");
    return;
  }

  const p = covers[0];
  const f = app.vault.getAbstractFileByPath(p);
  if (!f) {
    dv.paragraph(`⚠️ 找不到封面文件：${p}`);
    return;
  }

  dv.el("div", "", {
    attr: {
      style:
        "margin: 8px 0; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.10);",
    },
  }).innerHTML = `
    <div style="font-size:0.8em; opacity:0.8; margin-bottom:6px;">${p}</div>
    <img src="${app.vault.getResourcePath(f)}" style="max-width:100%; height:auto; display:block; border-radius:6px;" />
  `;
})();
```

<!--PA_COVER_SOURCE-->

（在此粘贴主图表/截图）

# 📺 1. 课程概览 (Module Overview)

> **本节核心 (Core Theme)**：
> _在此处简述本节课主要解决什么问题（例如：如何识别并交易开盘即形成的趋势）_

> [!COLUMN] 🚀 核心知识点
>
> 1. 开盘时的趋势 (Trend from Open)
> 2. 交易区间的趋势 (Trend in Trading Range)
> 3. 宽通道趋势 (Broad Channel Trend)
> 4.

---

# 📝 2. 核心知识点拆解 (Key Topics)

_根据大纲，本节课包含以下部分，请分别记录细节：_

## 🔹 2.1 开盘时的趋势 (Trend from Open)

- **特征 (Characteristics)**：📖
  - 第一根 K 线就是强趋势 K 线吗？
  - 缺口有多大？

### 🔍 结构拆解 (Micro-Structure)

_这里结合 Al Brooks 的逐根 K 线讲解 (Bar-by-bar analysis)_

- **信号棒 (Signal Bar)**：
- **入场棒 (Entry Bar)**：
- **后续跟进 (Follow-through)**：

> [!EXAMPLE] ⚖️ 优质 vs 劣质形态对比 (Comparison)
> _Al Brooks 经常强调 setup 的质量差异，请填下表_
>
> | 特征 (Feature)                                                                                                                                                        | ✅ 高胜率版本 (High Prob)                                                                                                                                             | ❌ 低胜率/陷阱版本 (Trap/Low Prob) |
> | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- |
> | **位置 (Location)**                                                                                                                                                   | e.g. 均线支撑处                                                                                                                                                       | e.g. 虚空中，无左侧支撑            |
> | **K 线重叠 (Overlap)**                                                                                                                                                | 少，动能强                                                                                                                                                            | 多，像铁丝网 (Barbwire)            |
> | **收盘 (Close)**                                                                                                                                                      | 强收盘，光头光脚                                                                                                                                                      | 弱收盘，有长影线                   |
> | **背景 (Context)**                                                                                                                                                    | 顺大势                                                                                                                                                                | 逆强势                             |
> | ![1.《价格行为学》（基础篇1-36章）, p.601](../Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf#page=601&rect=3,3,1917,1082) | ![1.《价格行为学》（基础篇1-36章）, p.601](../Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf#page=601&rect=3,3,1917,1082) |                                    |

---

### 📊 图表案例 (Chart Examples)

|                                                                      ✅ 正面案例 (Good Example)                                                                       | ❌ 反面/失败案例 (Bad Example/Failure) |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------- |
| ![1.《价格行为学》（基础篇1-36章）, p.601](../Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf#page=601&rect=3,3,1917,1082) | ![[Pasted_Img_02.png]]                 |
|                                                                     **分析**：强阳线收盘，无重叠                                                                      | **分析**：长上影线，这就是陷阱         |

---

> [!TIP] 🧠 市场心理 (Psychology)
>
> - **被套方 (Trapped)**：
> - **获利方 (Profit)**：

> [!TIP] 细节与例外 (Nuances & Exceptions)
>
> - "When the market is in a broad channel, you trade it like a trading range."
> - (在此记录他在视频里随口说的重要规则)

### ⚔️ 交易策略 (Strategy)

- **入场 (Entry)**：
  - Stop Order (突破单):
  - Limit Order (限价单):
- **止损 (Stop)**：
- **目标 (Target / MM)**：

> [!DANGER] ⚠️ 陷阱与失败 (Failure Mode)
>
> - 如果此形态失败 (Failure)，通常演变为：[[]]

---

## 🔹 2.2 交易区间的趋势 (Trend in Trading Range)

- **识别方法**：
- **操作策略**：

---

## 🔹 2.3 宽通道趋势 (Broad Channel Trend)

- **特征**：
- **止损位置**：

---

# 🧠 3. 课后总结 (Summary) #task/Summary

> [!CHECK] 学习检查清单
>
> - [ ] 我能区分宽通道和窄通道吗？
> - [ ] 我知道开盘趋势的止损放在哪吗？

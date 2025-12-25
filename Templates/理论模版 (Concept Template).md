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
// ========== 简化重写：封面自动写入与预览 ==========
const cur = dv.current();
const currentFile = app.vault.getAbstractFileByPath(cur?.file?.path);
if (!currentFile) { dv.paragraph("❌ 无法获取当前文件"); return; }

// 工具函数：URL 解码
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// 工具函数：提取图片路径（支持所有格式）
const extractImagePath = (text) => {
  // 匹配 ![[xxx]], [[xxx]]
  let m = text.match(/!?\[\[([^\]]+?)\]\]/);
  if (m) return m[1].split("|")[0].trim();
  
  // 匹配 ![](xxx), [](xxx), ![](<xxx>), [](<xxx>) - 关键：处理尖括号和%20
  m = text.match(/!?\[[^\]]*\]\(<?([^)>]+)>?\)/);
  if (m) {
    let path = m[1].trim();
    // 去除尖括号
    path = path.replace(/^<|>$/g, "");
    // URL解码
    return decode(path);
  }
};

// 工具函数：解析路径为 vault 完整路径
const resolvePath = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path; // URL 直接返回

  path = decode(path).replace(/^\.\//, ""); // 去除 ./ 并解码

  const currentDir = cur.file.path.substring(0, cur.file.path.lastIndexOf("/"));

  // 尝试顺序：1) Obsidian链接解析 2) 相对当前目录 3) vault根目录
  const candidates = [
    path,
    `${currentDir}/${path}`,
  ];

  for (const candidate of candidates) {
    const file = app.vault.getAbstractFileByPath(candidate);
    if (file) return candidate;

    const resolved = app.metadataCache.getFirstLinkpathDest(candidate, cur.file.path);
    if (resolved) return resolved.path;
  }

  return path; // 找不到就返回原路径
};

// ========== 步骤1：自动从锚点下提取并写入封面 ==========
const currentCover = cur["封面/cover"] || cur["cover"];
const isCoverEmpty = !currentCover || currentCover.toString().trim() === "";

if (isCoverEmpty) {
  const content = await app.vault.read(currentFile);
  const anchorIndex = content.indexOf("<!--PA_COVER_SOURCE-->");

  if (anchorIndex !== -1) {
    const afterAnchor = content.slice(anchorIndex + 23); // 23 = anchor length
    const beforeNextHeading = afterAnchor.split(/\n#{1,6}\s/)[0];

    const imagePath = extractImagePath(beforeNextHeading);
    if (imagePath) {
      const resolved = resolvePath(imagePath);
      if (resolved && /\.(png|jpe?g|gif|webp|svg)$/i.test(resolved)) {
        await app.fileManager.processFrontMatter(currentFile, (fm) => {
          fm["封面/cover"] = `[[${resolved}]]`; // 使用标准 wikilink 格式
        });
        dv.paragraph("✅ 已自动写入封面，刷新后显示");
        return;
      }
    }
  }
}

// ========== 步骤2：显示封面预览 ==========
const coverValue = cur["封面/cover"] || cur["cover"];
if (!coverValue || coverValue.toString().trim() === "") {
  dv.paragraph("（未设置封面：把截图粘贴到下方锚点区域即可自动写入）");
  return;
}

const coverPath = resolvePath(extractImagePath(coverValue.toString()) || coverValue.toString());
const coverFile = app.vault.getAbstractFileByPath(coverPath);

if (!coverFile) {
  dv.el("div", "").innerHTML = `
    <div style="color:#ff6b6b; font-size:0.9em;">
      ⚠️ 找不到封面文件<br/>
      <span style="font-size:0.75em; opacity:0.7;">
        原始值: ${coverValue}<br/>
        解析路径: ${coverPath}<br/>
        当前目录: ${cur.file.path.substring(0, cur.file.path.lastIndexOf("/"))}
      </span>
    </div>
  `;
  return;
}

// 显示图片
dv.el("div", "", {
  attr: {
    style: "margin:8px 0; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);"
  }
}).innerHTML = `
  <div style="font-size:0.75em; opacity:0.7; margin-bottom:6px;">📍 ${coverPath}</div>
  <img src="${app.vault.getResourcePath(coverFile)}"
       style="max-width:100%; height:auto; display:block; border-radius:6px;" />
`;
```

<!--PA_COVER_SOURCE-->
[[assets/理论模版%20(Concept%20Template)/理论模版%20(Concept%20Template)-202512252220579801.png]]


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

#flashcards
// 学习卡片制作,根据课程提炼重要知识点,制作学习卡片,卡片形式要丰富,每张卡片要隔开.[[卡片使用说明]]

- 卡片 1
- 卡片 2

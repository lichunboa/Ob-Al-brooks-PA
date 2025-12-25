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

const dirname = (p) => {
  const s = (p || "").toString();
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(0, i) : "";
};

const stripAngles = (s) => {
  const t = (s || "").toString().trim();
  return t.startsWith("<") && t.endsWith(">") ? t.slice(1, -1).trim() : t;
};

const safeDecode = (s) => {
  try {
    return decodeURIComponent((s || "").toString());
  } catch {
    return (s || "").toString();
  }
};

const normalizeLink = (s) => {
  let t = (s || "").toString().trim();
  t = t.replace(/^['"]|['"]$/g, "");
  t = stripAngles(t);
  t = safeDecode(t);
  return t;
};

const extractFirstPathLike = (s) => {
  const t = (s || "").toString();
  let m = t.match(/!?\[\[([^\]]+?)\]\]/);
  if (m && m[1]) return m[1].split("|")[0].trim();
  m = t.match(/!?\[[^\]]*\]\(([^)]+)\)/);
  if (m && m[1]) return m[1].trim();
  m = t.match(/(?:^|\s)([^\s]+\.(?:png|jpg|jpeg|gif|webp|svg))(?:\s|$)/i);
  if (m && m[1]) return m[1].trim();
  return t.trim();
};

const resolveToVaultPath = (linkOrPath) => {
  let linkpath = normalizeLink(extractFirstPathLike(linkOrPath));
  if (!linkpath) return "";
  if (/^https?:\/\//i.test(linkpath)) return linkpath;

  // 关键：不要去除 ./ 前缀，保留它用于后续拼接
  const hasRelativePrefix = linkpath.startsWith("./");
  linkpath = linkpath.replace(/^\.\//, "").replace(/^\//, "");

  const from = cur?.file?.path || "";

  // 辅助函数：尝试所有可能的编码/解码变体和路径组合
  const tryResolve = (path) => {
    // 1. 尝试 Obsidian 的 linkpath 解析（最标准）
    const dest = app.metadataCache.getFirstLinkpathDest(path, from);
    if (dest?.path) return dest.path;

    // 2. 尝试直接作为 vault 绝对路径
    const f = app.vault.getAbstractFileByPath(path);
    if (f) return path;

    // 3. 尝试相对于当前文件所在目录
    const baseDir = dirname(from);
    if (baseDir) {
      const candidate = `${baseDir}/${path}`.replace(/\/+/g, "/");
      const f1 = app.vault.getAbstractFileByPath(candidate);
      if (f1) return candidate;
      const dest2 = app.metadataCache.getFirstLinkpathDest(candidate, from);
      if (dest2?.path) return dest2.path;
    }

    return null;
  };

  // 先尝试原始路径（已去除 ./ 前缀）
  let result = tryResolve(linkpath);
  if (result) return result;

  // 再尝试解码版本（处理 %20 等）
  const decoded = safeDecode(linkpath);
  if (decoded !== linkpath) {
    result = tryResolve(decoded);
    if (result) return result;
  }

  // 再尝试编码版本（如果原始是解码的）
  try {
    const encoded = encodeURIComponent(linkpath).replace(/%2F/g, "/");
    if (encoded !== linkpath && encoded !== decoded) {
      result = tryResolve(encoded);
      if (result) return result;
    }
  } catch {}

  // 如果都失败，返回原始路径（让调用者决定如何处理）
  return linkpath;
};

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

const isBlankCoverValue = (v) => {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
};

const unwrapWiki = (s) => {
  let t = (s || "").toString().trim();
  // 先去除外层的 ![[...]] 或 [[...]]
  if (t.startsWith("![[") && t.endsWith("]]")) {
    t = t.slice(3, -2);
  } else if (t.startsWith("[[") && t.endsWith("]]")) {
    t = t.slice(2, -2);
  }
  // 去除 wikilink 的显示文本部分（|后面的）
  t = t.split("|")[0].trim();
  return t;
};

const resolvePath = (p) => {
  const maybeWiki = unwrapWiki(p);
  return resolveToVaultPath(maybeWiki || p);
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
  // 兼容：![[...]]（图片）以及 [[...]]（普通链接）
  const wikiRe = /!?\[\[([^\]]+?)\]\]/g;
  while ((m = wikiRe.exec(scope)) !== null) {
    const linkpath = (m[1] || "").split("|")[0].trim();
    const p = resolveToVaultPath(linkpath);
    if (isImagePath(p)) {
      await app.fileManager.processFrontMatter(tFile, (fm) => {
        if (isBlankCoverValue(fm["封面/cover"]) && isBlankCoverValue(fm["cover"])) {
          // YAML 中以 `!` 开头可能被解析为 tag，导致属性读取异常；用 [[...]] 更稳
          // 关键：写入前解码 %20 等编码，避免后续读取失败
          const decodedPath = safeDecode(p);
          fm["封面/cover"] = `[[${decodedPath}]]`;
        }
      });
      return;
    }
  }

  // 兼容：![](...)（图片）以及 [](...)（普通链接，但指向图片文件）
  const mdImgRe = /!?\[[^\]]*\]\(([^)]+)\)/g;
  while ((m = mdImgRe.exec(scope)) !== null) {
    const link = normalizeLink((m[1] || "").trim());
    if (!link) continue;
    if (/^https?:\/\//i.test(link)) {
      await app.fileManager.processFrontMatter(tFile, (fm) => {
        if (isBlankCoverValue(fm["封面/cover"]) && isBlankCoverValue(fm["cover"])) {
          fm["封面/cover"] = link;
        }
      });
      return;
    }
    const p = resolveToVaultPath(link);
    if (isImagePath(p)) {
      await app.fileManager.processFrontMatter(tFile, (fm) => {
        if (isBlankCoverValue(fm["封面/cover"]) && isBlankCoverValue(fm["cover"])) {
          // 优先保留 wikilink 格式以兼容现有系统（但不要用 ![[...]]，避免 YAML tag）
          // 关键：写入前解码 %20 等编码，避免后续读取失败
          const decodedPath = safeDecode(p);
          fm["封面/cover"] = `[[${decodedPath}]]`;
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

  // 调试信息：显示解析过程
  const debugInfo = `
    <div style="font-size:0.7em; opacity:0.6; margin:4px 0; padding:4px; background:rgba(255,0,0,0.1); border-radius:4px;">
      🔍 调试信息<br/>
      原始值: ${JSON.stringify(raw)}<br/>
      解析路径: ${p}<br/>
      当前文件: ${cur?.file?.path}<br/>
      文件存在: ${app.vault.getAbstractFileByPath(p) ? "✅ 是" : "❌ 否"}
    </div>
  `;

  const f = app.vault.getAbstractFileByPath(p);
  if (!f) {
    dv.el("div", "").innerHTML = debugInfo + `<div style="color:#ff6b6b;">⚠️ 找不到封面文件：${p}</div>`;
    return;
  }

  dv.el("div", "", {
    attr: {
      style:
        "margin: 8px 0; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.10);",
    },
  }).innerHTML = debugInfo + `
    <div style="font-size:0.8em; opacity:0.8; margin-bottom:6px;">${p}</div>
    <img src="${app.vault.getResourcePath(f)}" style="max-width:100%; height:auto; display:block; border-radius:6px;" />
  `;
})();
```

<!--PA_COVER_SOURCE-->

![](<assets/理论模版%20(Concept%20Template)/理论模版%20(Concept%20Template)-20251225222057980.png>)/理论模版%20(Concept%20Template)-20251225222057980.png)

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

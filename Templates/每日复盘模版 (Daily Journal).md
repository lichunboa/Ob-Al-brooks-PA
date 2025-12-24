---
封面/cover:
categories:
  - 模版
  - 交易日记
tags:
  - PA/Daily
date: 2025-12-17
账户类型/account_type:
市场周期/market_cycle:
复盘深度/review_depth:
---

# 📸 今日封面/截图预览（自动）

```dataviewjs
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;
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
    dv.paragraph("（未设置封面：可留空；或粘贴到下方锚点区域自动写入）");
    return;
  }

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
})();
```

<!--PA_COVER_SOURCE-->

（在此粘贴今日主图）

# 🌅 1. 盘前准备 (Pre-Market)

### 🌍 宏观与消息 (News)

- **今日数据**: _(例如：CPI, FOMC, 或 None)_
- **隔夜市场**: _(ES/NQ 是高开还是低开？)_

### 🔭 关键点位 (Key Levels)

- **HOD (昨日高)**:
- **LOD (昨日低)**:
- **Magnet (磁力点)**: _(例如：未补缺口、整数关口)_

- [ ] 咖啡/水
- [ ] 手机静音
- [ ] 只做高胜率架构

---

# ⚔️ 2. 今日战况 (Trades Today)

（自动抓取今日交易）

```dataview
TABLE direction as "方向", ticker as "品种", outcome as "结果", net_profit as "盈亏"
FROM "Daily/Trades"
WHERE file.cday = this.file.cday
SORT file.ctime ASC
```

# 🌇 3. 盘后总结 (Post-Market)

### 📊 数据概览

- **总交易数**:
- **胜率估算**:
- **最大回撤单**: _(哪一笔亏得最惨？为什么？)_

### 🧠 心理账户 (Psychology)

- **今日心态评分 (1-10)**:
- **是否出现 FOMO/报复性交易?**:
  - 如果有，触发点是什么？:

### 🚀 明日计划 (Plan for Tomorrow)

- **关注重点**:
- **待改进的一个点**:

---

# 🧠 4. 今日制卡（可选 / SR）

（需要 `#flashcards` 才会进入复习）

```text
问题 :: 答案
答案 ::: 问题
我最常犯的错误是 ==过早止盈==
```

- 

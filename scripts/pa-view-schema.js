/* 文件名: Scripts/pa-view-schema.js (V5 - Metadata Monitor)
   用途: 元数据监控与标签全景
   功能: 
   1. 🚑 异常修复台: 实时捕捉空值/Unknown (原生跳转)。
   2. 🏷️ 标签全景: 统计全库标签。
*/

const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

// --- 1. 样式定义 ---
const styleId = "pa-schema-v5";
if (!document.getElementById(styleId)) {
  const s = document.createElement("style");
  s.id = styleId;
  s.innerHTML = `
        .sch-box { display: flex; flex-direction: column; gap: 15px; }
        .sch-panel { background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.6) 100%); backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 12px; padding: 15px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); }
        .sch-header { font-size: 1.1em; font-weight: bold; margin-bottom: 12px; padding-bottom: 5px; border-bottom: 1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; }
        .sch-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.85em; }
        .sch-link { color: ${c.text}; text-decoration: underline; text-decoration-color: rgba(255,255,255,0.2); cursor: pointer; transition:0.2s; }
        .sch-link:hover { color: ${c.live}; text-decoration-color: ${c.live}; }
        .sch-tag { color: ${c.demo}; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin: 3px; cursor: pointer; display: inline-block; transition:0.2s; }
        .sch-tag:hover { background: rgba(59, 130, 246, 0.2); transform: translateY(-1px); }
        
        /* 顶部仪表盘 */
        .sch-dash { display: flex; gap: 15px; margin-bottom: 5px; }
        .sch-dash-item { flex: 1; background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.6) 100%); backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 12px; padding: 15px; text-align: center; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); }
        .sch-big-num { font-size: 1.8em; font-weight: 800; line-height: 1.2; }
        .sch-sub-label { font-size: 0.75em; opacity: 0.6; text-transform: uppercase; letter-spacing: 1px; }
    `;
  document.head.appendChild(s);
}

// --- 2. 深度扫描 (Native Cache for Fixes) ---
const dvPages = dv
  .pages("#PA")
  .where((p) => !p.file.path.includes("Templates"));

let scanStats = { files: 0, tags: 0, issues: 0 };
let tagMap = {};
let issueList = []; // { path, name, key, val, type }

for (let p of dvPages) {
  let tFile = app.vault.getAbstractFileByPath(p.file.path);
  if (!tFile) continue;
  let cache = app.metadataCache.getFileCache(tFile);

  scanStats.files++;

  // A. 扫描标签
  if (cache.tags) {
    cache.tags.forEach((t) => {
      let tag = t.tag;
      tagMap[tag] = (tagMap[tag] || 0) + 1;
    });
  }

  // B. 扫描异常 (空值/Unknown)
  if (cache.frontmatter) {
    const ignore = ["position", "aliases", "cssclasses"];
    for (let key in cache.frontmatter) {
      if (ignore.includes(key)) continue;

      let val = cache.frontmatter[key];
      let valStr =
        val === undefined || val === null ? "null" : val.toString().trim();

      let issueType = null;
      if (valStr === "" || valStr === "Empty") issueType = "❌ 空值";
      else if (valStr.toLowerCase().includes("unknown")) issueType = "❓ 未知";

      if (issueType) {
        issueList.push({
          path: p.file.path,
          name: p.file.name,
          key: key,
          val: valStr,
          type: issueType,
        });
        scanStats.issues++;
      }
    }
  }
}
scanStats.tags = Object.keys(tagMap).length;

// --- 3. 引擎数据聚合 (Engine Data for Charts) ---
// 使用 window.paData 获取清洗过的统计数据 (Ticker/Setup/Exec)
let distData = { ticker: [], setup: [], exec: [] };
let healthScore = 100;

if (window.paData && window.paData.trades) {
  const trades = window.paData.trades;

  // 辅助统计函数
  const getDist = (key) => {
    let map = {};
    trades.forEach((t) => {
      let v = (t[key] || "Unknown").toString().split("(")[0].trim();
      if (v) map[v] = (map[v] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // Top 5
  };

  distData.ticker = getDist("ticker");
  distData.setup = getDist("setup");

  // 执行质量特别处理 (error 字段)
  let execMap = {};
  trades.forEach((t) => {
    let v = t.error || "Normal";
    // 简化显示
    if (v.includes("Perfect") || v.includes("完美")) v = "🟢 完美";
    else if (v.includes("FOMO")) v = "🔴 FOMO";
    else if (v.includes("Tight")) v = "🔴 止损太紧";
    else if (v.includes("Scratch") || v.includes("主动")) v = "🟡 主动离场";
    else if (v.includes("Normal") || v.includes("None")) v = "🟢 正常";
    execMap[v] = (execMap[v] || 0) + 1;
  });
  distData.exec = Object.entries(execMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 计算健康分
  let deduction = scanStats.issues * 5; // 每个错误扣5分
  healthScore = Math.max(0, 100 - deduction);
}

// --- 4. 构建 UI ---
const root = dv.el("div", "");
root.className = "sch-box";

// === 模块 1: 顶部仪表盘 (KPIs) ===
const panelDash = document.createElement("div");
panelDash.className = "sch-dash";

const createCard = (label, val, color) => {
  return `
    <div class="sch-dash-item" style="border-bottom: 3px solid ${color};">
        <div class="sch-big-num" style="color:${color}">${val}</div>
        <div class="sch-sub-label">${label}</div>
    </div>`;
};

let healthColor =
  healthScore > 90 ? c.live : healthScore > 60 ? c.back : c.loss;

panelDash.innerHTML = `
    ${createCard("系统健康度", healthScore, healthColor)}
    ${createCard(
      "待修异常",
      scanStats.issues,
      scanStats.issues > 0 ? c.loss : c.textSub
    )}
    ${createCard("标签总数", scanStats.tags, c.demo)}
    ${createCard("笔记档案", scanStats.files, c.purple)}
`;
root.appendChild(panelDash);

// === 模块 2: 🚑 异常修复台 (Fix Station) ===
// 只有当有错误时才显示，或者显示“健康”状态
const panelFix = document.createElement("div");
panelFix.className = "sch-panel";

if (scanStats.issues > 0) {
  panelFix.style.borderLeft = `3px solid ${c.loss}`;
  panelFix.innerHTML = `<div class="sch-header" style="color:${c.loss}">🚑 异常修复台 (Fix Station)</div>`;

  const divList = document.createElement("div");
  divList.style.maxHeight = "200px";
  divList.style.overflowY = "auto";

  issueList.forEach((item) => {
    let row = document.createElement("div");
    row.className = "sch-row";

    let link = document.createElement("span");
    link.className = "sch-link";
    link.innerText = item.name;
    link.title = item.path;
    // 原生跳转事件
    link.addEventListener("click", () =>
      app.workspace.openLinkText(item.path, "", true)
    );

    row.innerHTML = `
            <div style="flex:2;"></div>
            <div style="flex:1; font-family:monospace; color:${c.demo}; opacity:0.8;">${item.key}</div>
            <div style="flex:1; text-align:right; font-weight:bold; color:${c.loss};">${item.type}</div>
        `;
    row.children[0].appendChild(link); // 插入 link 元素
    divList.appendChild(row);
  });
  panelFix.appendChild(divList);
} else {
  panelFix.style.borderLeft = `3px solid ${c.live}`;
  panelFix.innerHTML = `
        <div class="sch-header" style="color:${c.live}; margin-bottom:0; border:none;">
            ✅ 系统非常健康 (All Clear)
            <span style="font-size:0.7em; opacity:0.6; font-weight:normal;">所有属性均已规范填写</span>
        </div>`;
}
root.appendChild(panelFix);

// === 模块 3: 📊 数据可视化 (Visual Stats) ===
// 替代了之前的“字典列表”，提供更有价值的信息
if (window.paData) {
  const panelStats = document.createElement("div");
  panelStats.className = "sch-panel";
  panelStats.innerHTML = `<div class="sch-header" style="color:${c.text}">📊 核心数据分布 (Data Profile)</div>`;

  const grid = document.createElement("div");
  grid.className = "sch-grid";

  // 渲染迷你条形图函数
  const renderMiniChart = (title, data, colorFn) => {
    let html = `<div class="sch-mini-card"><div style="font-size:0.8em; opacity:0.7; margin-bottom:8px; font-weight:bold;">${title}</div>`;
    const total = data.reduce((a, b) => a + b[1], 0) || 1;
    const maxShow = 10;
    const shown = data.slice(0, maxShow);
    const rest = Math.max(0, data.length - shown.length);

    const pill = (label, value, col) => {
      return `<span style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); font-size:0.75em;">
          <span style="display:inline-block; width:6px; height:6px; border-radius:999px; background:${col}; opacity:0.9;"></span>
          <span style="opacity:0.9; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${label}</span>
          <span style="opacity:0.6; font-variant-numeric:tabular-nums;">${value}</span>
        </span>`;
    };

    html += `<div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    shown.forEach(([k, v]) => {
      const pct = Math.round((v / total) * 100);
      const col = typeof colorFn === "function" ? colorFn(k) : colorFn;
      html += pill(k, `${v} (${pct}%)`, col);
    });
    if (rest > 0) {
      html += `<span style="display:inline-flex; align-items:center; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,0.03); border:1px dashed rgba(255,255,255,0.12); font-size:0.75em; opacity:0.6;">+${rest}</span>`;
    }
    html += `</div></div>`;
    return html;
  };

  // 执行质量配色逻辑
  const execColor = (k) => {
    if (k.includes("完美") || k.includes("正常")) return c.live;
    if (k.includes("主动")) return c.back;
    return c.loss;
  };

  grid.innerHTML = `
        ${renderMiniChart("品种分布 (Ticker)", distData.ticker, c.demo)}
        ${renderMiniChart("策略分布 (Setup)", distData.setup, c.purple)}
        ${renderMiniChart("执行质量 (Execution)", distData.exec, execColor)}
    `;

  panelStats.appendChild(grid);
  root.appendChild(panelStats);
}

// === 模块 4: 🏷️ 标签全景 (Tag Cloud) ===
const panelTag = document.createElement("div");
panelTag.className = "sch-panel";
panelTag.innerHTML = `<div class="sch-header" style="color:${c.demo}">🏷️ 标签全景 (Tag System)</div>`;

const divTags = document.createElement("div");
divTags.style.display = "flex";
divTags.style.flexWrap = "wrap";

Object.entries(tagMap)
  .sort((a, b) => b[1] - a[1])
  .forEach(([tag, count]) => {
    let span = document.createElement("span");
    span.className = "sch-tag";
    span.innerText = `${tag} (${count})`;
    span.addEventListener("click", () => {
      app.internalPlugins.plugins["global-search"].instance.openGlobalSearch(
        `tag:${tag}`
      );
    });
    divTags.appendChild(span);
  });
panelTag.appendChild(divTags);
root.appendChild(panelTag);

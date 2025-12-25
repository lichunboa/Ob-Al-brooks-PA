/* 文件名: scripts/pa-cover-helper.js
   用途: 渲染封面预览
   
   使用方法：请手动在 frontmatter 的 封面/cover 字段填写图片路径
   格式：封面/cover: "![[路径/图片.png]]"
*/

module.exports = async (dv, app) => {
  const cur = dv.current();
  const tFile = app.vault.getAbstractFileByPath(cur.file.path);
  if (!tFile) return;

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

  const resolvePath = (p) => {
    let linkpath = p.replace(/^!\[\[/, "").replace(/\]\]$/, "");
    if (linkpath.startsWith("[[") && linkpath.endsWith("]]")) linkpath = linkpath.slice(2, -2);
    linkpath = linkpath.split("|")[0].trim();
    const dest = app.metadataCache.getFirstLinkpathDest(linkpath, cur.file.path);
    return dest?.path || linkpath;
  };

  const cache = app.metadataCache.getFileCache(tFile);
  const fm = cache?.frontmatter || {};
  const raw = fm["封面/cover"] ?? fm["cover"];
  
  const covers = toArr(raw).map(asStr).map(resolvePath).map((s) => s.trim()).filter(Boolean);

  if (covers.length === 0) {
    dv.paragraph("*(封面未设置。请在 frontmatter 手动填写)*");
    return;
  }

  let c = { accent: "#22c55e" };
  try {
    const cfg = require(app.vault.adapter.basePath + "/scripts/pa-config.js");
    if (cfg && cfg.colors) Object.assign(c, cfg.colors);
  } catch (e) {}

  for (const p of covers.slice(0, 1)) {
    let src = p;
    if (!/^https?:\/\//.test(p)) {
      const f = app.vault.getAbstractFileByPath(p);
      if (f) src = app.vault.getResourcePath(f);
    }

    dv.el("div", "", {
      attr: { style: `margin:8px 0;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.10);border-left:4px solid ${c.accent};` }
    }).innerHTML = `
      <div style="font-size:0.8em;opacity:0.8;margin-bottom:6px;">封面预览</div>
      <img src="${src}" style="max-width:100%;height:auto;display:block;border-radius:6px;" />
    `;
  }
};

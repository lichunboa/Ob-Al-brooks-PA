/* 文件名: scripts/pa-cover-helper-new.js
   用途: 自动从文档内容提取图片并设置为封面，以及渲染封面预览
*/

module.exports = async (dv, app) => {
  const cur = dv.current();
  const tFile = app.vault.getAbstractFileByPath(cur.file.path);
  if (!tFile) return;

  // 辅助函数
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

  const safeDecode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s;
    }
  };

  const isImagePath = (s) =>
    /\.(png|jpg|jpeg|gif|webp|svg)$/i.test((s || "").toString());

  // 尝试自动设置封面
  const ensureCoverFromPasteAnchor = async () => {
    const cache = app.metadataCache.getFileCache(tFile);
    const fm = cache?.frontmatter || {};
    const rawCover = fm["封面/cover"] ?? fm["cover"];

    const existing = toArr(rawCover).map(asStr).join(" ").trim();
    if (existing) {
      console.log("[PA Cover] 封面已存在，跳过:", existing);
      return false;
    }

    const md = await app.vault.read(tFile);
    const anchor = "<!--PA_COVER_SOURCE-->";
    const idx = md.indexOf(anchor);
    if (idx === -1) {
      console.log("[PA Cover] 未找到 PA_COVER_SOURCE 标记");
      return false;
    }

    const after = md.slice(idx + anchor.length);
    const scope = after.split(/\n#{1,6}\s/)[0] || after;

    // 查找所有图片链接（Markdown 格式）
    // 使用简单粗暴的方法：找到 ![...](，然后向后查找直到找到 .png) 或 .jpg) 等
    const lines = scope.split('\n');
    for (const line of lines) {
      // 匹配 ![...]( 的起始位置
      const match = line.match(/!\[[^\]]*\]\(/);
      if (!match) continue;
      
      const startIdx = match.index + match[0].length;
      const remaining = line.slice(startIdx);
      
      // 查找图片扩展名
      const imgMatch = remaining.match(/^(.+?\.(png|jpg|jpeg|gif|webp|svg))\)/i);
      if (!imgMatch) continue;
      
      let rawLink = imgMatch[1].trim();
      // 移除可能的尖括号
      if (rawLink.startsWith('<') && rawLink.endsWith('>')) {
        rawLink = rawLink.slice(1, -1).trim();
      }
      
      const link = safeDecode(rawLink);
      console.log("[PA Cover] 找到图片:", { raw: rawLink, decoded: link });
      
      // 尝试查找文件
      const parentPath = cur.file.parent?.path || "";
      const testPath = parentPath ? `${parentPath}/${link}` : link;
      const fileObj = app.vault.getAbstractFileByPath(testPath);
      
      console.log("[PA Cover] 测试路径:", testPath, fileObj ? "✅" : "❌");
      
      if (fileObj && fileObj.path) {
        console.log("[PA Cover] 成功找到文件:", fileObj.path);
        try {
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            if (!fm["封面/cover"] && !fm["cover"]) {
              fm["封面/cover"] = `![[${fileObj.path}]]`;
              console.log("[PA Cover] 封面已设置");
            }
          });
          return true;
        } catch (err) {
          console.error("[PA Cover] 更新失败:", err);
        }
      }
    }
    
    console.log("[PA Cover] 未找到可用的图片");
    return false;
  };

  await ensureCoverFromPasteAnchor();

  // 渲染封面预览
  const cache = app.metadataCache.getFileCache(tFile);
  const fm = cache?.frontmatter || {};
  const raw = fm["封面/cover"] ?? fm["cover"];
  
  const resolvePath = (p) => {
    let linkpath = p.replace(/^!\[\[/, "").replace(/\]\]$/, "");
    if (linkpath.startsWith("[[") && linkpath.endsWith("]]")) {
      linkpath = linkpath.slice(2, -2);
    }
    linkpath = linkpath.split("|")[0].trim();
    const dest = app.metadataCache.getFirstLinkpathDest(linkpath, cur.file.path);
    return dest?.path || linkpath;
  };
  
  const covers = toArr(raw)
    .map(asStr)
    .map(resolvePath)
    .map((s) => s.trim())
    .filter(Boolean);

  if (covers.length === 0) {
    dv.paragraph("*(封面未设置。请在下方粘贴截图，系统会自动抓取第一张图作为封面)*");
    return;
  }

  // 渲染封面
  let c = { accent: "#22c55e" };
  try {
    const basePath = app.vault.adapter.basePath;
    const cfg = require(basePath + "/scripts/pa-config.js");
    if (cfg && cfg.colors) Object.assign(c, cfg.colors);
  } catch (e) {}

  for (const p of covers.slice(0, 1)) {
    let src = p;
    if (!/^https?:\/\//.test(p)) {
      const f = app.vault.getAbstractFileByPath(p);
      if (f) {
        src = app.vault.getResourcePath(f);
      }
    }

    dv.el("div", "", {
      attr: {
        style: `margin: 8px 0; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.10); border-left: 4px solid ${c.accent};`,
      },
    }).innerHTML = `
      <div style="font-size:0.8em; opacity:0.8; margin-bottom:6px;">封面预览</div>
      <img src="${src}" style="max-width:100%; height:auto; display:block; border-radius:6px;" />
    `;
  }
};

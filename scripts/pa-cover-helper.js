/* 文件名: scripts/pa-cover-helper.js
   用途: 自动从文档内容提取图片并设置为封面，以及渲染封面预览
*/

module.exports = async (dv, app) => {
  const cur = dv.current();
  const tFile = app.vault.getAbstractFileByPath(cur.file.path);
  if (!tFile) return;

  // 1. 辅助函数
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

  const stripAngles = (s) => {
    const t = (s || "").toString().trim();
    if (t.startsWith("<") && t.endsWith(">")) {
      return t.slice(1, -1).trim();
    }
    return t;
  };

  const safeDecode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s;
    }
  };

  const cleanLink = (s) => {
    let t = (s || "").toString().trim();
    t = stripAngles(t);
    t = safeDecode(t);
    return t;
  };

  const resolvePath = (p) => {
    let linkpath = unwrapWiki(p);
    linkpath = cleanLink(linkpath); // Handle URL encoding and angle brackets
    const dest = app.metadataCache.getFirstLinkpathDest(
      linkpath,
      cur.file.path
    );
    return dest?.path || linkpath;
  };

  const isImagePath = (s) =>
    /\.(png|jpg|jpeg|gif|webp|svg)$/i.test((s || "").toString());

  // 2. 尝试自动设置封面
  const ensureCoverFromPasteAnchor = async () => {
    // 重新读取缓存以获取最新状态
    const cache = app.metadataCache.getFileCache(tFile);
    const fm = cache?.frontmatter || {};
    const rawCover = fm["封面/cover"] ?? fm["cover"];

    const existing = toArr(rawCover).map(asStr).join(" ").trim();
    if (existing) return false; // 已有封面，跳过

    const md = await app.vault.read(tFile);
    const anchor = "<!--PA_COVER_SOURCE-->";
    const idx = md.indexOf(anchor);
    if (idx === -1) return false;

    const after = md.slice(idx + anchor.length);
    // 查找范围：直到下一个标题或文件结束
    const scope = after.split(/\n#{1,6}\s/)[0] || after;

    // 统一更新逻辑：如果当前没有封面，则设置
    const tryUpdate = async (val) => {
      await app.fileManager.processFrontMatter(tFile, (fm) => {
        // 检查 null, undefined, 空字符串
        if (!fm["封面/cover"] && !fm["cover"]) {
          fm["封面/cover"] = val;
        }
      });
    };

    let m;
    // 匹配 Wiki Link ![[...]] 或 [[...]]
    const wikiRe = /!?\[\[([^\]]+?)\]\]/g;
    while ((m = wikiRe.exec(scope)) !== null) {
      const linkpath = (m[1] || "").split("|")[0].trim();
      const dest = app.metadataCache.getFirstLinkpathDest(
        linkpath,
        cur.file.path
      );
      const p = dest?.path || linkpath;
      if (isImagePath(p)) {
        await tryUpdate(`![[${p}]]`);
        return true; // 找到并设置了
      }
    }

    // 匹配 Markdown Link ![...](...) 或 [...](...)
    const mdImgRe = /!?\[[^\]]*\]\(([^)]+)\)/g;
    while ((m = mdImgRe.exec(scope)) !== null) {
      let link = (m[1] || "").trim();
      link = cleanLink(link); // Clean the link (remove <>, decode %20)
      
      if (!link) continue;

      // http 链接
      if (/^https?:\/\//i.test(link)) {
        await tryUpdate(link);
        return true;
      }

      // 尝试解析本地文件
      // 1. 标准解析
      let dest = app.metadataCache.getFirstLinkpathDest(link, cur.file.path);
      
      // 2. 如果没找到，尝试作为相对路径直接查找 (针对 assets/xxx 这种情况)
      if (!dest) {
          const parentPath = cur.file.folder || ""; // 当前文件所在目录
          const possiblePath = parentPath ? `${parentPath}/${link}` : link;
          const f = app.vault.getAbstractFileByPath(possiblePath);
          if (f && f.path) dest = f;
      }

      // 3. 尝试绝对路径 (相对于库根目录)
      if (!dest) {
          const f = app.vault.getAbstractFileByPath(link);
          if (f && f.path) dest = f;
      }

      if (dest && isImagePath(dest.path)) {
        // 找到了确切的文件，使用完整路径写入，避免歧义
        await tryUpdate(`![[${dest.path}]]`);
        return true;
      } else if (isImagePath(link)) {
        // 没找到文件对象，但看起来像图片路径，直接写入原始路径
        await tryUpdate(`![[${link}]]`);
        return true;
      }
    }
    return false;
  };

  await ensureCoverFromPasteAnchor();

  // 3. 渲染封面预览
  // 再次读取 frontmatter cache
  const cache = app.metadataCache.getFileCache(tFile);
  const fm = cache?.frontmatter || {};
  const raw = fm["封面/cover"] ?? fm["cover"];
  
  const covers = toArr(raw)
    .map(asStr)
    .map(resolvePath)
    .map((s) => s.trim())
    .filter(Boolean);

  if (covers.length === 0) {
    dv.paragraph("*(封面未设置。请在下方粘贴截图，系统会自动抓取第一张图作为封面)*");
    // 调试信息：显示扫描到的图片链接（如果有）
    const md = await app.vault.read(tFile);
    const anchor = "<!--PA_COVER_SOURCE-->";
    const idx = md.indexOf(anchor);
    if (idx !== -1) {
        const after = md.slice(idx + anchor.length);
        const scope = after.split(/\n#{1,6}\s/)[0] || after;
        const links = [];
        let m;
        const mdImgRe = /!?\[[^\]]*\]\(([^)]+)\)/g;
        while ((m = mdImgRe.exec(scope)) !== null) links.push(m[1]);
        if (links.length > 0) {
            dv.paragraph(`🔍 扫描到潜在图片链接: ${links.map(l => '`'+l+'`').join(', ')} (但未能自动匹配，请检查路径)`);
        }
    }
    return;
  }

  // 渲染封面
  let c = { accent: "#22c55e" }; // 默认绿色
  try {
    const basePath = app.vault.adapter.basePath;
    const cfg = require(basePath + "/scripts/pa-config.js");
    if (cfg && cfg.colors) Object.assign(c, cfg.colors);
  } catch (e) {}

  for (const p of covers.slice(0, 1)) {
    // 只显示第一张
    let src = p;
    // 如果是本地文件路径，转换为 resource path
    if (!/^https?:\/\//.test(p)) {
      const f = app.vault.getAbstractFileByPath(p);
      if (f) {
        src = app.vault.getResourcePath(f);
      } else {
        // 可能是外部链接或者找不到，尝试直接显示
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

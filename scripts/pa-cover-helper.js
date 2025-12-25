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
    if (existing) {
      console.log("[PA Cover] 封面已存在，跳过:", existing);
      return false; // 已有封面，跳过
    }

    const md = await app.vault.read(tFile);
    const anchor = "<!--PA_COVER_SOURCE-->";
    const idx = md.indexOf(anchor);
    if (idx === -1) {
      console.log("[PA Cover] 未找到 PA_COVER_SOURCE 标记");
      return false;
    }

    const after = md.slice(idx + anchor.length);
    // 查找范围：直到下一个标题或文件结束
    const scope = after.split(/\n#{1,6}\s/)[0] || after;

    // 统一更新逻辑：如果当前没有封面，则设置
    const tryUpdate = async (val) => {
      console.log("[PA Cover] 尝试更新封面:", val);
      try {
        await app.fileManager.processFrontMatter(tFile, (fm) => {
          // 检查 null, undefined, 空字符串
          if (!fm["封面/cover"] && !fm["cover"]) {
            fm["封面/cover"] = val;
            console.log("[PA Cover] 封面已设置");
          } else {
            console.log("[PA Cover] frontmatter 中已有封面，跳过");
          }
        });
        return true;
      } catch (err) {
        console.error("[PA Cover] 更新失败:", err);
        return false;
      }
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
        console.log("[PA Cover] 找到 Wiki 图片:", p);
        await tryUpdate(`![[${p}]]`);
        return true; // 找到并设置了
      }
    }

    // 匹配 Markdown Link ![...](...) 
    // 按行处理，查找图片扩展名
    const lines = scope.split('\n');
    for (const line of lines) {
      const match = line.match(/!\[[^\]]*\]\((<?)([^)]+)(>?)\)/);
      if (!match) continue;
      
      let rawLink = match[2].trim();
      let link = cleanLink(rawLink);
      console.log("[PA Cover] 找到图片:", { raw: rawLink, decoded: link });
      
      if (!link) continue;

      // http 链接
      if (/^https?:\/\//i.test(link)) {
        console.log("[PA Cover] HTTP 链接");
        await tryUpdate(link);
        return true;
      }

      // 尝试解析本地文件
      let dest = null;
      
      dest = app.metadataCache.getFirstLinkpathDest(link, cur.file.path);
      console.log("[PA Cover] 方法1 (标准API):", dest?.path || "未找到");
      
      if (!dest) {
          const parentPath = cur.file.parent?.path || "";
          const possiblePath = parentPath ? `${parentPath}/${link}` : link;
          dest = app.vault.getAbstractFileByPath(possiblePath);
          console.log("[PA Cover] 方法2 (相对路径):", possiblePath, dest?.path || "未找到");
      }

      if (!dest) {
          dest = app.vault.getAbstractFileByPath(link);
          console.log("[PA Cover] 方法3 (绝对路径):", link, dest?.path || "未找到");
      }

      if (dest && dest.path && isImagePath(dest.path)) {
        console.log("[PA Cover] 成功找到图片文件:", dest.path);
        await tryUpdate(`![[${dest.path}]]`);
        return true;
      }
      
      if (!dest && isImagePath(link)) {
        const parentPath = cur.file.parent?.path || "";
        const testPath = parentPath ? `${parentPath}/${link}` : link;
        const testFile = app.vault.getAbstractFileByPath(testPath);
        console.log("[PA Cover] 最后尝试:", testPath, testFile?.path || "未找到");
        if (testFile && testFile.path) {
          await tryUpdate(`![[${testFile.path}]]`);
          return true;
        }
      }
    }
    
    // 情况2: 不带尖括号的路径 ![...](...)
    // 手动查找以处理路径中包含括号的情况
    const plainPattern = /!?\[[^\]]*\]\(/g;
    let match;
    while ((match = plainPattern.exec(scope)) !== null) {
      const startIdx = match.index + match[0].length;
      // 从这个位置开始查找匹配的 )
      let depth = 1;
      let endIdx = startIdx;
      while (endIdx < scope.length && depth > 0) {
        if (scope[endIdx] === '(') depth++;
        else if (scope[endIdx] === ')') depth--;
        if (depth > 0) endIdx++;
      }
      
      if (depth === 0) {
        let rawLink = scope.substring(startIdx, endIdx).trim();
        // 跳过已经处理过的尖括号路径
        if (rawLink.startsWith('<') && rawLink.endsWith('>')) continue;
        
        let link = cleanLink(rawLink);
      
      console.log("[PA Cover] 找到 Markdown 图片链接:", { rawLink, link });
      
      if (!link) continue;

      // http 链接
      if (/^https?:\/\//i.test(link)) {
        console.log("[PA Cover] HTTP 链接");
        await tryUpdate(link);
        return true;
      }

      // 尝试解析本地文件（使用解码后的路径）
      let dest = null;
      
      // 方法1: 标准 Obsidian API 解析
      dest = app.metadataCache.getFirstLinkpathDest(link, cur.file.path);
      console.log("[PA Cover] 方法1 (标准API):", dest?.path || "未找到");
      
      // 方法2: 相对于当前文件目录
      if (!dest) {
          const parentPath = cur.file.parent?.path || "";
          const possiblePath = parentPath ? `${parentPath}/${link}` : link;
          dest = app.vault.getAbstractFileByPath(possiblePath);
          console.log("[PA Cover] 方法2 (相对路径):", possiblePath, dest?.path || "未找到");
      }

      // 方法3: 相对于库根目录
      if (!dest) {
          dest = app.vault.getAbstractFileByPath(link);
          console.log("[PA Cover] 方法3 (绝对路径):", link, dest?.path || "未找到");
      }

      // 如果找到文件且是图片，写入 frontmatter
      if (dest && dest.path && isImagePath(dest.path)) {
        console.log("[PA Cover] 成功找到图片文件:", dest.path);
        await tryUpdate(`![[${dest.path}]]`);
        return true;
      }
      
      // 最后的尝试：构建完整路径并测试
      if (!dest && isImagePath(link)) {
        const parentPath = cur.file.parent?.path || "";
        const testPath = parentPath ? `${parentPath}/${link}` : link;
        const testFile = app.vault.getAbstractFileByPath(testPath);
        console.log("[PA Cover] 最后尝试:", testPath, testFile?.path || "未找到");
        if (testFile && testFile.path) {
          await tryUpdate(`![[${testFile.path}]]`);
          return true;
        }
      }
    }
    console.log("[PA Cover] 未找到可用的图片");
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
    
    // 详细调试信息
    const md = await app.vault.read(tFile);
    const anchor = "<!--PA_COVER_SOURCE-->";
    const idx = md.indexOf(anchor);
    if (idx !== -1) {
        const after = md.slice(idx + anchor.length);
        const scope = after.split(/\n#{1,6}\s/)[0] || after;
        let m;
        let foundLinks = [];
        
        // 匹配带尖括号的
        const mdImgReAngled = /!?\[[^\]]*\]\(<([^>]+)>\)/g;
        while ((m = mdImgReAngled.exec(scope)) !== null) {
            const rawLink = m[1].trim();
            const decoded = cleanLink(rawLink);
            const parentPath = cur.file.parent?.path || "";
            const fullPath = parentPath ? `${parentPath}/${decoded}` : decoded;
            const fileObj = app.vault.getAbstractFileByPath(fullPath);
            
            foundLinks.push({
                type: '尖括号',
                raw: rawLink,
                decoded: decoded,
                fullPath: fullPath,
                exists: fileObj ? '✅ ' + fileObj.path : '❌ 未找到'
            });
        }
        
        // 匹配不带尖括号的（手动括号匹配）
        const plainPattern = /!?\[[^\]]*\]\(/g;
        let match;
        while ((match = plainPattern.exec(scope)) !== null) {
            const startIdx = match.index + match[0].length;
            let depth = 1;
            let endIdx = startIdx;
            while (endIdx < scope.length && depth > 0) {
                if (scope[endIdx] === '(') depth++;
                else if (scope[endIdx] === ')') depth--;
                if (depth > 0) endIdx++;
            }
            
            if (depth === 0) {
                const rawLink = scope.substring(startIdx, endIdx).trim();
                if (rawLink.startsWith('<') && rawLink.endsWith('>')) continue;
                const decoded = cleanLink(rawLink);
                const parentPath = cur.file.parent?.path || "";
                const fullPath = parentPath ? `${parentPath}/${decoded}` : decoded;
                const fileObj = app.vault.getAbstractFileByPath(fullPath);
                
                foundLinks.push({
                    type: '普通',
                    raw: rawLink,
                    decoded: decoded,
                    fullPath: fullPath,
                    exists: fileObj ? '✅ ' + fileObj.path : '❌ 未找到'
                });
            }
        }
        
        if (foundLinks.length > 0) {
            dv.paragraph("🔍 **调试信息**：");
            for (const link of foundLinks) {
                dv.paragraph(`**类型**：${link.type}`);
                dv.paragraph(`**原始**：\`${link.raw}\``);
                dv.paragraph(`**解码**：\`${link.decoded}\``);
                dv.paragraph(`**完整路径**：\`${link.fullPath}\``);
                dv.paragraph(`**状态**：${link.exists}`);
                dv.paragraph("---");
            }
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

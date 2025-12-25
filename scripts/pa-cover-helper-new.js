/* 文件名: scripts/pa-cover-helper-new.js
   用途: 自动从文档内容提取图片并设置为封面，以及渲染封面预览
   
   功能：
   1. 检测"图表/封面预览"章节下的图片
   2. 自动将图片路径更新到 frontmatter 的 封面/cover 字段
   3. 渲染封面预览
*/

module.exports = async (dv, app) => {
  const cur = dv.current();
  const tFile = app.vault.getAbstractFileByPath(cur.file.path);
  if (!tFile) return;

  // 辅助函数：数组转换
  const toArr = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (v?.constructor && v.constructor.name === "Proxy") return Array.from(v);
    return [v];
  };

  // 辅助函数：字符串转换
  const asStr = (v) => {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (v?.path) return v.path;
    return v.toString?.() ?? "";
  };

  // 辅助函数：解析路径
  const resolvePath = (p) => {
    let linkpath = p.replace(/^!\[\[/, "").replace(/\]\]$/, "");
    if (linkpath.startsWith("[[") && linkpath.endsWith("]]"))
      linkpath = linkpath.slice(2, -2);
    linkpath = linkpath.split("|")[0].trim();
    const dest = app.metadataCache.getFirstLinkpathDest(
      linkpath,
      cur.file.path
    );
    return dest?.path || linkpath;
  };

  // 读取文件内容
  const content = await app.vault.read(tFile);
  
  // 查找"图表/封面预览"章节下的图片（从 ## 📸 到下一个 ##）
  const sectionMatch = content.match(/##\s*📸\s*图表\/封面预览[\s\S]*?(?=##|$)/);
  let detectedImages = [];
  
  if (sectionMatch) {
    const sectionContent = sectionMatch[0];
    
    // 匹配 Markdown 图片格式: ![alt](path) 或 ![alt](<path>)
    const mdImageRegex = /!\[.*?\]\(<?([^)>]+)>?\)/g;
    let match;
    while ((match = mdImageRegex.exec(sectionContent)) !== null) {
      if (match[1]) {
        let imgPath = match[1].trim();
        // 移除可能的 < > 包裹
        imgPath = imgPath.replace(/^<|>$/g, '');
        // 跳过 dataviewjs 代码块
        if (!imgPath.includes('dataviewjs') && !imgPath.includes('const ')) {
          detectedImages.push(imgPath);
        }
      }
    }
    
    // 匹配 Wiki 图片格式: ![[path]]
    const wikiImageRegex = /!\[\[([^\]]+)\]\]/g;
    while ((match = wikiImageRegex.exec(sectionContent)) !== null) {
      if (match[1]) {
        let imgPath = match[1].trim();
        // 跳过代码块中的内容
        if (!imgPath.includes('const ') && !imgPath.includes('require')) {
          detectedImages.push(`![[${imgPath}]]`);
        }
      }
    }
  }

  // 获取当前 frontmatter 中的封面
  const cache = app.metadataCache.getFileCache(tFile);
  const fm = cache?.frontmatter || {};
  const currentCover = fm["封面/cover"] ?? fm["cover"];
  const currentCovers = toArr(currentCover).map(asStr).filter(Boolean);

  // 如果检测到新图片且与当前封面不同，自动更新
  if (detectedImages.length > 0) {
    const newCover = detectedImages[0]; // 取第一张图片
    
    // 标准化路径进行比较（移除 URL 编码等差异）
    const normalizePath = (p) => {
      return decodeURIComponent(p.replace(/^!\[\[/, "").replace(/\]\]$/, "").trim());
    };
    
    const newCoverNorm = normalizePath(newCover);
    const shouldUpdate = currentCovers.length === 0 || 
                        !currentCovers.some(c => {
                          const cNorm = normalizePath(c);
                          return cNorm === newCoverNorm || 
                                 cNorm.includes(newCoverNorm) || 
                                 newCoverNorm.includes(cNorm);
                        });
    
    if (shouldUpdate) {
      try {
        // 更新 frontmatter
        await app.fileManager.processFrontMatter(tFile, (frontmatter) => {
          frontmatter["封面/cover"] = newCover;
        });
        
        dv.paragraph(`✅ **封面已自动更新**: \`${newCover.substring(0, 50)}...\``);
      } catch (error) {
        console.error("更新封面失败:", error);
        dv.paragraph(`❌ 更新失败: ${error.message}`);
      }
    }
  }

  // 渲染封面预览
  const covers = toArr(currentCover)
    .map(asStr)
    .map(resolvePath)
    .map((s) => s.trim())
    .filter(Boolean);

  // 如果刚检测到图片但还未在 frontmatter 中，也显示预览
  if (covers.length === 0 && detectedImages.length > 0) {
    covers.push(detectedImages[0].replace(/^!\[\[/, "").replace(/\]\]$/, ""));
  }

  if (covers.length === 0) {
    dv.paragraph("*(封面未设置。请在下方"图表/封面预览"章节粘贴图片)*");
    return;
  }

  // 加载配置
  let c = { accent: "#22c55e" };
  try {
    const cfg = require(app.vault.adapter.basePath + "/scripts/pa-config.js");
    if (cfg && cfg.colors) Object.assign(c, cfg.colors);
  } catch (e) {}

  // 渲染封面
  for (const p of covers.slice(0, 1)) {
    let src = p;
    if (!/^https?:\/\//.test(p)) {
      const f = app.vault.getAbstractFileByPath(p);
      if (f) src = app.vault.getResourcePath(f);
    }

    dv.el("div", "", {
      attr: {
        style: `margin:8px 0;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.10);border-left:4px solid ${c.accent};`,
      },
    }).innerHTML = `
      <div style="font-size:0.8em;opacity:0.8;margin-bottom:6px;">📸 封面预览</div>
      <img src="${src}" style="max-width:100%;height:auto;display:block;border-radius:6px;" />
    `;
  }
};

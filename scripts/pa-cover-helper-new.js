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
  if (!tFile) {
    dv.paragraph("❌ 无法获取文件");
    return;
  }

  // 读取文件内容
  const content = await app.vault.read(tFile);
  
  // 查找"图表/封面预览"章节下的图片
  const sectionRegex = /##\s*📸\s*图表\/封面预览([\s\S]*?)(?=##|$)/;
  const sectionMatch = content.match(sectionRegex);
  
  let detectedImages = [];
  
  if (sectionMatch && sectionMatch[1]) {
    const sectionContent = sectionMatch[1];
    
    // 匹配所有 Markdown 图片: ![alt](path) 或 ![alt](<path>)
    const mdRegex = /!\[[^\]]*\]\(<?([^)>]+)>?\)/g;
    let match;
    
    while ((match = mdRegex.exec(sectionContent)) !== null) {
      let imgPath = match[1].trim();
      // 跳过代码相关内容
      if (!imgPath.includes('dataviewjs') && 
          !imgPath.includes('const ') && 
          !imgPath.includes('require') &&
          imgPath.length > 0) {
        detectedImages.push(imgPath);
      }
    }
    
    // 匹配所有 Wiki 图片: ![[path]]
    const wikiRegex = /!\[\[([^\]]+)\]\]/g;
    while ((match = wikiRegex.exec(sectionContent)) !== null) {
      let imgPath = match[1].trim();
      if (!imgPath.includes('const ') && !imgPath.includes('require')) {
        detectedImages.push(`![[${imgPath}]]`);
      }
    }
  }

  // 获取当前封面
  const cache = app.metadataCache.getFileCache(tFile);
  const fm = cache?.frontmatter || {};
  const currentCover = fm["封面/cover"] ?? fm["cover"] ?? "";
  
  // 显示检测状态
  if (detectedImages.length > 0) {
    const newCover = detectedImages[0];
    
    // 检查是否需要更新
    const needsUpdate = !currentCover || currentCover.length === 0;
    
    if (needsUpdate) {
      try {
        // 更新 frontmatter
        await app.fileManager.processFrontMatter(tFile, (frontmatter) => {
          frontmatter["封面/cover"] = newCover;
        });
        
        dv.paragraph(`✅ **封面已自动更新！**`);
        
        // 显示封面预览
        setTimeout(() => {
          renderCover(dv, app, tFile, newCover);
        }, 100);
        
      } catch (error) {
        dv.paragraph(`❌ 更新失败: ${error.message}`);
        console.error("更新封面失败:", error);
      }
    } else {
      // 已有封面，直接渲染
      renderCover(dv, app, tFile, currentCover);
    }
  } else {
    dv.paragraph("*(封面未设置。请在下方"图表/封面预览"章节粘贴图片)*");
  }
};

// 渲染封面预览
function renderCover(dv, app, tFile, coverPath) {
  if (!coverPath) return;
  
  // 解析路径
  let imgPath = coverPath;
  if (imgPath.startsWith("![[") && imgPath.endsWith("]]")) {
    imgPath = imgPath.slice(3, -2);
  }
  
  // 解析相对路径
  const dest = app.metadataCache.getFirstLinkpathDest(imgPath, tFile.path);
  let src = imgPath;
  
  if (dest) {
    src = app.vault.getResourcePath(dest);
  } else if (!/^https?:\/\//.test(imgPath)) {
    const f = app.vault.getAbstractFileByPath(imgPath);
    if (f) src = app.vault.getResourcePath(f);
  }
  
  // 加载配置
  let c = { accent: "#22c55e" };
  try {
    const cfg = require(app.vault.adapter.basePath + "/scripts/pa-config.js");
    if (cfg && cfg.colors) Object.assign(c, cfg.colors);
  } catch (e) {}
  
  // 渲染
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

/* 文件名: scripts/pa-cover-helper-new.js
   用途: 自动从文档内容提取图片并设置为封面，以及渲染封面预览
   
   使用方法：直接在"图表/封面预览"下方粘贴图片，刷新页面即可自动更新封面
*/

module.exports = async (dv, app) => {
  const cur = dv.current();
  const tFile = app.vault.getAbstractFileByPath(cur.file.path);
  if (!tFile) {
    dv.paragraph("❌ 文件未找到");
    return;
  }

  // 读取完整文件内容
  let content = await app.vault.read(tFile);
  
  // 提取"图表/封面预览"章节的图片
  const sectionRegex = /##\s*📸\s*图表\/封面预览([\s\S]*?)(?=\n##|\n---\n|$)/;
  const sectionMatch = content.match(sectionRegex);
  
  let detectedImage = null;
  
  if (sectionMatch) {
    const section = sectionMatch[1];
    
    // 匹配 Markdown 格式: ![](path) 或 ![](<path>)
    const mdMatch = section.match(/!\[[^\]]*\]\(<?([^)>]+?)>?\)/);
    if (mdMatch && mdMatch[1]) {
      const path = mdMatch[1].trim();
      if (path && !path.includes('const') && !path.includes('require')) {
        detectedImage = path;
      }
    }
    
    // 如果没找到，尝试 Wiki 格式: ![[path]]
    if (!detectedImage) {
      const wikiMatch = section.match(/!\[\[([^\]]+?)\]\]/);
      if (wikiMatch && wikiMatch[1]) {
        detectedImage = `![[${wikiMatch[1].trim()}]]`;
      }
    }
  }

  // 获取当前 frontmatter 的封面
  const cache = app.metadataCache.getFileCache(tFile);
  const currentCover = cache?.frontmatter?.["封面/cover"] || cache?.frontmatter?.cover || "";
  
  // 如果检测到图片且封面为空，更新封面
  if (detectedImage && !currentCover) {
    try {
      // 直接修改文件内容
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fmContent = fmMatch[1];
        // 找到 封面/cover: 这一行并替换
        const newFmContent = fmContent.replace(
          /^封面\/cover:\s*$/m,
          `封面/cover: ${detectedImage}`
        );
        
        if (newFmContent !== fmContent) {
          content = content.replace(fmMatch[0], `---\n${newFmContent}\n---`);
          await app.vault.modify(tFile, content);
          dv.paragraph(`✅ **封面已自动更新**`);
        }
      }
    } catch (error) {
      console.error("更新封面失败:", error);
    }
  }

  // 渲染封面预览
  const coverToShow = detectedImage || currentCover;
  
  if (!coverToShow) {
    dv.paragraph("*(请在下方粘贴图片，刷新页面即可自动更新封面)*");
    return;
  }

  // 解析图片路径
  let imgPath = coverToShow;
  if (imgPath.startsWith("![[")) {
    imgPath = imgPath.slice(3, -2);
  }
  
  // 获取图片资源
  const dest = app.metadataCache.getFirstLinkpathDest(imgPath, tFile.path);
  let src = imgPath;
  
  if (dest) {
    src = app.vault.getResourcePath(dest);
  } else {
    const f = app.vault.getAbstractFileByPath(imgPath);
    if (f) src = app.vault.getResourcePath(f);
  }
  
  // 加载配置色
  let accent = "#22c55e";
  try {
    const cfg = require(app.vault.adapter.basePath + "/scripts/pa-config.js");
    if (cfg?.colors?.accent) accent = cfg.colors.accent;
  } catch (e) {}
  
  // 渲染预览
  dv.el("div", "", {
    attr: {
      style: `margin:8px 0;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.10);border-left:4px solid ${accent};`,
    },
  }).innerHTML = `
    <div style="font-size:0.8em;opacity:0.8;margin-bottom:6px;">📸 封面预览</div>
    <img src="${src}" style="max-width:100%;height:auto;display:block;border-radius:6px;" />
  `;
};
};

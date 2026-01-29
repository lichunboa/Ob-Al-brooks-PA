
// 诊断脚本：打印指定文件的 Frontmatter
module.exports = async function (params) {
    const app = params.app;
    const path = "Notes 笔记/买卖压力.md";
    const file = app.vault.getAbstractFileByPath(path);

    if (!file) {
        console.log(`File not found: ${path}`);
        return;
    }

    const cache = app.metadataCache.getFileCache(file);
    console.log("=== DIAGNOSTIC DUMP for " + path + " ===");
    console.log("Frontmatter:", JSON.stringify(cache ? cache.frontmatter : null, null, 2));
    console.log("Tags:", JSON.stringify(cache ? cache.tags : null, null, 2));
    console.log("=== END DUMP ===");
}

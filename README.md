# 交易员控制台 (PA Control Console)

这是一个基于 Obsidian + DataviewJS 的交易笔记管理控制台（Trading/PA 管理面板）。

快速概览
- 主视图文件：`🦁 交易员控制台 (Trader Command)4.0.md`（在 Obsidian 中打开并预览，可看到 Control Console）。
- 脚本目录（首选）：`Scripts/`（注意：我们统一使用大写 `Scripts/`）。
- 旧脚本目录：`scripts/`（保留为兼容，仓库中同时存在，运行在区分大小写文件系统时请以 `Scripts/` 为准）。

如何使用（Obsidian）
1. 在 Obsidian 中打开 `🦁 交易员控制台 (Trader Command)4.0.md`。
2. Dataview 会依次加载脚本：例如 `dv.view("Scripts/pa-core")`。若视图为空，请点击右上角刷新或手动触发 Dataview 刷新。
3. 如需强制重新扫描全库：在控制台页面点击“↻ 数据”按钮，或在命令面板执行 `dataview:force-refresh-views`，并确保点击过重新扫描按钮以触发 `window.paForceReload = true`。
4. 导出数据：页面顶部有 `📥 导出 JSON (App)` 按钮，会把 `window.paData` 写到仓库根目录 `pa-db-export.json`。

常见问题与提示
- 若图片不显示：确保笔记 frontmatter 中 `cover:` 的值是 `![[图片名.png]]` 或可访问的 HTTP(S) 链接。脚本尝试解析 `![[...]]` 并生成资源路径。
- 路径大小写：我们已在新分支统一创建 `Scripts/`（大写），在跨平台环境或将仓库移到区分大小写的文件系统时请保留 `Scripts/`。
- 如果某些视图报错或显示 `Engine Loading...`，说明 `pa-core` 尚未成功运行或 `window.paData` 未建立，请先运行 `dv.view("Scripts/pa-core")`。

开发与修改
- 新分支：`Scripts-uppercase-and-theme-merge`（包含本次大写路径与主题合并变更）。
- 若要测试：切换到该分支，启动 Obsidian 并打开控制台页面，然后观察视图加载与日志（Dev Console）。

提交说明
- 本分支已将多个脚本的加载保护与图片解析改进，并添加 `Scripts/` 路径下的脚本副本，便于在区分大小写文件系统下保持一致性。

如果你希望我：
- 将 `scripts/` 中的修改删除并仅保留 `Scripts/`（需要确认），或
- 把 `Scripts/` 的修改合并回 `scripts/`（保持小写并统一），请告诉我你偏好哪种命名策略。

---
（自动生成的简要说明 — 如需更详细的 README 或部署步骤，我可以继续扩充）

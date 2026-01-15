# Changelog（Skill / 插件维护演进记录）

> 目的：让维护经验可追溯、可复用；每次控制台任务完成后追加一条。

## Template

- Date: YYYY-MM-DD
- Task: （一句话描述）
- Scope: UI | Bugfix | Build | Dependency | Integration
- Files: （列出涉及文件）
- Build gate: `npm run build` ✅/❌
- Notes: （关键坑/关键锚点/回滚点）

---

## Entries

- Date: 2026-01-04
- Task: 初始化 trading-console-plugin-maintainer skill
- Scope: Docs
- Files: `SKILL.md`, `references/*`, `memory/*`
- Build gate: N/A
- Notes: 把“大文件安全编辑 + build 门禁 + 回滚策略”固化为标准流程

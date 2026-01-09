[x] i18n 完善  
    - ✅ 统一 /lang 与 /ai 入口的语言偏好落盘/读取路径，覆盖按钮流、命令流、快捷触发三条链路。  
    - ✅ 补齐 locales/en 与 zh_CN 词条缺失项（当前 273 条），运行 ./scripts/verify.sh 后人工对话验收。  
    - ✅ 所有 InlineKeyboardButton 中文按钮已替换为 _btn/_btn_lang（剩余 0 处）
    - ✅ i18n 基础设施完成：libs/common/i18n.py + locales/*.po/*.mo
    - ✅ 39 个卡片文件已添加 i18n 支持

[ ] 优化部署流程（简单、方便，有效先使用旧的数据库配置优化流程和实现）  
    - ⚠️ TimescaleDB 端口不一致：config/.env.example 使用 5434，scripts/export_timescaledb.sh 使用 5433  
    - [ ] 在 install/init/start 三脚本中补充失败提示与依赖缺失指引，保证全流程零交互可跑通。  

[ ] 优化信号功能  
    - ✅ signals 模块存在：engine_v2.py, formatter.py, pusher_v2.py, ui.py
    - ✅ signals/ui.py 已添加 i18n 支持
    - [ ] 检查 telegram-service/src/signals 下规则，补充单元/集成测试或最小复现脚本。  
    - [ ] 为高频告警增加去重/节流配置项（写入 config/.env.example 并文档化）。  

[x] 适配新的服务和本地 GEMINI CLI 处理 AI 请求的方法  
    - ✅ ai-service/scripts/start.sh 已实现 test 命令，支持本地测试数据获取
    - ✅ predict-service 已有完整文档：README.md, AGENTS.md, docs/
    - ✅ predict-service 包含 3 个子服务：polymarket, opinion, kalshi（各有 package.json）

[ ] 数据库完全迁移到新的 TimescaleDB（RAW/QUALITY schema）  
    - ⚠️ 端口配置不一致需统一（5433 vs 5434）
    - [ ] 迁移脚本与 README 说明统一到新端口/新 schema；确保数据导出/恢复/压缩脚本可用。  
    - [ ] 验收：使用 restore_*.sh 完成一次全量恢复并通过 ./scripts/verify.sh。

[ ] 可视化微服务 (vis-service)

    ## 当前状态
    - ✅ FastAPI 服务框架：`services-preview/vis-service/src/main.py`
    - ✅ REST API 路由：`/health`, `/templates`, `/render`
    - ✅ 配置管理：`core/settings.py` (host/port/token/cache)
    - ✅ 已注册 **8 个模板**（registry.py）：
      | 模板 ID | 名称 | 输出 |
      |:---|:---|:---|
      | line-basic | 基础折线 | png/json |
      | kline-basic | K线+均线+量能 | png/json |
      | macd | 价格+MACD | png/json |
      | equity-drawdown | 权益+回撤 | png/json |
      | market-vpvr-heat | 全市场VPVR热力图 | png/json |
      | vpvr-zone-dot | VPVR价值区点阵 | png/json |
      | vpvr-zone-grid | VPVR价值区卡片 | png/json |
      | vpvr-zone-strip | VPVR条带散点 | png/json |
    - ✅ Telegram Bot 集成模块：`telegram-service/src/bot/vis_handler.py`
    - ✅ 主菜单已添加「📈 可视化」入口按钮 (app.py:1141)

    ## 待修复问题
    - [ ] **vpvr_ridge 模板未注册**：`render_vpvr_ridge()` 函数已实现 (registry.py:868)，但未调用 `registry.register()`，导致 Bot 无法使用
    - [ ] **模板 ID 不匹配**：vis_handler.py 使用 `vpvr_ridge`（下划线），registry.py 其他模板用 `vpvr-zone-*`（中划线）

    ## Telegram Bot 接入 TODO
    - [ ] 注册 vpvr-ridge 模板到 registry，使用统一中划线命名
    - [ ] vis_handler.py 中 VIS_TEMPLATES 的 template_id 改为中划线格式（`vpvr-ridge`, `vpvr-zone-strip`, `kline-basic`）
    - [ ] 添加 i18n 词条：`vis.template.*`, `vis.menu.title`, `vis.select_symbol`, `vis.select_interval` 到 locales/en.po 和 zh_CN.po
    - [ ] 为全市场模板（vpvr-zone-strip, market-vpvr-heat）添加数据源对接，当前仅支持单币种
    - [ ] 添加错误边界：渲染超时、数据缺失时返回友好提示
    - [ ] 可选：支持用户自定义 symbols 列表（从 config/.env 读取 SYMBOLS_GROUPS）

    ## 服务端 TODO
    - [ ] 完善 HTTP API 文档（OpenAPI schema 已自动生成，可添加示例）
    - [ ] 添加渲染缓存 TTL 配置（当前 diskcache 已引入但未启用）
    - [ ] 可选：支持 SVG 输出格式
    - [ ] 可选：添加 `/render/batch` 批量渲染接口

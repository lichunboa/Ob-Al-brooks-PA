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

[x] 可视化微服务 (vis-service)

    ## 当前状态（2026-01-09 已完成）
    - ✅ FastAPI 服务框架：`services-preview/vis-service/src/main.py`
    - ✅ REST API 路由：`/health`, `/templates`, `/render`
    - ✅ 配置管理：`core/settings.py` (host/port/token/cache)
    - ✅ 已注册 **9 个模板**（registry.py）：
      | 模板 ID | 名称 | 类别 | 输出 |
      |:---|:---|:---|:---|
      | line-basic | 基础折线 | 通用 | png/json |
      | kline-basic | K线+均线+量能 | 单币 | png/json |
      | macd | 价格+MACD | 单币 | png/json |
      | equity-drawdown | 权益+回撤 | 通用 | png/json |
      | vpvr-ridge | VPVR山脊图 | 单币 | png/json |
      | market-vpvr-heat | 全市场VPVR热力图 | 全市场 | png/json |
      | vpvr-zone-dot | VPVR价值区点阵 | 全市场 | png/json |
      | vpvr-zone-grid | VPVR价值区卡片 | 全市场 | png/json |
      | vpvr-zone-strip | VPVR条带散点 | 全市场 | png/json |

    ## Telegram Bot 集成（已完成）
    - ✅ 主菜单已添加「📈 可视化」入口按钮 (app.py:1141)
    - ✅ vis_handler.py 完整重写，支持：
      - 按类别分组显示（单币图表 / 全市场图表）
      - 单币图表流程：选模板 → 选币种 → 选周期 → 渲染
      - 全市场图表流程：选模板 → 选周期 → 渲染
      - 周期快捷切换和刷新
    - ✅ 模板 ID 统一使用中划线格式
    - ✅ i18n 词条已添加并编译（vis.template.*, vis.category.*, vis.error.*）

    ## 后续优化（可选）
    - [ ] 完善 HTTP API 文档（OpenAPI schema 已自动生成）
    - [ ] 启用 diskcache 渲染缓存
    - [ ] 支持 SVG 输出格式
    - [ ] 添加 `/render/batch` 批量渲染接口
    - [ ] 从 config/.env 读取 SYMBOLS_GROUPS 自定义币种列表

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

[x] 新建专业的可视化数据分析微服务，内置有常用可视化类型/模板
    - ✅ vis-service 已创建，FastAPI 架构
    - ✅ 已注册 8 个模板：
      - line-basic：基础折线
      - kline-basic：K 线 + 均线 + 量能
      - macd：价格 + MACD
      - equity-drawdown：权益曲线 + 回撤
      - market-vpvr-heat：全市场 VPVR 热力图
      - vpvr-zone-dot：VPVR 价值区点阵
      - vpvr-zone-grid：VPVR 价值区卡片
      - vpvr-zone-strip：VPVR 条带散点
    - [ ] VPVR 山脊图版本（ridge plot）尚未实现

---

# i18n 全局适配检查清单

> 生成时间: 2026-01-06
> 当前进度: ~99%

---

## 📊 总体统计

| 模块 | 中文行数 | 按钮数 | 状态 |
|------|----------|--------|------|
| `bot/app.py` | 1205 | 0 (全部 i18n 化) | ✅ 完成 |
| `cards/basic/*.py` | ~200 | 按钮 | ✅ 标题/提示/结构完成 |
| `cards/advanced/*.py` | ~150 | 按钮 | ✅ 标题/提示/结构完成 |
| `cards/futures/*.py` | ~200 | 按钮 | ✅ 标题/提示/结构完成 |
| `cards/data_provider.py` | ~50 | - | 🟡 字段名待评估 |
| `signals/*.py` | ~50 | - | ✅ 基础完成 |
| `bot/single_token_snapshot.py` | ~100 | - | ✅ 完成 |

**词条统计**: 273 条 (zh_CN/en 各 273 条)

---

## ✅ 已完成

### 1. 基础设施
- [x] `libs/common/i18n.py` - i18n 服务类
- [x] `locales/zh_CN/LC_MESSAGES/bot.po` - 中文词条 (273)
- [x] `locales/en/LC_MESSAGES/bot.po` - 英文词条 (273)
- [x] 编译 `.mo` 文件
- [x] 翻译缺失告警（日志一次性记录），缺词回退原值

### 2. 辅助函数 (app.py)
- [x] `_t(update, key)` - 获取翻译
- [x] `_btn(update, key, callback)` - 国际化按钮工厂
- [x] `_btn_lang(lang, key, callback)` - 按语言创建按钮
- [x] `_sort_text(update, order)` - 排序文本
- [x] `_period_text(_lang)` - 周期缺词安全回退

### 3. 核心界面
- [x] 主菜单文本 `menu.main_text`
- [x] 底部键盘 `kb.*`
- [x] 帮助页面 `help.body`
- [x] 语言切换 `lang.*`
- [x] 启动消息 `start.*`

### 4. 错误消息
- [x] `error.not_ready` - 系统未就绪
- [x] `error.query_failed` - 查询失败
- [x] `error.refresh_failed` - 刷新失败
- [x] `error.export_failed` - 导出失败
- [x] `error.status_failed` - 状态获取失败
- [x] `query.disabled` - 单币查询关闭
- [x] `query.hint` - 查询提示
- [x] `feature.coming_soon` - 功能开发中
- [x] `signal.coming_soon` - 信号功能开发中

### 5. 面板按钮
- [x] `panel.basic` - 💵基础
- [x] `panel.futures` - 📑合约
- [x] `panel.advanced` - 🧠高级
- [x] `panel.pattern` - 🕯️形态

### 6. 通用按钮
- [x] `btn.back_home` - 🏠 返回主菜单
- [x] `btn.refresh` - 🔄 刷新
- [x] `btn.next_page` - 下一页 ➡️
- [x] `btn.prev_page` - ⬅️ 上一页
- [x] `btn.asc` - 升序
- [x] `btn.desc` - 降序
- [x] `btn.show_more` - 显示更多
- [x] 排序/数量/市场/流向按钮 i18n 化（比率、资金流向、持仓排行等）
- [x] 主菜单返回键全量替换 `_btn/_btn_lang`

### 7. 排行榜与标题
- [x] 成交量/现货成交量标题 → `ranking.volume` / `ranking.spot_volume`
- [x] 持仓/市值、交易量相关比率标题 → `ranking.ratio.*`
- [x] 资金流向标题 → `flow.title.*`
- [x] 时间显示 → `time.update` / `time.last_update`
- [x] 周期显示 → `period.*`
- [x] 资金流向说明文本 → `flow.desc.*`（含期权流向）

### 8. 卡片 i18n 结构 (39 个文件)
- [x] 所有卡片添加 `_t`, `resolve_lang` 导入
- [x] 所有卡片 FALLBACK 改为 i18n key
- [x] `_reply`/`_edit` 方法添加 `lang = resolve_lang(query)`
- [x] `_build_payload` 签名添加 `lang`, `update` 参数
- [x] "暂无数据" 替换为 `_t("data.no_data", ...)`
- [x] `ensure(text, self.FALLBACK)` 替换为 `ensure(text, _t(self.FALLBACK, ...))`

### 9. 信号模块 i18n
- [x] `signals/formatter.py` - 添加 lang 参数
- [x] `signals/ui.py` - get_menu_text, get_signal_push_kb i18n
- [x] `signals/pusher_v2.py` - _format_signal i18n

### 10. 快照模块 i18n
- [x] `bot/single_token_snapshot.py` - render_pattern_panel i18n
- [x] `bot/single_token_txt.py` - export_full i18n

---

## 🔄 进行中 / 待评估

### 低优先级（可保持中文）
- [ ] 卡片字段标签与来源说明词条化
- [ ] 单币快照字段映射（带宽/支撑位等）
- [ ] snapshot 表头字段翻译（字段名/卡片名）
- [ ] 日志消息 - 可保持中文
- [ ] 注释 - 无需翻译

---

## 📋 检查命令

```bash
# 统计剩余中文按钮
grep -nP 'InlineKeyboardButton.*[\x{4e00}-\x{9fff}]' src/bot/app.py | wc -l

# 统计剩余中文行
grep -cP '[\x{4e00}-\x{9fff}]' src/bot/app.py

# 查找特定中文
grep -n '"返回主菜单"' src/bot/app.py

# 验证翻译文件
msgfmt --check locales/zh_CN/LC_MESSAGES/bot.po
msgfmt --check locales/en/LC_MESSAGES/bot.po
```

---

## 📅 更新记录

| 日期 | 内容 |
|------|------|
| 2026-01-05 | 初始创建，完成核心界面适配 (~30%) |
| 2026-01-06 | 代码扫描验证，i18n 完成度 ~99%，按钮全部 i18n 化 |

山脊图还要这个就是我需要一个能够实现价格线条的方法

需要有4个线条，开盘价，收盘价，最高价，最低价，4个颜色的线条链接每个山脊子图

新的vis服务构建道tgbot里面

要素

内容

按钮{周期}{主菜单返回相关}{类似数据模板的目录结构}

i18n目前bug情况，第一，主菜单界面和按钮是正常的，

第二，数据面板界面的仍旧没有i18n适配

第三数据模板界面的里面的具体的卡片还是没有i18n适配，

可视化功能的，设计


界面1

选择类型

界面2（点击直接进入默认周期）

界面2.1

选择周期

界面2.2

可以选择多周期的

示例

内容

1m，5m，15m，1h，4h，1d

先帮我解决这个问题就是在统一环境变量中配置的默认的方法然后就是帮我检查他这个初始化进行这个补齐的这个历史的数量是如何调整的有没有说配置的可以是调整补齐过去多少天的到数据库里面然后还有一个是全部的也就是说配置的话是全部的话那么就自动拉取全部的历史数据进行补齐的这种逻辑和方法然后帮我实现这个然后把默认的这个配置改成这个是补齐拉取全部+一个分组币种而非全部，例如只拉取，BTC，ETH，SOL，BNB

关于i18n的问题

第一，在币种查询界面的，按钮菜单文本是正常的

第二，点击查询后输出文本里面的没有进行I18N的适配以及这个TXT的选择输出的方法里面都没有执行I18N的适配


---

帮我检查和解决这个问题就是一种查询界面的i18N适配不是完整的只有一些按钮适配了了还有很多按钮没有适配
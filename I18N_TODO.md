# i18n 全局适配检查清单

> 更新时间: 2026-01-08
> 当前进度: ~90%

---

## 📊 总体统计

| 模块 | 中文行数 | 按钮数 | 状态 |
|------|----------|--------|------|
| `bot/app.py` | 1187 | 101 | 🟢 按钮/标题已替换 |
| `cards/basic/*.py` | ~441 | 按钮 | 🟢 按钮已 i18n（通过 BUTTON_KEY_MAP） |
| `cards/advanced/*.py` | ~484 | 按钮 | 🟢 按钮已 i18n（通过 BUTTON_KEY_MAP） |
| `cards/futures/*.py` | ~762 | 按钮 | 🟢 按钮已 i18n（通过 BUTTON_KEY_MAP） |
| `cards/data_provider.py` | ~124 | - | 🟡 部分完成 |
| `signals/*.py` | ~249 | - | 🟢 ui.py 按钮已 i18n, formatter.py 已 i18n |
| `bot/single_token_snapshot.py` | ~199 | - | 🟢 标题/提示已 i18n |

### PO 条目统计
- zh_CN: 802 条
- en: 802 条

---

## ✅ 已完成

### 1. 基础设施
- [x] `libs/common/i18n.py` - i18n 服务类
- [x] `locales/zh_CN/LC_MESSAGES/bot.po` - 中文词条 (302)
- [x] `locales/en/LC_MESSAGES/bot.po` - 英文词条 (302)
- [x] 编译 `.mo` 文件
- [x] 翻译缺失告警（日志一次性记录），缺词回退原值

### 2. 辅助函数
- [x] `_t(update, key)` - 获取翻译
- [x] `_btn(update, key, callback)` - 国际化按钮工厂
- [x] `_btn_auto(update, label, callback)` - 自动映射按钮（支持 ❎ 前缀）
- [x] `BUTTON_KEY_MAP` - 中文标签到 i18n 键的映射表

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

### 6. 通用按钮（通过 BUTTON_KEY_MAP 自动映射）
- [x] `btn.sort.desc` - 降序
- [x] `btn.sort.asc` - 升序
- [x] `btn.limit.10/20/30` - 10条/20条/30条
- [x] `market.spot` - 现货
- [x] `market.futures` - 期货
- [x] `menu.home` - 🏠主菜单
- [x] `btn.back_home` - 🏠 返回
- [x] `btn.back` - ⬅️ 返回
- [x] `btn.back_kdj` - ⬅️ 返回KDJ
- [x] `btn.refresh` - 🔄刷新
- [x] `btn.settings` - ⚙️设置

### 7. 期货字段按钮（2026-01-08 新增）
- [x] `btn.field.taker_ratio` - 主动多空比
- [x] `btn.field.taker_bias` - 主动偏离
- [x] `btn.field.taker_momentum` - 主动动量
- [x] `btn.field.top_ratio` - 大户多空比
- [x] `btn.field.top_bias` - 大户偏离
- [x] `btn.field.top_momentum` - 大户动量
- [x] `btn.field.top_volatility` - 大户波动
- [x] `btn.field.crowd_ratio` - 全体多空比
- [x] `btn.field.crowd_bias` - 全体偏离
- [x] `btn.field.crowd_volatility` - 全体波动
- [x] `btn.field.oi_change_pct` - 持仓变动%
- [x] `btn.field.oi_change` - 持仓变动
- [x] `btn.field.oi_value` - 持仓金额

### 8. 信号按钮（2026-01-08 新增）
- [x] `btn.analyze` - 分析
- [x] `btn.ai_analyze` - AI分析

### 9. 卡片 FALLBACK
- [x] 39/39 卡片 FALLBACK 已 i18n（0 硬编码）

---

## 🔄 进行中

### 信号模块
- [x] `signals/formatter.py` - 信号格式化文本（已完成 i18n）
- [ ] `signals/engine_v2.py` - 日志消息（52 行中文，内部日志可跳过）

---

## ❌ 未开始

### 1. 卡片字段标签（较大重构）
```python
# 示例：EMA排行卡片.py
general_sort = [("quote_volume", "成交额"), ("振幅", "振幅"), ...]
special_sort = [("ema7", "EMA7"), ("ema25", "EMA25"), ...]
```
建议：保持中文字段名，或创建 `field.*` 词条映射

### 2. 信号格式化文本
```python
# signals/formatter.py
"💰行情", "📊合约", "📉动量", "📈趋势"
```

### 3. 单币快照字段映射
```python
# single_token_snapshot.py
("bandwidth", "带宽"), ("支撑位", "支撑位"), ("阻力位", "阻力位")
```

### 4. 排行榜服务
```python
# 排行榜服务.py - 108 行中文
title/sort_text/period 映射
```

---

## 📋 按钮 i18n 实现说明

### BUTTON_KEY_MAP 自动映射机制

`cards/i18n.py` 中的 `BUTTON_KEY_MAP` 提供中文标签到 i18n 键的映射：

```python
BUTTON_KEY_MAP = {
    "降序": "btn.sort.desc",
    "升序": "btn.sort.asc",
    "现货": "market.spot",
    "期货": "market.futures",
    "主动多空比": "btn.field.taker_ratio",
    # ...
}
```

### btn_auto 函数

`btn_auto(update, label, callback)` 自动处理：
1. 查找 `BUTTON_KEY_MAP` 映射
2. 支持 `❎` 前缀（关闭状态按钮）
3. 未命中时回退原文

### 卡片中的 b() 函数

每个卡片内部定义的 `b()` 函数调用 `_btn_auto`：
```python
def b(label: str, data: str, active: bool = False, disabled: bool = False):
    if disabled:
        return InlineKeyboardButton(label, callback_data=data or 'nop')
    return _btn_auto(None, label, data, active=active)
```

因此所有通过 `b("降序", ...)` 调用的按钮都会自动进行 i18n。

---

## 🔧 实施建议

### 优先级 P0 (已完成)
- [x] 按钮 i18n（通过 BUTTON_KEY_MAP）
- [x] FALLBACK i18n
- [x] 错误消息 i18n

### 优先级 P1 (可选)
- [ ] 信号格式化文本
- [ ] 卡片字段标签（建议保持中文）

### 优先级 P2 (延后)
- [ ] 日志消息（可保持中文）
- [ ] 注释（无需翻译）

---

## 📋 检查命令

```bash
# 统计 PO 条目
grep -c '^msgid ' locales/zh_CN/LC_MESSAGES/bot.po

# 检查 InlineKeyboardButton 硬编码
grep -rPn 'InlineKeyboardButton\([^)]*[\x{4e00}-\x{9fff}]' src/ | grep -v '_t(' | grep -v '_btn_auto'

# 检查 b() 硬编码（这些会通过 BUTTON_KEY_MAP 自动映射）
grep -rPoh 'b\("[^"]*[\x{4e00}-\x{9fff}][^"]*"' src/cards/ | sort -u

# 验证翻译文件
msgfmt --check locales/zh_CN/LC_MESSAGES/bot.po
msgfmt --check locales/en/LC_MESSAGES/bot.po

# 编译 MO 文件
msgfmt -o locales/zh_CN/LC_MESSAGES/bot.mo locales/zh_CN/LC_MESSAGES/bot.po
msgfmt -o locales/en/LC_MESSAGES/bot.mo locales/en/LC_MESSAGES/bot.po
```

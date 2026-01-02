# TradeCat 优化待办清单

> 生成时间: 2026-01-03 05:35
> 基于代码审查核实后的实际问题

---

## 📊 总览

| 优先级 | 数量 | 预计工时 |
|:---:|:---:|:---:|
| P0 (必修) | 2 | 1h |
| P1 (重要) | 3 | 2h |
| P2 (建议) | 2 | 1h |
| **合计** | **7** | **4h** |

---

## P0 - 必修（影响部署/稳定性）

### 1. 硬编码绝对路径
- **位置**: `services/trading-service/config/.env.example:8`
- **现状**:
  ```
  INDICATOR_SQLITE_PATH=/home/lenovo/.projects/tradecat/libs/database/...
  ```
- **问题**: 项目迁移或其他用户部署时路径失效
- **修复**: 改为相对路径说明或占位符
- **复杂度**: 低

### 2. 依赖版本未锁定
- **位置**: 所有 `requirements.txt`
- **现状**:
  ```
  psycopg[binary,pool]>=3.1.0
  aiohttp>=3.9.0
  ```
- **问题**: 依赖漂移可能导致生产环境不兼容
- **修复**: 生成 `requirements.lock.txt` 或固定版本
- **复杂度**: 中

---

## P1 - 重要（影响可维护性）

### 3. BOT_TOKEN 命名不一致
- **位置**: 
  - `services/telegram-service/config/.env.example:9`
  - `services/telegram-service/src/bot/app.py:259-260`
- **现状**:
  ```python
  BOT_TOKEN = _require_env('BOT_TOKEN', required=True)
  TELEGRAM_BOT_TOKEN = BOT_TOKEN  # 为了兼容性添加别名
  ```
- **问题**: 两个变量名混用，增加理解成本
- **修复**: 统一使用 `BOT_TOKEN`，删除别名
- **复杂度**: 低

### 4. 裸 except 异常处理
- **位置**: `services/trading-service/src/simple_scheduler.py`
  - 第 215 行: `except:`
  - 第 231 行: `except:`
  - 第 251 行: `except:`
- **现状**:
  ```python
  except:
      return None
  ```
- **问题**: 隐藏具体错误，难以调试
- **修复**: 改为 `except Exception as e:` 并记录日志
- **复杂度**: 低

### 5. 硬编码屏蔽币种
- **位置**: `services/telegram-service/src/bot/app.py`
  - 第 779 行
  - 第 2125 行
- **现状**:
  ```python
  self.blocked_symbols = {'BNXUSDT', 'ALPACAUSDT'}
  ```
- **问题**: 修改需要改代码，不够灵活
- **修复**: 移到 `.env` 配置 `BLOCKED_SYMBOLS=BNXUSDT,ALPACAUSDT`
- **复杂度**: 低

---

## P2 - 建议（提升代码质量）

### 6. simple_scheduler SQLite 未用连接池
- **位置**: `services/trading-service/src/simple_scheduler.py:220-232`
- **现状**:
  ```python
  conn = sqlite3.connect(SQLITE_PATH)
  row = conn.execute(...).fetchone()
  conn.close()
  ```
- **问题**: 频繁开关连接，与 `data_provider.py` 的连接池实现不一致
- **修复**: 复用 `_SQLitePool` 或启用 `check_same_thread=False`
- **复杂度**: 中

### 7. 缺少单元测试
- **位置**: 项目根目录
- **现状**: 无 `tests/` 目录，无测试文件
- **问题**: 重构时无法验证正确性
- **修复**: 为核心模块添加 pytest 测试
- **复杂度**: 高（持续性工作）

---

## ❌ 已排除的问题

以下问题经核实**不需要修复**：

| 问题 | 排除原因 |
|:---|:---|
| 数据库缺索引 | `candles_1m` 已有 `(symbol, bucket_ts DESC)` 复合索引 |
| 缺健康检查 | telegram-service 已有 `/ping` 命令 |
| SQLite 并发风险 | 已启用 WAL 模式 (`PRAGMA journal_mode = wal`) |
| 虚拟环境过大 | 574MB 对 4 个独立服务属正常范围 |
| 配置分散 | 当前「全局 + 私有」设计合理 |
| SQLite 303MB | 38 张表 × ~63K 行，正常范围 |

---

## ⏸️ 长期规划（暂不实施）

以下为架构级优化，当前阶段不需要：

- 服务间通信改消息队列
- 引入 Prometheus + Grafana 监控
- API 文档生成（Swagger/OpenAPI）
- 配置中心服务
- 依赖管理改 Poetry/uv

---

## 📝 修复检查清单

完成修复后打勾：

- [ ] #1 硬编码路径
- [ ] #2 依赖版本锁定
- [ ] #3 BOT_TOKEN 统一
- [ ] #4 裸 except 处理
- [ ] #5 屏蔽币种配置化
- [ ] #6 SQLite 连接池
- [ ] #7 单元测试（长期）

---

*报告生成: Kiro AI*

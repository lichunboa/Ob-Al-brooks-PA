# CSV 统计逻辑汇总

## 概述

Polymarket 服务中存在 **4 套独立的统计/报告生成逻辑**，各有不同用途和数据源。

---

## 1. CSV 报告生成器 (主要)

**文件**: `scripts/csv-report.js`  
**触发**: Telegram `/csv` 命令 (`commands/index.js:handleCsvReport()`)  
**数据源**: 日志文件 (`logs/polymarket.log`)  
**输出格式**: CSV 文件  
**时间范围**: 滚动 24 小时

### 功能特性

- **Top 15 排行榜**:
  - 套利信号 (出现次数 + 最高利润%)
  - 大额交易 (交易次数)
  - 订单簿失衡 (失衡次数)
  - 聪明钱 (信号次数)
  - 新市场 (出现次数)
  - 综合热门市场 (多维度汇总)

- **时段分析**:
  - 活跃时段分布 (24小时)
  - 时段-类型分布 (套利/大额/订单簿/聪明钱)

- **操作统计**:
  - 买卖比例 (建仓/加仓 vs 清仓)
  - 聪明钱操作类型 (建仓/加仓/清仓)
  - 套利利润分布 (0-2%/2-5%/5-10%/10%+)

- **市场分类**:
  - 按类别统计 (sports/crypto/politics/entertainment/finance/other)
  - 聪明钱按类别分布

- **高级特性**:
  - 信号爆发检测 (1分钟内 ≥20 个信号)
  - 市场信号类型追踪 (每个市场触发的信号类型)
  - 市场链接生成 (通过 slug 缓存 + 模糊匹配)
  - 市场名称中文化（翻译缓存优先，缺失时走代理翻译）

### 执行流程

```javascript
// commands/index.js:handleCsvReport()
1. 用户发送 /csv 命令
2. 使用 spawnSync 执行 csv-report.js
3. 传入日志路径 (CSV_LOG_FILE 或默认 logs/polymarket.log)
4. 脚本输出 CSV 到 stdout
5. 保存为临时文件 /tmp/polymarket-report-{date}.csv
6. 通过 Telegram 发送文件
7. 清理临时文件
```

### 配置项

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `CSV_LOG_FILE` | `logs/polymarket.log` | 日志文件路径 |
| `CSV_REPORT_TIMEOUT_MS` | `180000` (3分钟) | 脚本执行超时 |
| `CSV_FETCH_TIMEOUT_MS` | `15000` | API 请求超时 |
| `CSV_ENABLE_API_RANKINGS` | `false` | 是否启用 API 排行榜 |
| `CSV_TRANSLATE` | `true` | 是否强制输出中文市场名 |
| `CSV_TRANSLATE_MAX` | `120` | 单次 CSV 最多翻译的市场名数量 |
| `CSV_TRANSLATE_CACHE_FILE` | `data/translation-cache.json` | 翻译缓存路径 |

### 已知问题与修复

**问题**: CSV 输出为空  
**根因**: 
- 日志路径错误 (默认 `/root/.pm2/...` 与实际不符)
- 脚本 stdout 为空但未报错

**修复** (2026-01-26):
- `commands/index.js` 使用 `spawnSync` 传入正确日志路径
- stdout 为空时直接抛出异常
- 支持 `CSV_LOG_FILE` 环境变量覆盖

**修复** (2026-01-27):
- 时间戳解析支持「仅时间」行（如 `⏱️ 10:05:00 ...`）
- 🏷️ 标签行无时间也能提取市场名，避免统计为空

---

## 2. 详细报告生成器

**文件**: `scripts/detailed-report.js`  
**触发**: 手动执行 `node scripts/detailed-report.js [date]`  
**数据源**: 日志文件 + Gamma API  
**输出格式**: TXT 文件 (`data/detailed-report-{date}.txt`)  
**时间范围**: 指定日期 (默认昨天)

### 功能特性

- 从 Gamma API 获取市场 slug 映射
- 解析日志统计信号数量
- 生成带市场链接的详细报告
- 按信号类型分组展示

### 执行流程

```javascript
1. fetchMarketSlugs() - 从 API 获取市场列表
2. parseLogStats() - 解析日志统计
3. generateReport() - 生成 TXT 报告
4. 保存到 data/detailed-report-{date}.txt
```

---

## 3. 信号统计脚本

**文件**: `scripts/signal-stats.js`  
**触发**: 手动执行 `node scripts/signal-stats.js [date]`  
**数据源**: 日志文件  
**输出格式**: 控制台输出  
**时间范围**: 指定日期 (默认今天)

### 功能特性

- 统计各类信号数量:
  - 套利信号
  - 大额交易
  - 订单簿失衡
  - 聪明钱
  - 新市场
  - 价格飙升
  - 流动性告警
  - 鲸鱼交易
  - 深度套利
  - 订单簿倾斜

- 按小时分布统计
- 控制台友好输出 (表格格式)

### 执行流程

```javascript
1. parseLog() - 解析日志按小时统计
2. formatStats() - 格式化输出
3. 打印到控制台
```

---

## 4. 仪表盘脚本

**文件**: 
- `scripts/dashboard-simple.js` (简化版)
- `scripts/dashboard-full.js` (完整版)

**触发**: 手动执行  
**数据源**: 实时 WebSocket 订阅  
**输出格式**: 控制台实时输出  
**时间范围**: 实时

### 功能特性

- 实时监控市场活动:
  - 交易 (trades)
  - 评论 (comments)
  - 价格变化 (prices)
  - 市场创建/更新 (markets)
  - 反应 (reactions)

- 格式化输出:
  - 交易金额、方向、价格
  - 评论内容
  - 价格变化百分比
  - 市场状态

### 执行流程

```javascript
1. 连接 Gamma WebSocket
2. 订阅市场事件
3. 实时格式化输出到控制台
4. 统计累计数据
```

---

## 对比总结

| 脚本 | 用途 | 数据源 | 输出 | 时间范围 | 触发方式 |
|------|------|--------|------|----------|----------|
| **csv-report.js** | 生成 CSV 报告 | 日志文件 | CSV 文件 | 滚动 24h | Telegram `/csv` |
| **detailed-report.js** | 详细报告 | 日志 + API | TXT 文件 | 指定日期 | 手动执行 |
| **signal-stats.js** | 信号统计 | 日志文件 | 控制台 | 指定日期 | 手动执行 |
| **dashboard-*.js** | 实时监控 | WebSocket | 控制台 | 实时 | 手动执行 |

---

## 统一建议

### 当前问题

1. **逻辑重复**: 4 套脚本都有日志解析逻辑，维护成本高
2. **数据源不一致**: 有的用日志，有的用 API，有的用 WebSocket
3. **配置分散**: 超时、路径等配置散落在各文件
4. **错误处理不统一**: 有的抛异常，有的静默失败

### 优化方向

1. **抽取公共模块**:
   ```
   utils/
   ├── log-parser.js      # 统一日志解析
   ├── market-linker.js   # 市场链接生成
   ├── stats-aggregator.js # 统计聚合
   └── report-formatter.js # 报告格式化
   ```

2. **统一配置管理**:
   ```javascript
   // config/report-settings.js
   module.exports = {
     logFile: process.env.CSV_LOG_FILE || 'logs/polymarket.log',
     timeout: Number(process.env.CSV_REPORT_TIMEOUT_MS || 180000),
     fetchTimeout: Number(process.env.CSV_FETCH_TIMEOUT_MS || 15000),
     enableApiRankings: process.env.CSV_ENABLE_API_RANKINGS === 'true'
   };
   ```

3. **统一错误处理**:
   ```javascript
   // utils/error-handler.js
   class ReportError extends Error {
     constructor(message, code, details) {
       super(message);
       this.code = code;
       this.details = details;
     }
   }
   ```

4. **添加单元测试**:
   ```
   tests/
   ├── log-parser.test.js
   ├── market-linker.test.js
   └── stats-aggregator.test.js
   ```

---

## 当前状态 (2026-01-27)

- ✅ `/csv` 命令已修复 (正确传入日志路径)
- ✅ 空输出检测已添加
- ✅ 支持 `CSV_LOG_FILE` 环境变量
- ⏳ 等待服务器复测验证
- 📋 建议后续重构统一逻辑

---

## 调试命令

```bash
# 本地测试 CSV 生成
node scripts/csv-report.js logs/polymarket.log | wc -c

# 检查日志文件
tail -n 50 logs/polymarket.log

# 手动生成详细报告
node scripts/detailed-report.js 2026-01-26

# 查看信号统计
node scripts/signal-stats.js 2026-01-26

# 启动实时仪表盘
node scripts/dashboard-simple.js
```

---

**文档版本**: v1.0  
**最后更新**: 2026-01-27  
**维护者**: AI Agent

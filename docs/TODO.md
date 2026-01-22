# TradeCat TODO 清单

> 更新时间：2026-01-18
> 
> 优先级说明：🔴 紧急 | 🟠 重要 | 🟡 一般 | 🟢 低优先级

---

## 🔴 紧急修复（灾难性故障）

### Bot 响应问题
- [x] **全局 bot 即时响应未生效** - 2026-01-18 已修复  
  - 动作：放宽群聊命令/按钮放行，保留普通文本白名单；修正 `_t` 调用顺序；重启服务
  - 症状：消息发送后无即时反馈
  - 影响：用户体验极差，以为 bot 挂了
  - 排查方向：`telegram-service/src/bot/app.py` 消息处理链路
  
- [x] **币种查询功能问题** - 2026-01-18 修复对齐与触发
  - `BTC!` / `BTC!!` / `BTC@` 触发无反馈
  - 检查 `single_token_snapshot.py`、`single_token_txt.py`

### 群聊安全
- [x] **tgbot 群聊消息回调触发白名单** - 2026-01-18 调整为“命令/按钮放行，普通文本仍需白名单+@”
  - 已实现：命令前缀过滤（`/`、`!` 或 bot_command 实体即放行）
  - 已实现：普通文本仍需白名单且需 @bot（防刷屏）

---

## 🟠 重要功能（核心体验）

### i18n 国际化残留
- [ ] **卡片中文字段与表头中英文问题**
  - 涉及 39 张卡片（basic/advanced/futures）
  - 字段名硬编码中文，需改用 i18n key
  - 表头翻译不完整
  - 参考：`services/telegram-service/src/cards/i18n.py`

### 数据面板可用性
- [ ] **行情情绪/涨跌榜缓存为空**  
  - 原因：`telegram-service/src/bot/app.py` 硬编码 `BINANCE_API_DISABLED=True`，跳过 Binance 拉取，`ticker_24hr_data` / `funding_rate_data` 始终为空  
  - 方向：决定是否恢复外部拉取或改用 TimescaleDB/SQLite 本地数据源；否则保持禁用仅会有告警

### 数据架构优化
- [ ] **SQLite 数据迁移到统一 PG 库**（重要但不紧急）
  - 当前：`libs/database/services/telegram-service/market_data.db`
  - 目标：统一到 TimescaleDB (5434)
  - 好处：数据一致性、查询性能、运维简化
  
- [ ] **数据库全市场适配**（重要但不紧急）
  - 当前仅支持币安永续合约
  - 目标：支持美股/A股/宏观数据
  - 涉及：markets-service 数据写入、trading-service 指标计算

### 内部通讯与数据消费
- [ ] **内部 API 通讯层**
  - 服务间 HTTP/gRPC 调用标准化
  - 数据消费方法抽象
  - 考虑发布 PyPI 包供外部使用

---

## 🟡 功能增强

### AI 与策略
- [ ] **成熟策略组供 AI 使用**
  - 整理现有指标组合为策略模板
  - 策略：趋势跟踪、均值回归、动量突破、期货情绪
  - AI 可根据市场状态选择策略

- [ ] **接入执行模块**
  - 复用现有开源 AI 项目轮子
  - 接入统计数据源
  - 复用 AI 功能消费的数据作为新增字段

### 信号服务增强
- [ ] **信号规则扩展**（当前 129 条）
  - core: 20 条
  - momentum: 27 条
  - trend: 19 条
  - volatility: 15 条
  - volume: 13 条
  - futures: 11 条
  - pattern: 16 条
  - misc: 8 条
  - 目标：补充跨周期信号、组合信号

### 可视化增强
- [ ] **vis-service 功能完善**
  - K线图渲染优化
  - 指标叠加显示
  - VPVR 成交量分布图
  - 端口：8087

---

## 🟢 技术债务

### 代码质量
- [ ] 统一日志格式（部分服务日志格式不一致）
- [ ] 补充单元测试（当前覆盖率低）
- [ ] 类型注解完善（关键函数缺少类型）

### 文档同步
- [ ] README.md / README_EN.md / AGENTS.md 保持同步
- [ ] API 文档自动生成（api-service）

### 配置管理
- [ ] 端口统一（5433 vs 5434 混用问题）
- [ ] 环境变量校验（启动时检查必填项）
- [ ] PG 实时信号服务导入失败告警  
  - 现象：`signals.pg_engine` 导入失败，PG 实时信号未启动  
  - 方向：调整 telegram-service 的导入路径或在 signal-service 侧提供可导入入口，并确保 psycopg/PG 配置就绪

---

## 📊 项目现状统计

| 模块 | 数量 | 状态 |
|:---|:---:|:---|
| 稳定版服务 | 5 | data/trading/telegram/ai/signal |
| 预览版服务 | 6 | api/markets/vis/order/predict/fate |
| 排行榜卡片 | 39 | basic(9)/advanced(10)/futures(20) |
| 技术指标 | 32 | batch(22)/incremental(10) |
| 信号规则 | 129 | 8 个分类 |
| 数据规模 | 3.73亿 | K线 + 9457万期货指标 |

---

## 📝 备忘

### 服务端口
- TimescaleDB: 5433 (旧) / 5434 (新)
- api-service: 8000
- vis-service: 8087
- fate-service: 8001

### 关键路径
- 全局配置：`config/.env`
- SQLite 数据：`libs/database/services/telegram-service/market_data.db`
- 冷却持久化：`libs/database/services/signal-service/cooldown.db`

### 验证命令
```bash
./scripts/verify.sh          # 代码验证
./scripts/check_env.sh       # 环境检查
./scripts/start.sh status    # 服务状态
```

# TradeCat + DataCat 开发任务清单

> 基于 OctoBot 对比分析和项目现状，制定的优先级任务清单
> 
> 生成时间：2026-01-17 18:30
> 最新状态快照：2026-01-18
> - Bot 群聊命令/按钮即时响应已恢复
> - 单币快照对齐修复（wcwidth 支持）
> - I18N 按钮回调参数错误已修复

---

## 🔴 P0 - 紧急任务（立即开始）

### 1. 历史数据回填系统
- [ ] **参考 OctoBot 回填机制**
  - 研究 `OctoBot/octobot/backtesting/minimal_data_importer.py`
  - 分析其数据导入流程和格式转换
- [ ] **开发 TradeCat 回填模块**
  - 从 CCXT 批量获取历史 K线数据
  - 写入 TimescaleDB 的 candles_1m 表
  - 支持断点续传和增量更新
- [ ] **DataCat 历史数据迁移**
  - 将现有 unified.db 数据迁移到 TimescaleDB
  - 统一时间戳格式（UTC）
  - 建立数据完整性检查

### 2. 回测引擎开发
- [ ] **学习 OctoBot 回测架构**
  - 分析 `OctoBot/octobot/backtesting/` 模块
  - 理解事件驱动回测机制
  - 研究 `independent_backtesting.py` 实现
- [ ] **设计 TradeCat 回测框架**
  - 基于 TimescaleDB 的高性能回测
  - 支持多策略并行回测
  - 集成 DataCat 的非市场数据（新闻、社交）

---

## 🟡 P1 - 高优先级（2周内）

### 3. 策略引擎完善
- [ ] **借鉴 OctoBot 策略系统**
  - 研究 Tentacles 插件机制
  - 分析 Grid/DCA 策略实现
  - 学习 AI 策略集成方式
- [ ] **完善 TradeCat 策略模块**
  - 实现 Grid 网格交易策略
  - 开发 DCA 定投策略
  - 集成 ai-service 的 AI 策略

### 4. 数据统一与优化
- [ ] **TimescaleDB 优化**
  - 实现自动数据压缩和分区
  - 设置数据保留策略
  - 优化查询性能
- [ ] **统一数据接口**
  - 将 DataCat 的 unified.db 迁移到 TimescaleDB
  - 建立统一的数据访问层
  - 实现数据源健康监控

---

## 🟢 P2 - 中优先级（1个月内）

### 5. 策略优化器
- [ ] **参考 OctoBot 优化器**
  - 研究 `strategy_optimizer/` 模块
  - 学习参数优化算法
  - 分析性能评估指标
- [ ] **开发参数优化系统**
  - 实现遗传算法优化
  - 支持多目标优化
  - 集成回测结果分析

### 6. 模拟交易系统
- [ ] **设计虚拟交易环境**
  - 模拟订单撮合
  - 实现滑点和手续费
  - 支持多交易所模拟
- [ ] **风控系统**
  - 实现仓位管理
  - 设置止损止盈
  - 风险指标监控

---

## 🔵 P3 - 低优先级（2个月内）

### 7. 用户界面开发
- [ ] **Web UI 设计**
  - 参考 OctoBot Web 界面设计
  - 实现策略配置界面
  - 开发回测结果展示
- [ ] **API 服务完善**
  - 扩展现有 api-service
  - 实现 WebSocket 实时推送
  - 添加用户认证系统

### 8. 部署与运维
- [ ] **Docker 化部署**
  - 创建各服务的 Dockerfile
  - 编写 docker-compose.yml
  - 实现一键部署脚本
- [ ] **监控告警系统**
  - 集成 Prometheus + Grafana
  - 设置关键指标监控
  - 实现故障自动恢复

---

## 📊 技术债务清理

### 代码质量提升
- [ ] **统一代码规范**
  - 所有 Python 服务使用 ruff
  - 统一日志格式和级别
  - 完善错误处理机制
- [ ] **测试覆盖率**
  - 为核心模块添加单元测试
  - 实现集成测试
  - 设置 CI/CD 流水线

### 文档完善
- [ ] **API 文档**
  - 使用 OpenAPI 规范
  - 生成交互式文档
  - 添加使用示例
- [ ] **部署文档**
  - 编写详细安装指南
  - 创建故障排除手册
  - 制作视频教程

---

## 🎯 里程碑规划

### 第一阶段（2周）：数据基础
- ✅ 完成历史数据回填
- ✅ 实现基础回测功能
- ✅ 数据统一存储

### 第二阶段（1个月）：策略系统
- ✅ Grid/DCA 策略实现
- ✅ AI 策略集成
- ✅ 模拟交易环境

### 第三阶段（2个月）：完整平台
- ✅ Web UI 上线
- ✅ 策略优化器
- ✅ 生产环境部署

---

## 📝 学习资源

### OctoBot 重点研究模块
```
OctoBot/octobot/
├── backtesting/                    # 回测引擎 ⭐⭐⭐
├── strategy_optimizer/             # 策略优化 ⭐⭐⭐
├── producers/                      # 事件驱动 ⭐⭐
├── automation/                     # 自动化 ⭐⭐
└── community/                      # 社区功能 ⭐
```

### 参考项目对比
| 功能 | OctoBot | Freqtrade | 你的项目 |
|------|---------|-----------|----------|
| 数据采集 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 回测系统 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ 待开发 |
| 策略引擎 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ 部分 |
| 非市场数据 | ⭐⭐ | ❌ | ⭐⭐⭐⭐⭐ |

---

## ⚡ 快速行动计划

### 本周任务（优先级排序）
1. **今天**：研究 OctoBot 回测模块代码
2. **明天**：设计 TradeCat 回填数据架构
3. **后天**：开始实现历史数据回填功能
4. **本周末**：完成基础回测框架设计

### 资源分配建议
- **70%** 时间：P0 紧急任务
- **20%** 时间：P1 高优先级任务  
- **10%** 时间：技术调研和学习

---

*最后更新：2026-01-17 18:30*
*下次评估：2026-01-24*

# CLAWDBOT 集成项目 - 升级任务列表

**版本**: v1.0
**日期**: 2026-01-31
**关联文档**: [执行计划](./03-execution-plan.md) | [架构设计稿](./al-brooks-trader-architecture.md)

---

## 状态说明

| 状态 | 说明 |
|------|------|
| 待办 | 尚未开始 |
| 进行中 | 正在执行 |
| 已完成 | 已完成并验证 |
| 已阻塞 | 被依赖项阻塞，无法进行 |

## 优先级说明

| 优先级 | 含义 | 时间要求 |
|--------|------|----------|
| P0 | 阻塞性问题，必须立即修复 | 1-2 天内 |
| P1 | 高优先级，集成前置条件 | 本周内 |
| P2 | 核心功能开发 | 1-2 周内 |
| P3 | 高级功能与测试 | 3-4 周内 |
| P4 | 持续改进与优化 | 持续进行 |

---

## Phase 0: 现有问题修复

| ID | 优先级 | 类别 | 任务描述 | 依赖 | 状态 | 备注 |
|----|--------|------|----------|------|------|------|
| T-001 | P0 | BugFix | 根目录重复文件清理：git rm --cached 移除重复追踪文件 + 物理删除 | 无 | 已完成 | .gitignore 已同步更新 |
| T-002 | P0 | BugFix | Web Dashboard strategies/page.tsx 策略字段修复：`description` → `content` | 无 | 待办 | API 返回 content 字段有值，description 为空 |
| T-003 | P0 | BugFix | Web Dashboard Scanner 页面策略卡片显示修复 | T-002 | 待办 | 与 T-002 同一根因，需同步修复 |
| T-004 | P0 | Infra | .gitignore 清理：移除底部笔记注释（第 123-165 行），按类别重组 | 无 | 待办 | 确保不遗漏需忽略的文件类型 |
| T-005 | P0 | Infra | 验证 API 响应结构：确认 strategies 接口返回字段名称和类型 | 无 | 待办 | 为 T-002/T-003 提供准确依据 |

---

## Phase 1: SKILL.md 优化

| ID | 优先级 | 类别 | 任务描述 | 依赖 | 状态 | 备注 |
|----|--------|------|----------|------|------|------|
| T-006 | P1 | Optimization | 分析现有 SKILL.md 结构，确定拆分边界 | 无 | 待办 | 当前 1286 行 / ~17K tokens |
| T-007 | P1 | Optimization | 创建 SKILL-core.md：提取人设、分析框架、快速参考、安全规则 | T-006 | 待办 | 目标 ~7K tokens |
| T-008 | P1 | Optimization | 创建 references/strategies-detailed.md：迁移 11 策略卡片 | T-006 | 待办 | 保持策略卡片格式一致 |
| T-009 | P1 | Optimization | 创建 references/real-time-cases.md：迁移实战案例库 | T-006 | 待办 | |
| T-010 | P1 | Optimization | 创建 references/tools-and-checklists.md：迁移交易工具 | T-006 | 待办 | |
| T-011 | P1 | Optimization | 创建 references/al-brooks-quotes.md：迁移语录库 | T-006 | 待办 | |
| T-012 | P1 | Optimization | 创建 references/analysis-workflow-deep.md：迁移完整 6 步分析流程 | T-006 | 待办 | |
| T-013 | P1 | Optimization | 去重：对比 SKILL.md 与 al-brooks-knowledge/ 中 8 个文件的重复内容 | T-007 | 待办 | 标注引用关系，保留单一权威来源 |
| T-014 | P1 | Optimization | 验证拆分后 SKILL-core.md 独立可用性测试 | T-007 | 待办 | 加载 SKILL-core.md 后对话质量不下降 |
| T-015 | P1 | Doc | 编写 SKILL 文件使用说明：何时加载哪个 reference 文件 | T-014 | 待办 | |

---

## Phase 2: MCP Gateway 开发

| ID | 优先级 | 类别 | 任务描述 | 依赖 | 状态 | 备注 |
|----|--------|------|----------|------|------|------|
| T-016 | P2 | Infra | 初始化 mcp-gateway-service 项目：TypeScript + MCP SDK | T-001 | 待办 | 技术栈与后端统一 |
| T-017 | P2 | Infra | 配置管理：后端服务地址、端口、认证信息的配置化 | T-016 | 待办 | 使用 .env + config 模块 |
| T-018 | P2 | Feature | 实现 api-connector：连接 api-service:8088 | T-016 | 待办 | HTTP 连接池 + 超时 5s + 重试 3 次 |
| T-019 | P2 | Feature | 实现 sync-connector：连接 sync-service:8089 | T-016 | 待办 | |
| T-020 | P2 | Feature | 实现 signal-connector：连接 signal-service | T-016 | 待办 | 支持 HTTP + WebSocket |
| T-021 | P2 | Feature | 实现 MCP Tool: `get_market_status(symbol)` | T-018 | 待办 | 返回价格、趋势、周期 |
| T-022 | P2 | Feature | 实现 MCP Tool: `get_signals(symbol?, timeframe?)` | T-020 | 待办 | 返回最近信号列表 |
| T-023 | P2 | Feature | 实现 MCP Tool: `get_strategy(strategy_id)` | T-019 | 待办 | 返回策略卡片内容 |
| T-024 | P2 | Feature | 实现 MCP Tool: `list_strategies()` | T-019 | 待办 | 返回策略索引列表 |
| T-025 | P2 | Feature | 实现 MCP Tool: `get_active_alerts()` | T-020 | 待办 | 返回活跃告警 |
| T-026 | P2 | Feature | 实现向量索引：Obsidian Vault 笔记文本预处理 + 分块 | T-016 | 待办 | 中文分词 + 512 tokens/块 |
| T-027 | P2 | Feature | 实现向量索引：Embedding 生成 + ChromaDB 存储 | T-026 | 待办 | 模型选型待确认 |
| T-028 | P2 | Feature | 实现向量索引：增量更新机制（文件 hash 对比） | T-027 | 待办 | |
| T-029 | P2 | Feature | 实现 MCP Tool: `search_knowledge(query, top_k)` | T-027 | 待办 | 向量检索 + 结果排序 |
| T-030 | P2 | Infra | 健康检查端点 `/health`：检测所有上游服务状态 | T-018, T-019, T-020 | 待办 | |
| T-031 | P2 | Infra | Dockerfile 编写 + Docker Compose 集成 | T-016 | 待办 | 集成到现有 docker-compose |

---

## Phase 3: CLAWDBOT 集成测试

| ID | 优先级 | 类别 | 任务描述 | 依赖 | 状态 | 备注 |
|----|--------|------|----------|------|------|------|
| T-032 | P3 | Infra | 在 CLAWDBOT 配置中注册 MCP Gateway Server | T-030 | 待办 | 配置连接信息和认证 |
| T-033 | P3 | Infra | 加载优化后 SKILL-core.md 作为 CLAWDBOT 系统提示词 | T-014, T-032 | 待办 | 替代原始完整 SKILL.md |
| T-034 | P3 | Test | 单工具功能测试：逐一验证 6 个 MCP Tools 的输入输出 | T-032 | 待办 | 参见执行计划测试矩阵 |
| T-035 | P3 | Test | 组合工具测试：验证多工具联合调用场景 | T-034 | 待办 | "分析 ETH 交易机会"等场景 |
| T-036 | P3 | Test | 端到端测试：完整启动全部服务 + CLAWDBOT 对话测试 | T-034 | 待办 | 记录响应时间和 Token 消耗 |
| T-037 | P3 | Test | 异常场景测试：后端服务不可用时的降级行为 | T-034 | 待办 | 确保不崩溃，给出友好提示 |

---

## Phase 4: 多模式支持

| ID | 优先级 | 类别 | 任务描述 | 依赖 | 状态 | 备注 |
|----|--------|------|----------|------|------|------|
| T-038 | P3 | Feature | 告警模式：signal-service WebSocket 事件推送到 MCP Gateway | T-020, T-036 | 待办 | 信号触发 → AI 解读 → 推送 |
| T-039 | P3 | Feature | 告警模式：CLAWDBOT 自动分析信号并生成操作建议 | T-038 | 待办 | 含风险提示 |
| T-040 | P3 | Feature | 复盘模式：新增 MCP Tool `get_trade_history` | T-036 | 待办 | 获取交易历史记录 |
| T-041 | P3 | Feature | 复盘模式：新增 MCP Tool `get_trade_stats` | T-040 | 待办 | 交易统计（胜率/盈亏比等） |
| T-042 | P3 | Feature | 复盘模式：结构化复盘报告生成 | T-041 | 待办 | 入场/出场/规则符合度/改进建议 |
| T-043 | P3 | Feature | 学习模式：知识检索 + 教学内容生成 | T-029, T-036 | 待办 | 结合 53 课内容和 Vault 笔记 |
| T-044 | P3 | Feature | 学习模式：学习进度追踪机制 | T-043 | 待办 | 记录已学概念/常犯错误 |

---

## Phase 5: 稳定化与文档

| ID | 优先级 | 类别 | 任务描述 | 依赖 | 状态 | 备注 |
|----|--------|------|----------|------|------|------|
| T-045 | P4 | Optimization | MCP 工具响应缓存：市场数据 30s TTL，策略数据 5min TTL | T-036 | 待办 | 减少后端请求压力 |
| T-046 | P4 | Optimization | Token 成本监控与优化：追踪单次对话 Token 消耗 | T-036 | 待办 | 目标单次对话 < 10K tokens |
| T-047 | P4 | Optimization | 向量搜索质量调优：评估搜索结果相关性，优化分块策略 | T-029 | 待办 | 收集用户反馈作为评估指标 |
| T-048 | P4 | Infra | 服务监控：日志收集 + 可用性告警 | T-031 | 待办 | 目标可用率 > 99% |
| T-049 | P4 | Doc | 编写 MCP Gateway 开发者文档 | T-031 | 待办 | API 规范 + 部署流程 + 故障排查 |
| T-050 | P4 | Doc | 编写 CLAWDBOT 使用手册：各模式操作指南 | T-036 | 待办 | 面向最终用户 |

---

## 任务统计

### 按优先级

| 优先级 | 数量 | 已完成 | 进行中 | 待办 | 已阻塞 |
|--------|------|--------|--------|------|--------|
| P0 | 5 | 1 | 0 | 4 | 0 |
| P1 | 10 | 0 | 0 | 10 | 0 |
| P2 | 16 | 0 | 0 | 16 | 0 |
| P3 | 13 | 0 | 0 | 13 | 0 |
| P4 | 6 | 0 | 0 | 6 | 0 |
| **合计** | **50** | **1** | **0** | **49** | **0** |

### 按类别

| 类别 | 数量 | 说明 |
|------|------|------|
| BugFix | 3 | 现有系统问题修复 |
| Optimization | 10 | SKILL 拆分与性能优化 |
| Feature | 19 | 核心功能开发 |
| Infra | 9 | 基础设施与部署 |
| Test | 4 | 测试验证 |
| Doc | 3 | 文档编写 |

### 关键依赖链

```
T-001 (根目录清理) ─✅→ T-016 (MCP 项目初始化)
                          │
                          ├→ T-018/T-019/T-020 (Connectors)
                          │       │
                          │       ├→ T-021~T-025 (MCP Tools)
                          │       │       │
                          │       │       └→ T-030 (健康检查)
                          │       │               │
                          │       │               └→ T-032 (注册 MCP Server)
                          │       │                       │
                          │       │                       └→ T-034~T-037 (测试)
                          │       │                               │
                          │       │                               └→ T-038~T-044 (多模式)
                          │       │
                          └→ T-026 → T-027 → T-028 → T-029 (向量索引链)

T-006 (SKILL 分析) → T-007~T-012 (拆分) → T-013 (去重) → T-014 (验证)
                                                                │
                                                                └→ T-033 (加载系统提示词)
```

---

## 下一步行动

**立即可以开始的任务**（无依赖）:

1. **T-002**: 修复 strategies/page.tsx 策略字段
2. **T-004**: 清理 .gitignore
3. **T-005**: 验证 API 响应结构
4. **T-006**: 分析 SKILL.md 拆分边界

建议按照 P0 → P1 → P2 顺序推进，优先解决阻塞性问题。

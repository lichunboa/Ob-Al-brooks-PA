# Plugin Smart Optimization Skill

> **目标**: 使用 MCP 工具生态安全、渐进式地优化和重构 Obsidian 插件代码  
> **版本**: v1.0.0  
> **创建**: 2026-01-07  
> **维护**: 持续更新

---

## 核心理念

**不依赖外部自动化工具,充分利用智能工具生态:**

- 🧠 **智能分析** - 理解业务逻辑,不只是表面分析
- 🛡️ **安全优先** - 每一步都可回滚,绝不破坏现有功能
- 📈 **渐进式** - 小步快跑,持续改进
- 💾 **经验积累** - 记录每次优化,越用越聪明

---

## 工具生态

| 工具 | 用途 | 使用场景 |
|------|------|----------|
| **sequential-thinking** | 深度分析和推理 | 分析复杂问题、评估风险、设计方案 |
| **serena** | 代码语义理解 | 分析代码结构、识别重复模式、理解依赖关系 |
| **context7** | 最佳实践查询 | 查询官方文档、框架最佳实践、版本特定实现 |
| **morphllm** | 模式化重构 | 批量代码转换、统一代码风格、自动化重构 |
| **neo4j-memory** | 经验沉淀 | 记录优化决策、建立知识图谱、避免重复犯错 |

---

## 标准优化流程

### 6步循环

```
1. 思考 (sequential-thinking)
   ↓ 分析问题、评估风险、设计方案
   
2. 分析 (serena)
   ↓ 理解代码结构、识别重复模式
   
3. 查询 (context7)
   ↓ 查询最佳实践、确认实现方式
   
4. 创建安全点
   ↓ git checkout -b backup-$(date)
   
5. 重构 (morphllm)
   ↓ 批量代码转换、保持一致性
   
6. 验证 → 记录 (neo4j-memory)
   ↓ 构建测试 + 功能测试 + 经验沉淀
```

---

## 常见优化场景

### 场景 1: 提取纯函数 (风险: 🟢 低)

**适用**: 组件中有大量计算逻辑

**步骤**:
1. 使用 serena 识别纯函数
2. 使用 sequential-thinking 评估提取风险
3. 创建 `src/utils/` 目录
4. 使用 morphllm 批量提取
5. 验证功能
6. 记录到 neo4j-memory

**示例**:
```typescript
// 提取前: Dashboard.tsx
const winRate = trades.filter(t => t.outcome === 'win').length / trades.length;

// 提取后: src/utils/trade-calculations.ts
export function calculateWinRate(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  return trades.filter(t => t.outcome === 'win').length / trades.length;
}
```

---

### 场景 2: 提取自定义 Hooks (风险: 🟡 中)

**适用**: 组件中有复杂的状态管理和副作用

**步骤**:
1. 使用 context7 查询 React Hooks 最佳实践
2. 使用 sequential-thinking 设计 Hook 接口
3. 创建 `src/hooks/` 目录
4. 逐个提取数据加载逻辑
5. 每个 Hook 独立测试
6. 记录到 neo4j-memory

---

### 场景 3: 拆分大型组件 (风险: 🔴 高)

**适用**: 组件超过 1000 行

**步骤**:
1. 使用 serena 分析组件边界
2. 使用 sequential-thinking 设计拆分方案
3. 使用 context7 查询组件拆分最佳实践
4. 创建子组件目录
5. 逐个拆分,每次拆分后立即测试
6. 记录到 neo4j-memory

**注意**:
- ⚠️ 每次只拆分一个子组件
- ⚠️ 保持 Props 接口清晰
- ⚠️ 避免过度拆分

---

### 场景 4: 移除重复代码 (风险: 🟡 中)

**适用**: 发现多处相同或相似的代码

**步骤**:
1. 使用 serena 识别重复代码模式
2. 使用 sequential-thinking 评估合并风险
3. 提取为公共函数或组件
4. 使用 morphllm 批量替换
5. 验证所有使用场景
6. 记录到 neo4j-memory

---

## 风险控制清单

### 优化前
- [ ] 已创建 LTS 标签
- [ ] 已创建备份分支
- [ ] 已使用 sequential-thinking 评估风险
- [ ] 已使用 serena 分析影响范围
- [ ] 已查询相关最佳实践

### 优化中
- [ ] 每次修改后立即构建测试
- [ ] 保持小步快跑
- [ ] 遇到问题立即停止
- [ ] 记录每一步的变更

### 优化后
- [ ] 构建测试通过
- [ ] 功能测试通过
- [ ] 性能没有退化
- [ ] 已记录到 neo4j-memory
- [ ] 已更新文档

---

## 验证门禁

```bash
# 1. 构建测试
npm run build

# 2. 类型检查
npm run type-check

# 3. 代码规范检查
npm run lint
```

**手动测试清单**:
- [ ] Trading Hub 显示正常
- [ ] Analytics 图表正常
- [ ] Learn 推荐正常
- [ ] Manage 功能正常
- [ ] 创建交易笔记正常
- [ ] 数据统计正确

---

## Skill 自升级协议

每次完成优化任务后:

1. **追加经验到 `memory/optimization_lessons.md`**
   - 优化内容
   - 风险评估
   - 结果和教训

2. **更新 `references/optimization_patterns.md`**
   - 成功的优化模式
   - 失败的尝试
   - 最佳实践

3. **更新 `references/changelog.md`**
   - 记录版本变更
   - 记录重要决策

---

## 资源

- `memory/optimization_lessons.md`: 优化经验库(必读/必写)
- `references/optimization_patterns.md`: 优化模式库
- `references/gotchas.md`: 常见陷阱
- `references/changelog.md`: 变更记录
- `references/checklists.md`: 检查清单

---

**最后更新**: 2026-01-07  
**状态**: 活跃使用中 🟢

# 📋 Phase 1, Week 2 实施计划

> **时间**: 2026-01-12 ~ 2026-01-16 (5个工作日)  
> **目标**: 完善 ActionService 功能,添加批量操作和安全机制  
> **前置条件**: Week 1 核心功能已完成并测试通过

---

## 🎯 Week 2 目标

### 核心目标

1. **批量更新能力**: 支持一次更新多个交易笔记
2. **操作历史**: 记录所有修改操作,便于审计和调试
3. **撤销功能**: 支持撤销最近的操作
4. **Schema 扩展**: 添加缺失的字段定义

### 用户价值

- ✅ 批量修正历史数据 (100个文件 < 1分钟)
- ✅ 操作可追溯,可审计
- ✅ 支持撤销,降低误操作风险
- ✅ 更完整的数据验证

---

## 📅 Day 6-7: 批量更新功能

### 任务 6.1: 扩展类型定义

**新增类型** (`src/core/action/types.ts`):

```typescript
/**
 * 批量操作结果
 */
export interface BatchActionResult {
    total: number;           // 总数
    succeeded: number;       // 成功数
    failed: number;          // 失败数
    results: ActionResult[]; // 详细结果
    duration: number;        // 执行时间(ms)
}

/**
 * 批量更新项
 */
export interface BatchUpdateItem {
    path: string;                    // 文件路径
    updates: Partial<TradeRecord>;   // 更新内容
}
```

**验证**: TypeScript 编译通过

---

### 任务 6.2: 实现 batchUpdateTrades()

**代码位置**: `src/core/action/action-service.ts`

**实现要点**:

1. **分批处理**: 每批 50 个,避免内存溢出
2. **并行执行**: 使用 `Promise.all()` 提高性能
3. **错误收集**: 收集所有错误,不中断执行
4. **进度通知**: 每批完成后触发进度事件

**参考实现**:

```typescript
async batchUpdateTrades(
    items: BatchUpdateItem[],
    options: ActionOptions = {}
): Promise<BatchActionResult> {
    const startTime = Date.now();
    const results: ActionResult[] = [];
    const chunkSize = 50;
    
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        
        // 并行处理一批
        const chunkResults = await Promise.all(
            chunk.map(item => 
                this.updateTrade(item.path, item.updates, options)
                    .catch(error => ({
                        success: false,
                        message: `批量更新失败: ${error.message}`,
                        errors: [{ 
                            field: 'batch', 
                            message: error.message 
                        }]
                    }))
            )
        );
        
        results.push(...chunkResults);
        
        // 进度通知 (可选)
        const progress = Math.min(100, 
            Math.round((i + chunk.length) / items.length * 100)
        );
        console.log(`批量更新进度: ${progress}%`);
    }
    
    const duration = Date.now() - startTime;
    
    return {
        total: items.length,
        succeeded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
        duration
    };
}
```

**验证步骤**:

1. 创建 10 个测试文件
2. 批量更新所有文件
3. 验证:
   - ✅ 所有文件都被更新
   - ✅ 返回正确的统计信息
   - ✅ 错误被正确收集
   - ✅ 性能可接受 (10个文件 < 1秒)

---

### 任务 6.3: 创建批量更新测试 UI

**代码位置**: `src/views/components/manage/BatchUpdateTestPanel.tsx`

**功能**:
- 输入框: 输入要更新的文件数量
- 按钮: "批量更新测试"
- 结果显示: 成功/失败统计,执行时间

**验证**: UI 正常显示,批量更新功能正常

---

## 📅 Day 8-9: 操作历史与撤销

### 任务 8.1: 设计 ChangeLog 系统

**新增类型** (`src/core/action/types.ts`):

```typescript
/**
 * 操作记录
 */
export interface ChangeLogEntry {
    id: string;              // 唯一ID
    timestamp: number;       // 时间戳
    operation: 'update' | 'batchUpdate'; // 操作类型
    files: string[];         // 影响的文件
    changes: {
        path: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
    }[];
    success: boolean;        // 是否成功
    canUndo: boolean;        // 是否可撤销
}

/**
 * 操作历史
 */
export interface ChangeLog {
    entries: ChangeLogEntry[];
    maxEntries: number;      // 最大保留数量
}
```

---

### 任务 8.2: 实现 ChangeLog 记录

**代码位置**: `src/core/action/change-log.ts`

**实现要点**:

1. **自动记录**: 每次操作自动记录
2. **限制数量**: 最多保留 100 条
3. **持久化**: 保存到本地存储 (可选)

**参考实现**:

```typescript
export class ChangeLogManager {
    private entries: ChangeLogEntry[] = [];
    private maxEntries = 100;
    
    /**
     * 记录操作
     */
    record(entry: Omit<ChangeLogEntry, 'id' | 'timestamp'>): string {
        const id = this.generateId();
        const fullEntry: ChangeLogEntry = {
            ...entry,
            id,
            timestamp: Date.now()
        };
        
        this.entries.unshift(fullEntry);
        
        // 限制数量
        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(0, this.maxEntries);
        }
        
        return id;
    }
    
    /**
     * 获取历史记录
     */
    getEntries(limit = 20): ChangeLogEntry[] {
        return this.entries.slice(0, limit);
    }
    
    /**
     * 查找记录
     */
    getEntry(id: string): ChangeLogEntry | undefined {
        return this.entries.find(e => e.id === id);
    }
    
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

---

### 任务 8.3: 集成 ChangeLog 到 ActionService

**修改**: `src/core/action/action-service.ts`

```typescript
export class ActionService {
    private changeLog: ChangeLogManager;
    
    constructor(app: App) {
        this.app = app;
        this.validator = new SchemaValidator();
        this.updater = new FrontmatterUpdater(app, this.validator);
        this.changeLog = new ChangeLogManager();
    }
    
    async updateTrade(
        path: string,
        updates: Partial<TradeRecord>,
        options: ActionOptions = {}
    ): Promise<ActionResult> {
        const result = await this.updateTradeInternal(path, updates, options);
        
        // 记录操作
        if (result.success && !options.dryRun) {
            this.changeLog.record({
                operation: 'update',
                files: [path],
                changes: [{
                    path,
                    before: result.changes?.before || {},
                    after: result.changes?.after || {}
                }],
                success: true,
                canUndo: true
            });
        }
        
        return result;
    }
}
```

**验证**: 操作后可以查看历史记录

---

### 任务 8.4: 实现撤销功能

**新增方法** (`src/core/action/action-service.ts`):

```typescript
/**
 * 撤销操作
 */
async undo(entryId: string): Promise<ActionResult> {
    const entry = this.changeLog.getEntry(entryId);
    
    if (!entry) {
        return {
            success: false,
            message: '未找到操作记录'
        };
    }
    
    if (!entry.canUndo) {
        return {
            success: false,
            message: '该操作不支持撤销'
        };
    }
    
    // 恢复所有文件到之前的状态
    const results: ActionResult[] = [];
    
    for (const change of entry.changes) {
        const result = await this.restoreFile(
            change.path, 
            change.before
        );
        results.push(result);
    }
    
    const allSuccess = results.every(r => r.success);
    
    return {
        success: allSuccess,
        message: allSuccess ? '撤销成功' : '部分撤销失败',
        errors: results
            .filter(r => !r.success)
            .flatMap(r => r.errors || [])
    };
}

/**
 * 恢复文件到指定状态
 */
private async restoreFile(
    path: string,
    frontmatter: Record<string, unknown>
): Promise<ActionResult> {
    // 实现类似 updateTrade,但直接使用提供的 frontmatter
    // ...
}
```

**验证**: 
1. 执行更新
2. 执行撤销
3. 确认文件恢复到原始状态

---

## 📅 Day 10: Schema 扩展

### 任务 10.1: 添加缺失字段

**修改**: `src/core/action/schema-validator.ts`

**新增字段**:

```typescript
export const TRADE_SCHEMA: RecordSchema = {
    // ... 现有字段 ...
    
    // 新增字段
    entryPrice: {
        type: "number",
        required: false,
        canonicalName: "入场/entry_price",
        aliases: ["entry_price", "entry", "入场", "入场价"]
    },
    stopLoss: {
        type: "number",
        required: false,
        canonicalName: "止损/stop_loss",
        aliases: ["stop_loss", "stop", "止损", "止损价"]
    },
    takeProfit: {
        type: "number",
        required: false,
        canonicalName: "目标位/take_profit",
        aliases: ["take_profit", "target", "目标位", "目标价"]
    },
    initialRisk: {
        type: "number",
        required: false,
        canonicalName: "初始风险/initial_risk",
        aliases: ["initial_risk", "risk", "初始风险", "风险"]
    },
    alwaysIn: {
        type: "string",
        required: false,
        canonicalName: "总是方向/always_in",
        aliases: ["always_in", "总是方向", "AI方向"]
    },
    dayType: {
        type: "string",
        required: false,
        canonicalName: "日内类型/day_type",
        aliases: ["day_type", "日内类型", "日类型"]
    },
    probability: {
        type: "string",
        required: false,
        canonicalName: "概率/probability",
        aliases: ["probability", "prob", "概率"]
    },
    confidence: {
        type: "string",
        required: false,
        canonicalName: "信心/confidence",
        aliases: ["confidence", "信心", "信心度"]
    },
    orderType: {
        type: "string",
        required: false,
        canonicalName: "订单类型/order_type",
        aliases: ["order_type", "订单类型", "订单"]
    }
};
```

**验证**: 
1. TypeScript 编译通过
2. 新字段可以被验证
3. 新字段可以被规范化

---

### 任务 10.2: 完整性测试

**测试用例**:

1. 创建包含所有字段的交易笔记
2. 更新各种字段组合
3. 验证所有字段都能正确处理

---

## ✅ Week 2 验收标准

### 功能完整性
- [ ] `batchUpdateTrades()` 功能正常
- [ ] 批量更新性能可接受 (100个文件 < 10秒)
- [ ] 操作历史记录正常
- [ ] 撤销功能正常
- [ ] Schema 扩展完成 (26个字段)

### 代码质量
- [ ] TypeScript 编译无错误
- [ ] 所有新功能都有测试
- [ ] 文档已更新

### 用户体验
- [ ] 批量更新 UI 友好
- [ ] 进度提示清晰
- [ ] 错误信息明确

---

## 📊 预期成果

### 数量指标
- **Schema 字段**: 17 → 26 (+9个)
- **核心方法**: 1 → 4 (+3个)
  - `updateTrade()`
  - `batchUpdateTrades()` (新)
  - `undo()` (新)
  - `getChangeLog()` (新)

### 性能指标
- **批量更新**: 100个文件 < 10秒
- **单个更新**: < 100ms
- **历史记录**: 最多保留 100 条

---

## 🚀 开始 Week 2

**第一步**: Day 6, 任务 6.1 - 扩展类型定义

准备好开始了吗?

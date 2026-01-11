# 📋 Phase 1: ActionService 详细任务列表

> **目标**: 建立安全的数据写入能力  
> **时间**: 3周 (21个工作日)  
> **分支**: `feature/phase-1-action-service`  
> **最后更新**: 2026-01-11

---

## 📖 使用说明

### 任务状态标记
- `[ ]` 未开始
- `[/]` 进行中
- `[x]` 已完成
- `[!]` 有问题，需要修复

### 验证规则
- ✅ 每个任务完成后**必须**执行验证步骤
- ✅ 验证通过后才能标记为`[x]`
- ✅ 验证失败立即标记为`[!]`，记录问题

### 反馈修改规则
1. **发现问题**: 立即标记`[!]`，在任务下方记录问题
2. **修复问题**: 创建子任务，修复后重新验证
3. **验证通过**: 标记`[x]`，继续下一任务

---

## 🗓️ Week 1: 核心功能 + 快速验证 (Day 1-5)

### Day 1: 项目准备与类型定义

#### 任务 1.1: 创建核心文件结构 ✅
- [x] 创建 `src/core/action/` 目录
- [x] 创建 `src/core/action/types.ts`
- [x] 创建 `src/core/action/action-service.ts`
- [x] 创建 `src/core/action/schema-validator.ts`
- [x] 创建 `src/core/action/frontmatter-updater.ts`

**验证步骤**:
```bash
# 1. 检查文件是否创建
ls -la src/core/action/

# 2. 检查TypeScript编译
npm run type-check

# 预期结果: 无编译错误
```

**验证结果**: ✅ 已通过
- 所有文件创建成功
- TypeScript编译通过
- 提交: 3f32760

**反馈修改规则**:
- 如果文件路径错误 → 移动到正确位置
- 如果编译错误 → 修复类型定义

---

#### 任务 1.2: 定义核心类型 ✅
- [x] 定义 `ActionResult` 接口
- [x] 定义 `ActionOptions` 接口
- [x] 定义 `ValidationError` 接口
- [x] 定义 `FieldSchema` 接口
- [x] 定义 `RecordSchema` 类型

**代码位置**: `src/core/action/types.ts`

**参考设计**:
```typescript
export interface ActionResult {
  success: boolean;
  message: string;
  changes?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  errors?: ValidationError[];
}

export interface ActionOptions {
  dryRun?: boolean;
  validate?: boolean;
  recordHistory?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface FieldSchema {
  type: "string" | "number" | "enum" | "array" | "date";
  required?: boolean;
  enum?: string[];
  min?: number;
  max?: number;
  pattern?: RegExp;
  aliases?: string[];
  canonicalName: string;
}

export type RecordSchema = Record<string, FieldSchema>;
```

**验证步骤**:
```bash
# 1. TypeScript编译
npm run type-check

# 2. 检查类型导出
# 在另一个文件中尝试导入
import type { ActionResult } from './core/action/types';

# 预期结果: 无编译错误，类型可正常导入
```

**验证结果**: ✅ 已通过
- 所有类型定义完整
- 创建类型测试文件验证
- TypeScript编译通过
- 提交: 3f32760

**反馈修改规则**:
- 如果类型定义不完整 → 补充缺失字段
- 如果类型冲突 → 调整类型定义
- 如果导入失败 → 检查export语句

---

### Day 2: SchemaValidator 核心实现

#### 任务 2.1: 定义核心字段Schema ✅
- [x] 定义交易笔记核心Schema (TRADE_SCHEMA)
- [x] 包含必填字段: date, pnl, outcome, accountType
- [x] 包含可选字段: ticker, marketCycle, setupKey等

**代码位置**: `src/core/action/schema-validator.ts`

**参考设计**:
```typescript
export const TRADE_SCHEMA: RecordSchema = {
  date: {
    type: "date",
    required: true,
    canonicalName: "日期/date",
    aliases: ["date", "日期", "交易日期"]
  },
  pnl: {
    type: "number",
    required: true,
    canonicalName: "盈亏/net_profit",
    aliases: ["pnl", "net_profit", "r", "盈亏"]
  },
  outcome: {
    type: "enum",
    required: true,
    enum: ["win", "loss", "scratch", "open"],
    canonicalName: "结果/outcome",
    aliases: ["outcome", "结果"]
  },
  accountType: {
    type: "enum",
    required: true,
    enum: ["Live", "Demo", "Backtest"],
    canonicalName: "账户类型/account_type",
    aliases: ["accountType", "account_type", "账户类型"]
  },
  // ... 其他字段
};
```

**验证步骤**:
```typescript
// 1. 创建测试文件 src/core/action/__tests__/schema-validator.test.ts
// 2. 测试Schema定义
describe('TRADE_SCHEMA', () => {
  it('应该包含所有核心字段', () => {
    expect(TRADE_SCHEMA.date).toBeDefined();
    expect(TRADE_SCHEMA.pnl).toBeDefined();
    expect(TRADE_SCHEMA.outcome).toBeDefined();
    expect(TRADE_SCHEMA.accountType).toBeDefined();
  });
  
  it('核心字段应该是必填的', () => {
    expect(TRADE_SCHEMA.date.required).toBe(true);
    expect(TRADE_SCHEMA.pnl.required).toBe(true);
  });
});

// 3. 运行测试
npm run test
```

**验证结果**: ✅ 已通过
- 17个字段全部定义 (4个必填 + 13个可选)
- 所有字段包含规范名称和别名
- getFieldSchema支持别名查找
- 提交: a532e8c

**反馈修改规则**:
- 如果字段定义不完整 → 补充字段
- 如果别名不正确 → 参考Templates更新
- 如果测试失败 → 修复Schema定义

---

#### 任务 2.2: 实现字段验证逻辑 ✅
- [x] 实现 `validateField()` 方法
- [x] 实现类型验证 (string, number, enum, array, date)
- [x] 实现必填验证
- [x] 实现枚举值验证

**代码位置**: `src/core/action/schema-validator.ts`

**参考设计**:
```typescript
export class SchemaValidator {
  validateField(
    fieldName: string,
    value: unknown,
    schema: FieldSchema
  ): ValidationError | null {
    // 1. 必填验证
    if (schema.required && (value === undefined || value === null)) {
      return {
        field: fieldName,
        message: `字段 ${fieldName} 是必填的`,
        value
      };
    }
    
    // 2. 类型验证
    if (value !== undefined && value !== null) {
      switch (schema.type) {
        case "string":
          if (typeof value !== "string") {
            return {
              field: fieldName,
              message: `字段 ${fieldName} 必须是字符串`,
              value
            };
          }
          break;
        case "number":
          if (typeof value !== "number" || !Number.isFinite(value)) {
            return {
              field: fieldName,
              message: `字段 ${fieldName} 必须是有效数字`,
              value
            };
          }
          break;
        case "enum":
          if (!schema.enum?.includes(String(value))) {
            return {
              field: fieldName,
              message: `字段 ${fieldName} 必须是以下值之一: ${schema.enum?.join(', ')}`,
              value
            };
          }
          break;
        // ... 其他类型
      }
    }
    
    return null;
  }
}
```

**验证步骤**:
```typescript
// 测试用例
describe('SchemaValidator.validateField', () => {
  const validator = new SchemaValidator();
  
  it('应该验证必填字段', () => {
    const schema: FieldSchema = {
      type: "string",
      required: true,
      canonicalName: "test"
    };
    
    const error = validator.validateField("test", undefined, schema);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('必填');
  });
  
  it('应该验证字符串类型', () => {
    const schema: FieldSchema = {
      type: "string",
      canonicalName: "test"
    };
    
    const error = validator.validateField("test", 123, schema);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('字符串');
  });
  
  it('应该验证枚举值', () => {
    const schema: FieldSchema = {
      type: "enum",
      enum: ["win", "loss"],
      canonicalName: "outcome"
    };
    
    const error = validator.validateField("outcome", "invalid", schema);
    expect(error).not.toBeNull();
  });
});

// 运行测试
npm run test
```

**验证结果**: ✅ 已通过
- 完整的字段验证逻辑
- 支持5种类型验证 (string, number, enum, array, date)
- 数字范围验证 (min, max)
- 字符串正则验证 (pattern)
- 清晰的错误消息
- 提交: cc022cf

**反馈修改规则**:
- 如果验证逻辑不正确 → 修复验证代码
- 如果测试失败 → 检查边界情况
- 如果错误信息不清晰 → 改进错误提示

---

#### 任务 2.3: 实现记录验证逻辑 ✅
- [x] 实现 `validateRecord()` 方法
- [x] 验证所有字段
- [x] 收集所有错误
- [x] 返回验证结果

**代码位置**: `src/core/action/schema-validator.ts`

**参考设计**:
```typescript
export class SchemaValidator {
  validateRecord(
    record: Partial<TradeRecord>,
    schema: RecordSchema
  ): { valid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    
    // 验证所有Schema中定义的字段
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const value = record[fieldName as keyof TradeRecord];
      const error = this.validateField(fieldName, value, fieldSchema);
      if (error) {
        errors.push(error);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  getFieldSchema(fieldName: string): FieldSchema | undefined {
    return TRADE_SCHEMA[fieldName];
  }
}
```

**验证步骤**:
```typescript
// 测试用例
describe('SchemaValidator.validateRecord', () => {
  const validator = new SchemaValidator();
  
  it('应该验证完整记录', () => {
    const record = {
      date: "2024-01-01",
      pnl: 2.5,
      outcome: "win",
      accountType: "Live"
    };
    
    const result = validator.validateRecord(record, TRADE_SCHEMA);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  it('应该收集所有错误', () => {
    const record = {
      // 缺少必填字段
      pnl: "invalid", // 类型错误
      outcome: "invalid_value" // 枚举错误
    };
    
    const result = validator.validateRecord(record, TRADE_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// 运行测试
npm run test
```

**验证结果**: ✅ 已通过
- 完整的记录验证逻辑
- 遍历所有Schema字段
- 收集所有验证错误
- 提交: 20d58ad

**Day 2 总结**: SchemaValidator完整实现完成
- ✅ TRADE_SCHEMA (17个字段)
- ✅ validateField() (5种类型)
- ✅ validateRecord() (整体验证)
- ✅ getFieldSchema() (别名查找)

**反馈修改规则**:
- 如果遗漏字段验证 → 补充验证逻辑
- 如果错误收集不完整 → 修复收集逻辑
- 如果测试失败 → 检查验证流程

---

### Day 3: FrontmatterUpdater 实现

#### 任务 3.1: 实现Frontmatter解析 ✅
- [x] 实现 `parseFrontmatter()` 方法
- [x] 解析YAML frontmatter
- [x] 分离frontmatter和body
- [x] 处理边界情况 (无frontmatter、格式错误等)

**代码位置**: `src/core/action/frontmatter-updater.ts`

**参考设计**:
```typescript
export class FrontmatterUpdater {
  private app: App;
  
  constructor(app: App) {
    this.app = app;
  }
  
  parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    // 1. 检查是否有frontmatter
    if (!content.startsWith('---\n')) {
      return { frontmatter: {}, body: content };
    }
    
    // 2. 找到结束标记
    const endIndex = content.indexOf('\n---\n', 4);
    if (endIndex === -1) {
      return { frontmatter: {}, body: content };
    }
    
    // 3. 提取frontmatter部分
    const fmText = content.substring(4, endIndex);
    const body = content.substring(endIndex + 5);
    
    // 4. 解析YAML (使用Obsidian的API或yaml库)
    try {
      const frontmatter = parseYaml(fmText) || {};
      return { frontmatter, body };
    } catch (e) {
      console.error('Failed to parse frontmatter:', e);
      return { frontmatter: {}, body: content };
    }
  }
}
```

**验证步骤**:
```typescript
// 测试用例
describe('FrontmatterUpdater.parseFrontmatter', () => {
  const updater = new FrontmatterUpdater(app);
  
  it('应该解析正常的frontmatter', () => {
    const content = `---
date: 2024-01-01
pnl: 2.5
---
# 交易笔记`;
    
    const result = updater.parseFrontmatter(content);
    expect(result.frontmatter.date).toBe('2024-01-01');
    expect(result.frontmatter.pnl).toBe(2.5);
    expect(result.body).toContain('# 交易笔记');
  });
  
  it('应该处理无frontmatter的情况', () => {
    const content = '# 普通笔记';
    const result = updater.parseFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });
});

// 手动验证
// 1. 创建测试笔记
// 2. 读取并解析
// 3. 检查解析结果
```

**验证结果**: ✅ 已通过
- 使用Obsidian parseYaml API
- 正确分离frontmatter和body
- 处理边界情况和错误
- 提交: 68bea96

**反馈修改规则**:
- 如果解析失败 → 检查YAML格式
- 如果边界情况未处理 → 添加错误处理
- 如果测试失败 → 修复解析逻辑

---

#### 任务 3.2: 实现Frontmatter序列化 ✅
- [x] 实现 `serializeFrontmatter()` 方法
- [x] 将对象序列化为YAML
- [x] 保持格式和注释
- [x] 组合frontmatter和body

**代码位置**: `src/core/action/frontmatter-updater.ts`

**参考设计**:
```typescript
export class FrontmatterUpdater {
  serializeFrontmatter(
    frontmatter: Record<string, unknown>,
    body: string
  ): string {
    // 1. 序列化frontmatter为YAML
    const fmText = stringifyYaml(frontmatter);
    
    // 2. 组合frontmatter和body
    return `---\n${fmText}---\n${body}`;
  }
}
```

**验证步骤**:
```typescript
// 测试用例
describe('FrontmatterUpdater.serializeFrontmatter', () => {
  const updater = new FrontmatterUpdater(app);
  
  it('应该序列化frontmatter', () => {
    const frontmatter = {
      date: '2024-01-01',
      pnl: 2.5,
      outcome: 'win'
    };
    const body = '# 交易笔记';
    
    const result = updater.serializeFrontmatter(frontmatter, body);
    expect(result).toContain('---');
    expect(result).toContain('date: 2024-01-01');
    expect(result).toContain('# 交易笔记');
  });
});

// 手动验证
// 1. 序列化测试数据
// 2. 检查格式是否正确
// 3. 尝试在Obsidian中打开
```

**验证结果**: ✅ 已通过
- 使用Obsidian stringifyYaml API
- 正确组合frontmatter和body
- 处理空frontmatter情况
- 提交: c0cd08a

**反馈修改规则**:
- 如果格式不正确 → 调整序列化逻辑
- 如果Obsidian无法识别 → 检查YAML格式
- 如果测试失败 → 修复序列化代码

---

#### 任务 3.3: 实现字段名规范化 ✅
- [x] 实现 `applyUpdates()` 方法
- [x] 使用规范名称更新字段
- [x] 删除旧的别名字段
- [x] 保留未定义的字段

**代码位置**: `src/core/action/frontmatter-updater.ts`

**参考设计**:
```typescript
export class FrontmatterUpdater {
  private validator: SchemaValidator;
  
  private applyUpdates(
    frontmatter: Record<string, unknown>,
    updates: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...frontmatter };
    
    for (const [key, value] of Object.entries(updates)) {
      const schema = this.validator.getFieldSchema(key);
      if (schema) {
        // 使用规范名称
        result[schema.canonicalName] = value;
        
        // 删除旧的别名 (避免重复)
        for (const alias of schema.aliases || []) {
          if (alias !== schema.canonicalName) {
            delete result[alias];
          }
        }
      } else {
        // 未定义的字段，保持原样
        result[key] = value;
      }
    }
    
    return result;
  }
}
```

**验证步骤**:
```typescript
// 测试用例
describe('FrontmatterUpdater.applyUpdates', () => {
  it('应该使用规范名称', () => {
    const frontmatter = {
      'pnl': 2.0,  // 旧别名
      'outcome': 'win'
    };
    const updates = {
      'pnl': 2.5  // 更新
    };
    
    const result = updater.applyUpdates(frontmatter, updates);
    expect(result['盈亏/net_profit']).toBe(2.5);
    expect(result['pnl']).toBeUndefined(); // 旧别名应该被删除
  });
  
  it('应该保留未定义的字段', () => {
    const frontmatter = {
      'custom_field': 'value'
    };
    const updates = {
      'pnl': 2.5
    };
    
    const result = updater.applyUpdates(frontmatter, updates);
    expect(result['custom_field']).toBe('value');
  });
});
```

**验证结果**: ✅ 已通过
- 使用规范名称更新字段
- 删除所有旧别名
- 保留未定义字段
- 集成SchemaValidator
- 提交: c0cd08a

**Day 3 总结**: FrontmatterUpdater完整实现完成
- ✅ parseFrontmatter() - YAML解析
- ✅ serializeFrontmatter() - YAML序列化  
- ✅ applyUpdates() - 字段规范化

**反馈修改规则**:
- 如果规范化不正确 → 检查Schema定义
- 如果旧别名未删除 → 修复删除逻辑
- 如果测试失败 → 检查更新逻辑

---

### Day 4: ActionService 核心实现

#### 任务 4.1: 实现updateTrade()方法
- [ ] 读取文件内容
- [ ] 解析Frontmatter
- [ ] 验证更新数据
- [ ] 应用更新
- [ ] 序列化并写入
- [ ] 返回结果

**代码位置**: `src/core/action/action-service.ts`

**参考设计**:
```typescript
export class ActionService {
  private app: App;
  private validator: SchemaValidator;
  private updater: FrontmatterUpdater;
  
  constructor(app: App) {
    this.app = app;
    this.validator = new SchemaValidator();
    this.updater = new FrontmatterUpdater(app, this.validator);
  }
  
  async updateTrade(
    path: string,
    updates: Partial<TradeRecord>,
    options: ActionOptions = {}
  ): Promise<ActionResult> {
    try {
      // 1. 获取文件
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        return {
          success: false,
          message: `文件不存在: ${path}`
        };
      }
      
      // 2. 读取内容
      const content = await this.app.vault.read(file);
      const { frontmatter, body } = this.updater.parseFrontmatter(content);
      
      // 3. 验证更新数据
      if (options.validate !== false) {
        const validation = this.validator.validateRecord(
          updates,
          TRADE_SCHEMA
        );
        if (!validation.valid) {
          return {
            success: false,
            message: '数据验证失败',
            errors: validation.errors
          };
        }
      }
      
      // 4. 应用更新
      const updated = this.updater.applyUpdates(frontmatter, updates);
      
      // 5. 序列化
      const newContent = this.updater.serializeFrontmatter(updated, body);
      
      // 6. 写入文件 (如果不是Dry Run)
      if (!options.dryRun) {
        await this.app.vault.modify(file, newContent);
      }
      
      // 7. 返回结果
      return {
        success: true,
        message: options.dryRun ? '预览成功' : '更新成功',
        changes: {
          before: frontmatter,
          after: updated
        }
      };
    } catch (e) {
      return {
        success: false,
        message: `更新失败: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
}
```

**验证步骤**:

**自动测试**:
```typescript
describe('ActionService.updateTrade', () => {
  it('应该成功更新交易', async () => {
    const result = await actionService.updateTrade(
      'test-trade.md',
      { pnl: 3.0 }
    );
    
    expect(result.success).toBe(true);
    expect(result.changes?.after['盈亏/net_profit']).toBe(3.0);
  });
  
  it('应该验证数据', async () => {
    const result = await actionService.updateTrade(
      'test-trade.md',
      { pnl: 'invalid' } // 类型错误
    );
    
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });
  
  it('Dry Run不应该修改文件', async () => {
    const result = await actionService.updateTrade(
      'test-trade.md',
      { pnl: 3.0 },
      { dryRun: true }
    );
    
    expect(result.success).toBe(true);
    // 验证文件内容未改变
  });
});
```

**手动验证**:
```markdown
## 验证步骤

1. **准备测试数据**
   - 创建测试交易笔记: `Daily/Trades/test-trade.md`
   - Frontmatter包含: date, pnl, outcome, accountType

2. **测试基本更新**
   ```typescript
   const result = await actionService.updateTrade(
     'Daily/Trades/test-trade.md',
     { pnl: 3.5 }
   );
   ```
   - ✅ 检查返回结果: `result.success === true`
   - ✅ 打开文件，检查pnl是否更新为3.5
   - ✅ 检查字段名是否为规范名称 `盈亏/net_profit`

3. **测试数据验证**
   ```typescript
   const result = await actionService.updateTrade(
     'Daily/Trades/test-trade.md',
     { pnl: 'invalid' }
   );
   ```
   - ✅ 检查返回结果: `result.success === false`
   - ✅ 检查错误信息: `result.errors` 包含验证错误
   - ✅ 文件内容未改变

4. **测试Dry Run**
   ```typescript
   const result = await actionService.updateTrade(
     'Daily/Trades/test-trade.md',
     { pnl: 4.0 },
     { dryRun: true }
   );
   ```
   - ✅ 检查返回结果: `result.success === true`
   - ✅ 检查changes: before和after都存在
   - ✅ 文件内容未改变

5. **测试字段规范化**
   ```typescript
   const result = await actionService.updateTrade(
     'Daily/Trades/test-trade.md',
     { pnl: 5.0, outcome: 'win' }
   );
   ```
   - ✅ 打开文件，检查字段名
   - ✅ 确认使用规范名称: `盈亏/net_profit`, `结果/outcome`
   - ✅ 确认旧别名已删除

## 验证通过标准
- [ ] 所有自动测试通过
- [ ] 所有手动验证步骤通过
- [ ] 无控制台错误
- [ ] 文件格式正确，Obsidian可正常打开

## 问题记录
如果验证失败，在此记录问题:
- 问题描述:
- 重现步骤:
- 预期结果:
- 实际结果:
```

**反馈修改规则**:
- 如果文件读写失败 → 检查文件权限和路径
- 如果验证不工作 → 检查validator集成
- 如果Dry Run仍修改文件 → 检查条件判断
- 如果测试失败 → 逐步调试，定位问题

---

### Day 5: 快速验证与集成测试

#### 任务 5.1: 创建简单测试UI
- [ ] 在ManageTab中添加测试按钮
- [ ] 创建测试对话框
- [ ] 显示测试结果

**代码位置**: `src/views/tabs/ManageTab.tsx`

**参考设计**:
```typescript
// 添加测试按钮
<Button onClick={handleTestActionService}>
  测试 ActionService
</Button>

// 测试处理函数
const handleTestActionService = async () => {
  const testPath = 'Daily/Trades/test-trade.md';
  const updates = { pnl: 3.5 };
  
  const result = await actionService.updateTrade(testPath, updates, {
    dryRun: true
  });
  
  // 显示结果
  new Notice(result.success ? '测试成功' : '测试失败');
  console.log('Test result:', result);
};
```

**验证步骤**:
```markdown
## 手动验证

1. **启动插件**
   ```bash
   npm run dev
   ```

2. **打开控制台**
   - 打开Obsidian
   - 打开交易员控制台
   - 切换到Manage Tab

3. **执行测试**
   - 点击"测试 ActionService"按钮
   - 观察Notice提示
   - 检查控制台输出

4. **验证结果**
   - ✅ Notice显示"测试成功"
   - ✅ 控制台输出包含changes对象
   - ✅ changes.before和changes.after都存在
   - ✅ 测试文件内容未改变 (Dry Run)

## 验证通过标准
- [ ] UI按钮正常显示
- [ ] 点击按钮无错误
- [ ] 测试结果正确显示
- [ ] Dry Run模式工作正常
```

**反馈修改规则**:
- 如果按钮不显示 → 检查组件渲染
- 如果点击报错 → 检查actionService初始化
- 如果结果不正确 → 检查测试数据和逻辑

---

#### 任务 5.2: 端到端测试
- [ ] 创建完整的测试流程
- [ ] 测试所有核心功能
- [ ] 记录测试结果

**验证步骤**:
```markdown
## 端到端测试清单

### 测试1: 基本更新流程
1. 创建测试交易笔记
2. 使用ActionService更新pnl
3. 验证文件内容
4. 验证字段名规范化

**预期结果**:
- ✅ 更新成功
- ✅ 字段名为规范名称
- ✅ 旧别名已删除

### 测试2: 数据验证
1. 尝试更新无效数据 (pnl: "invalid")
2. 检查返回结果

**预期结果**:
- ✅ 返回失败
- ✅ 包含验证错误
- ✅ 文件未修改

### 测试3: Dry Run模式
1. 使用Dry Run更新数据
2. 检查返回结果
3. 检查文件内容

**预期结果**:
- ✅ 返回成功
- ✅ 包含changes对象
- ✅ 文件未修改

### 测试4: 多字段更新
1. 同时更新多个字段
2. 验证所有字段

**预期结果**:
- ✅ 所有字段更新成功
- ✅ 所有字段名规范化

### 测试5: 边界情况
1. 更新不存在的文件
2. 更新无frontmatter的文件
3. 更新格式错误的文件

**预期结果**:
- ✅ 正确处理错误
- ✅ 返回清晰的错误信息

## 测试结果记录

| 测试 | 状态 | 问题 | 修复 |
|------|------|------|------|
| 测试1 | [ ] | | |
| 测试2 | [ ] | | |
| 测试3 | [ ] | | |
| 测试4 | [ ] | | |
| 测试5 | [ ] | | |

## Week 1 验收标准
- [ ] 所有自动测试通过
- [ ] 所有手动测试通过
- [ ] 端到端测试全部通过
- [ ] 代码无TypeScript错误
- [ ] 代码无ESLint错误
- [ ] 文档已更新

## Week 1 总结
完成日期: ____
遇到的问题:
解决方案:
下周计划:
```

---

## 🗓️ Week 2: 完善功能 (Day 6-10)

### Day 6: 批量更新功能

#### 任务 6.1: 实现batchUpdateTrades()
- [ ] 实现批量更新接口
- [ ] 并行处理优化
- [ ] 进度通知
- [ ] 错误收集

**代码位置**: `src/core/action/action-service.ts`

**参考设计**:
```typescript
async batchUpdateTrades(
  updates: Array<{ path: string; updates: Partial<TradeRecord> }>,
  options: ActionOptions = {}
): Promise<BatchActionResult> {
  const results: ActionResult[] = [];
  const chunkSize = 50;
  
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    
    // 并行处理一批
    const chunkResults = await Promise.all(
      chunk.map(u => this.updateTrade(u.path, u.updates, options))
    );
    
    results.push(...chunkResults);
    
    // 进度通知
    const progress = Math.min(100, Math.round((i + chunk.length) / updates.length * 100));
    // TODO: 触发进度事件
  }
  
  return {
    total: updates.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  };
}
```

**验证步骤**:
```markdown
## 批量更新测试

1. **准备测试数据**
   - 创建10个测试交易笔记

2. **测试批量更新**
   ```typescript
   const updates = [
     { path: 'trade1.md', updates: { pnl: 1.0 } },
     { path: 'trade2.md', updates: { pnl: 2.0 } },
     // ... 10个
   ];
   
   const result = await actionService.batchUpdateTrades(updates);
   ```

3. **验证结果**
   - ✅ 所有文件更新成功
   - ✅ result.succeeded === 10
   - ✅ result.failed === 0

4. **测试部分失败**
   - 包含一个不存在的文件
   - ✅ succeeded === 9
   - ✅ failed === 1
   - ✅ 成功的文件已更新
```

**反馈修改规则**:
- 如果性能差 → 调整chunkSize
- 如果部分失败影响其他 → 添加错误隔离
- 如果进度不准确 → 修复计算逻辑

---

### Day 7-8: 创建和删除功能

#### 任务 7.1: 实现createTrade()
- [ ] 基于模板创建文件
- [ ] 填充初始数据
- [ ] 验证数据
- [ ] 写入文件

**验证步骤**:
```markdown
## 创建交易测试

1. **测试创建**
   ```typescript
   const data = {
     date: '2024-01-15',
     pnl: 2.5,
     outcome: 'win',
     accountType: 'Live'
   };
   
   const result = await actionService.createTrade(data);
   ```

2. **验证结果**
   - ✅ 文件创建成功
   - ✅ 文件名正确
   - ✅ Frontmatter包含所有字段
   - ✅ 字段名为规范名称
```

#### 任务 7.2: 实现deleteTrade()
- [ ] 安全删除文件
- [ ] 确认提示
- [ ] 记录删除操作

**验证步骤**:
```markdown
## 删除交易测试

1. **测试删除**
   ```typescript
   const result = await actionService.deleteTrade('test-trade.md');
   ```

2. **验证结果**
   - ✅ 文件删除成功
   - ✅ 返回成功结果
```

---

### Day 9-10: 策略和模板管理

#### 任务 9.1: 扩展到策略管理
- [ ] 实现updateStrategy()
- [ ] 实现createStrategy()
- [ ] 实现deleteStrategy()

#### 任务 9.2: 扩展到模板管理
- [ ] 实现updateTemplate()

**验证步骤**: (类似交易管理)

---

## 🗓️ Week 3: 安全机制 (Day 11-15)

### Day 11-12: ChangeLog系统

#### 任务 11.1: 实现ChangeLog
- [ ] 定义ChangeLog接口
- [ ] 实现记录逻辑
- [ ] 实现存储逻辑
- [ ] 实现查询逻辑

**代码位置**: `src/core/action/change-log.ts`

**验证步骤**:
```markdown
## ChangeLog测试

1. **测试记录**
   - 执行一次更新
   - 检查日志是否记录

2. **测试查询**
   - 查询最近10条日志
   - 验证日志内容

3. **测试导出**
   - 导出日志为JSON
   - 验证格式正确
```

---

### Day 13-14: Undo功能

#### 任务 13.1: 实现Undo
- [ ] 基于ChangeLog回滚
- [ ] 验证回滚数据
- [ ] 执行回滚

**验证步骤**:
```markdown
## Undo测试

1. **测试回滚**
   - 更新一个字段
   - 执行Undo
   - 验证字段恢复

2. **测试多次Undo**
   - 执行3次更新
   - 执行3次Undo
   - 验证完全恢复
```

---

### Day 15: 集成测试与发布

#### 任务 15.1: 完整测试
- [ ] 执行所有测试用例
- [ ] 性能测试
- [ ] 压力测试

#### 任务 15.2: 文档更新
- [ ] 更新API文档
- [ ] 更新使用指南
- [ ] 更新CHANGELOG

#### 任务 15.3: 发布准备
- [ ] 代码审查
- [ ] 合并到main
- [ ] 创建tag: v2.1.0

---

## 📊 总体验收标准

### 功能完整性
- [ ] ActionService所有方法实现
- [ ] SchemaValidator工作正常
- [ ] FrontmatterUpdater工作正常
- [ ] ChangeLog系统完整
- [ ] Undo功能可用

### 代码质量
- [ ] 所有TypeScript类型正确
- [ ] 无ESLint错误
- [ ] 测试覆盖率 > 80%
- [ ] 所有测试通过

### 文档完整性
- [ ] API文档完整
- [ ] 使用指南清晰
- [ ] 示例代码可用

### 性能指标
- [ ] 单个更新 < 100ms
- [ ] 批量更新1000笔 < 10s
- [ ] UI不阻塞

---

**创建**: Antigravity Agent  
**版本**: v1.0.0  
**最后更新**: 2026-01-11

# Project Structure

## Directory Organization

本项目包含两类“结构”：
1) **Vault 内容结构**（你的笔记库现状：Dataview 旧系统、策略仓库、模板等）
2) **插件源码结构**（`al-brooks-console` 原生插件，未来可迁移为独立 APP 的可移植内核）

### Vault (Existing)
- `scripts/`：旧 DataviewJS 控制台脚本（`pa-core.js` + `pa-view-*.js`），迁移期保留作为对照基线。
- `Templates/`：字段/枚举/标签体系与预设（例如：`Templates/属性值预设.md`），也是 Inspector/Schema 的枚举来源。
- `策略仓库 (Strategy Repository)/`：策略卡片数据源，未来的“策略卡维护/治理”默认作用域。
- 其他目录（Daily/Notes/Tags/...）：内容数据源，插件以“只读解析”为主。

### Plugin Source (Target)
> 目标：把“业务内核”与“运行时平台（Obsidian/未来 APP）”解耦。

建议插件源码目录（示意）：
```
plugin-root/
├── src/
│   ├── core/                  # 业务内核（可移植，纯 TS）
│   │   ├── contracts.ts        # SSOT 类型契约（MUST）
│   │   ├── field-mapper.ts     # SSOT 字段归一/解析（MUST）
│   │   ├── stats.ts            # SSOT 统计口径/胜率（MUST）
│   │   ├── trade-index.ts      # SSOT 索引（MUST，依赖 ports）
│   │   ├── issues.ts           # Issue/FixPlan 模型（建议放 core）
│   │   └── fixplan.ts          # FixPlan 生成/合并规则（建议放 core）
│   ├── ports/                 # 平台接口（Storage/Events/Clock 等）
│   │   ├── storage.ts
│   │   ├── events.ts
│   │   └── settings.ts
│   ├── platforms/
│   │   └── obsidian/          # Obsidian 适配层（薄）
│   │       ├── obsidian-storage.ts
│   │       ├── obsidian-events.ts
│   │       └── open-file.ts
│   ├── ui/                    # React UI（ItemView 内渲染）
│   │   ├── views/
│   │   ├── components/
│   │   └── state/
│   ├── integrations/          # 外部插件适配器（可选，可降级）
│   │   └── *Adapter.ts
│   └── main.ts                # 插件入口（注册 view/commands/settings）
├── manifest.json
├── package.json
└── esbuild.config.*
```

> 注：具体文件名可按实现调整，但“core/ports/platforms 分层”与 SSOT 文件的唯一性必须保留。

## Naming Conventions

### Files
- TypeScript 文件：`kebab-case` 或 `camelCase` 均可，但同一层级保持一致。
- SSOT 文件固定命名：`contracts.ts / field-mapper.ts / stats.ts / trade-index.ts`。
- React 组件：`PascalCase.tsx`。

### Code
- Types/Interfaces/Classes：`PascalCase`
- Functions/Methods/Variables：`camelCase`
- Constants：`UPPER_SNAKE_CASE`

## Import Patterns

### Import Order
1. 外部依赖（obsidian/react）
2. 内部模块（`src/core/*`, `src/ports/*`）
3. 相对路径（同目录组件等）

### Module/Package Organization
- **核心原则：依赖只能向内**
  - `core/` 绝不能 import `obsidian`。
  - `platforms/obsidian/` 可以依赖 `core/` 和 `ports/`。
  - `ui/` 只通过 `core` 提供的 API 或 ports 注入的数据源交互，不直接做 vault 扫描。

## Code Structure Patterns

### Module/Class Organization
- 先导出类型与公共 API，再放实现细节；避免在 UI 里重复实现口径。

### Function/Method Organization
- 输入校验（类型/空值）→ 核心逻辑 → 明确的错误返回；避免抛出导致 UI 崩溃。

## Code Organization Principles

1. **Single Source of Truth (SSOT)**：TradeIndex/FieldMapper/Stats/Adapters 必须唯一实现。
2. **Read/Write Separation**：Inspector 只读扫描与 FixPlan 生成；Manager 负责预览/确认/执行写入。
3. **Event-Driven, Debounced**：所有索引更新走统一事件模型与去抖处理。
4. **Migration Safety**：迁移期不破坏现有 Dataview 体系。

## Module Boundaries

### “未来可变 APP”的 8 个后手（结构层落点）

**MUST（硬性红线）**
1. **Core 纯净化**：`src/core/**` 不得直接 import `obsidian` 或任何平台类型；只能通过 `src/ports/**` 接口注入。
2. **SSOT 合约稳定**：canonical fields / enums / winrate/account_type 口径只允许在 SSOT 文件中定义与实现。
3. **统一事件模型**：在 `ports/events.ts` 定义 `FileChange`/`IndexChange`，Obsidian 事件只做映射。
4. **可替换存储接口**：在 `ports/storage.ts` 定义 `list/read/write/getMetadata`；Obsidian 与未来 APP 各自实现。
5. **稳定导入/导出格式**：在 `core` 定义 JSON snapshot schema（版本号 + 向后兼容策略），作为迁移与回归基线。
6. **写入治理管线固定**：FixPlan → Preview → Confirm → Apply → Report →（session Undo）为唯一写入路径。

**SHOULD（强烈建议）**
7. **外部集成全可选**：`integrations/*Adapter.ts` 必须 feature-detection + 降级；不得让核心功能依赖它们存在。
8. **口径最小单测**：至少覆盖 FieldMapper/winrate/归一化/FixPlan 生成，确保换壳不漂移。

## Documentation Standards
- steering 文档用于约束长期架构红线（尤其是 SSOT 与 ports/platforms 分层）。
- 每个重要实现任务完成后必须写 Implementation Logs，便于多 AI 并行协作复用。

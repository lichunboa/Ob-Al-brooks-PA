# Technology Stack

## Project Type
- Obsidian 原生插件（桌面端 + 移动端），以 ItemView 作为主要 UI 入口。
- 目标是替代现有 DataviewJS 控制台的核心看板能力，并在迁移期与 Dataview 版并存对照。

## Core Technologies

### Primary Language(s)
- **Language**: TypeScript
- **Runtime/Compiler**: Node.js（用于构建）；运行时为 Obsidian（Electron / Mobile WebView）
- **Language-specific tools**: npm + TypeScript

### Key Dependencies/Libraries
- **Obsidian API**: 插件生命周期、vault/metadataCache 事件、打开文件、设置等。
- **React**: 控制台视图渲染（ItemView 内挂载 React root）。
- **esbuild**: 插件打包构建（输出符合 Obsidian 插件规范）。

> 注：MVP 期避免引入重型图表库；后续需要图表时优先轻量 SVG 或按需引入。

### Application Architecture
- 插件式、事件驱动：
  - `TradeIndex` 负责索引/解析/缓存/增量更新，并以 `changed` 事件通知 UI。
  - UI（Dashboard/后续模块）只订阅数据层，不自行扫描 vault，不自行定义统计口径。
- 单一信源（SSOT）原则：
  - 核心契约与口径只允许在指定 SSOT 文件中实现：`contracts / field-mapper / trade-index / stats`。

### Data Storage (if applicable)
- **Primary storage**: Obsidian vault 中的 Markdown 文件（frontmatter + 正文）。
- **Caching**: 插件内存缓存（TradeIndex 索引与聚合结果）；必要时可导出 JSON 快照用于回归/备份。
- **Data formats**: Markdown + YAML frontmatter；导出/调试使用 JSON。

### External Integrations (if applicable)
- **APIs**: 主要通过 Obsidian command 系统与外部插件交互（QuickAdd/SRS/Tasks/Metadata Menu 等）。
- **Protocols**: 本地调用（无网络协议依赖）。
- **Authentication**: 不适用。

### Monitoring & Dashboard Technologies (if applicable)
- **Dashboard Framework**: React（挂载在 Obsidian ItemView 内）。
- **Real-time Communication**: Obsidian vault/metadataCache 事件 + debounce/coalesce 的增量更新机制。
- **Visualization Libraries**: MVP 不引入；后续优先轻量实现。
- **State Management**: React state + TradeIndex 事件订阅（不引入 Redux 等重型方案）。

## Development Environment

### Build & Development Tools
- **Build System**: `npm` scripts + `esbuild`
- **Package Management**: `npm`
- **Development workflow**: 本地构建插件 bundle，复制/链接到 Obsidian 插件目录进行调试（或使用 dev build 输出到指定目录）。

### Code Quality Tools
- **Static Analysis**: TypeScript（类型约束）；（可选）ESLint
- **Formatting**: （可选）Prettier
- **Testing Framework**: MVP 可不配置；优先为 `FieldMapper`/`Stats` 增加轻量单元测试（如后续需要）。
- **Documentation**: Steering + Spec + Implementation Logs

### Version Control & Collaboration
- **VCS**: Git
- **Branching Strategy**: 简化为 trunk-based / feature branch（按你团队习惯即可）
- **Code Review Process**: 以 spec-workflow 审批 + Implementation Logs 作为并行协作的“共享记忆库”。

## Deployment & Distribution (if applicable)
- **Target Platform(s)**: Obsidian Desktop（macOS/Windows/Linux）+ Obsidian Mobile（iOS/Android）
- **Distribution Method**: 本地安装（vault 的 `.obsidian/plugins/`）；未来可打包发布。
- **Installation Requirements**: 用户需启用第三方插件；外部插件集成为可选。
- **Update Mechanism**: 手动更新插件文件；外部插件升级需通过 Adapter Pattern 兼容。

## Technical Requirements & Constraints

### Performance Requirements
- 避免频繁全库扫描；增量更新必须 debounce/coalesce。
- 移动端优先：索引与渲染在大 vault 下仍需保持可用。

### Compatibility Requirements  
- **Platform Support**: Obsidian Desktop + Mobile
- **Dependency Versions**: 与 Obsidian API 版本保持兼容（以 Obsidian 官方推荐的最低版本为基线）。
- **Standards Compliance**: 遵循 Obsidian 插件规范（manifest、main.js 等）。

### Security & Compliance
- 默认只读：未经确认不批量写入。
- 写入治理（Advanced）：必须预览 + 二次确认 + 失败隔离 + 会话内最小回滚。

### Scalability & Reliability
- 预期数据量：交易笔记与策略卡可能达到数千级；索引需要容错（单文件解析失败不影响整体）。

## Technical Decisions & Rationale

### Decision Log
1. **React + ItemView**：获得更一致的交互与可组合 UI，替代 DataviewJS 的限制。
2. **esbuild**：构建快、配置简单，适合 Obsidian 插件 bundle。
3. **SSOT（contracts/field-mapper/trade-index/stats）**：避免口径分叉，支持多 AI 并行实现。
4. **Adapter Pattern（命令优先）**：外部插件可升级、可缺失降级，不把控制台绑死在某个插件 API 上。
5. **写入治理分层（Inspector→FixPlan→Manager）**：保持读写分离，降低误改风险并提高可解释性。

## Known Limitations
- MVP 阶段不覆盖所有旧控制台模块；以对照优先逐步迁移。
- 高级写入治理需要更严格的 UX 约束（预览/回滚），会在 Advanced 阶段交付。

# Web 端适配计划

## 📊 当前状态分析

### 现有页面（来自 Sidebar.tsx）

#### Obsidian 组
- ✅ `/strategies` - 策略管理

#### 后端组
- ✅ `/` - 仪表板
- ✅ `/data-overview` - 数据总览
- ✅ `/chart` - K线图表
- ✅ `/scanner` - 市场扫描
- ✅ `/vpvr` - VPVR 分析
- ✅ `/backtest` - 回测分析

#### Agent 组
- ✅ `/signals` - 信号监控
- ✅ `/execution` - 交易总览
- ✅ `/execution/positions` - 持仓管理
- ✅ `/execution/risk` - 风控配置
- ✅ `/execution/ops` - 运维工具
- ✅ `/pa-bot` - PA Bot（新增）
- ✅ `/trades` - 交易记录

#### 其他
- ✅ `/settings` - 设置

---

## 🔄 最新系统架构变化

### 1. 交易所支持
**之前**: 只支持币安
**现在**:
- ✅ OKX Demo（主要）
- ✅ cTrader（外汇）
- ⏳ 币安 Demo（待修复）

### 2. 服务架构
**之前**: 单体架构
**现在**:
- `AB Patrol-Agent/` - 主交易系统
  - `runtime/pa_runtime.py` - 核心运行时
  - `services/execution-service/` - 执行服务（独立）
  - `runtime/utils/` - 工具模块（新增）

### 3. 数据存储
**新增**:
- `data/pa_trader/cycles/` - 循环数据（每次扫描）
- `data/pa_trader/journal/` - 日志（decision_log, execution_log）
- `data/pa_trader/state/` - 状态文件

### 4. 功能变化
**新增**:
- Telegram 推送优化（只在有信号时推送）
- 多交易所支持
- 模块化工具函数

**移除/废弃**:
- 旧的策略系统（已被 PA 系统替代）
- 部分回测功能（需要适配新架构）

---

## 🎯 需要适配的页面

### 高优先级（需要立即适配）

#### 1. `/pa-bot` - PA Bot 页面 ✅
**状态**: 已存在，需要验证数据源
**数据源**: `/api/pa-bot`
**需要检查**:
- API 是否连接到正确的数据文件
- 是否读取 `data/pa_trader/cycles/` 和 `journal/`

#### 2. `/execution` - 交易总览
**需要适配**:
- 显示当前交易所（OKX/cTrader/Binance）
- 显示 execution-service 状态
- 显示多交易所余额

#### 3. `/execution/positions` - 持仓管理
**需要适配**:
- 支持多交易所持仓查询
- 显示交易所来源

#### 4. `/execution/risk` - 风控配置
**需要适配**:
- 读取 `services/execution-service/config/.env`
- 显示当前风控参数：
  - MAX_DAILY_LOSS_USDT
  - MAX_POSITION_SIZE_USDT
  - MAX_LEVERAGE
  - EMERGENCY_STOP

#### 5. `/settings` - 设置页面
**需要新增**:
- 交易所配置切换（OKX/cTrader/Binance）
- Telegram 推送设置
- 数据路径配置

### 中优先级（可以逐步适配）

#### 6. `/scanner` - 市场扫描
**需要适配**:
- 显示当前扫描的交易对
- 显示扫描频率（每 3-4 分钟）
- 显示最近一次扫描结果

#### 7. `/backtest` - 回测分析
**需要适配**:
- 连接到新的回测工具 `backtest_tool.py`
- 显示回测结果

#### 8. `/chart` - K线图表
**需要适配**:
- 支持多交易所数据源
- 显示 PA 信号标记

### 低优先级（可以暂时关闭）

#### 9. `/strategies` - 策略管理
**建议**: 暂时关闭或标记为"维护中"
**原因**: PA 系统已经内置策略，不需要手动管理

#### 10. `/vpvr` - VPVR 分析
**建议**: 保留但标记为"实验性功能"
**原因**: 不是核心功能

#### 11. `/data-overview` - 数据总览
**建议**: 合并到主仪表板 `/`
**原因**: 功能重复

---

## 📝 具体适配任务

### 任务 1: 更新侧边栏导航
**文件**: `web/src/components/layout/Sidebar.tsx`

**修改**:
```typescript
const navGroups: NavGroup[] = [
  {
    title: '核心',
    items: [
      { href: '/', label: '仪表板', icon: LayoutDashboard },
      { href: '/pa-bot', label: 'PA 交易员', icon: Bot },
      { href: '/chart', label: 'K线图表', icon: CandlestickChart },
    ],
  },
  {
    title: '交易',
    items: [
      { href: '/execution', label: '交易总览', icon: Wallet },
      { href: '/execution/positions', label: '持仓管理', icon: TableProperties },
      { href: '/execution/risk', label: '风控配置', icon: Shield },
      { href: '/trades', label: '交易记录', icon: Receipt },
    ],
  },
  {
    title: '分析',
    items: [
      { href: '/scanner', label: '市场扫描', icon: Scan },
      { href: '/signals', label: '信号监控', icon: Bell },
      { href: '/backtest', label: '回测分析', icon: FlaskConical },
    ],
  },
  {
    title: '工具',
    items: [
      { href: '/execution/ops', label: '运维工具', icon: Wrench },
      { href: '/settings', label: '系统设置', icon: Settings },
    ],
  },
];
```

**移除**:
- `/strategies` - 策略管理（已废弃）
- `/data-overview` - 数据总览（合并到主页）
- `/vpvr` - VPVR 分析（移到实验性功能）

---

### 任务 2: 创建交易所状态组件
**新文件**: `web/src/components/execution/ExchangeStatus.tsx`

**功能**:
- 显示当前激活的交易所
- 显示各交易所余额
- 显示连接状态
- 支持切换交易所

---

### 任务 3: 更新 PA Bot API
**文件**: `web/src/app/api/pa-bot/route.ts`

**需要检查**:
- 是否正确读取 `AB Patrol-Agent/data/pa_trader/` 目录
- 是否解析 `cycles/*.json` 文件
- 是否读取 `journal/decision_log.jsonl` 和 `execution_log.jsonl`

---

### 任务 4: 创建风控配置页面
**文件**: `web/src/app/(dashboard)/execution/risk/page.tsx`

**功能**:
- 读取 `services/execution-service/config/.env`
- 显示当前风控参数
- 允许修改并保存
- 显示历史触发记录

---

### 任务 5: 更新主仪表板
**文件**: `web/src/app/(dashboard)/page.tsx`

**新增内容**:
- 交易所状态卡片
- PA Bot 运行状态
- 今日交易统计
- 最近信号列表
- 持仓概览

---

## 🚀 实施步骤

### 第一阶段：核心功能适配（1-2 天）
1. ✅ 验证 PA Bot 页面数据源
2. 更新侧边栏导航
3. 创建交易所状态组件
4. 更新主仪表板

### 第二阶段：交易功能适配（2-3 天）
1. 适配交易总览页面
2. 适配持仓管理页面
3. 创建风控配置页面
4. 更新交易记录页面

### 第三阶段：分析功能适配（2-3 天）
1. 适配市场扫描页面
2. 适配信号监控页面
3. 适配回测分析页面
4. 适配 K线图表页面

### 第四阶段：优化和清理（1-2 天）
1. 移除废弃页面
2. 优化性能
3. 添加错误处理
4. 完善文档

---

## 📋 待确认的问题

1. **策略管理页面** - 是否完全移除？还是保留作为历史记录？
2. **VPVR 分析** - 是否继续维护？还是标记为实验性？
3. **数据总览** - 是否合并到主仪表板？
4. **回测功能** - 是否需要重新设计以适配新的 `backtest_tool.py`？
5. **多交易所切换** - 是否需要在 Web 端支持实时切换？还是只显示状态？

---

## 🎨 UI/UX 改进建议

### 1. 交易所标识
- 为每个交易所添加独特的颜色标识
  - OKX: 蓝色
  - cTrader: 绿色
  - Binance: 黄色

### 2. 状态指示器
- 使用动画脉冲表示实时运行
- 使用颜色编码表示健康状态
  - 绿色: 正常
  - 黄色: 警告
  - 红色: 错误

### 3. 数据刷新
- 添加自动刷新功能（30秒）
- 添加手动刷新按钮
- 显示最后更新时间

### 4. 响应式设计
- 确保所有页面在移动端可用
- 优化表格在小屏幕上的显示

---

**创建日期**: 2026-03-10
**状态**: 待实施

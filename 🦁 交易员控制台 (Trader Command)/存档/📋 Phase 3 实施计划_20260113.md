# Phase 3 详细实施计划

> **项目**: Al Brooks Trader Console - Phase 3 交互功能  
> **策略**: 升级优于新增,复用现有模块  
> **预计耗时**: 10-13小时  
> **开始时间**: 2026-01-13

---

## 🎯 核心目标

基于Phase 2的成果,实现交易中心的核心交互功能:
1. ✅ 动态战前计划 (激活PlanWidget)
2. ✅ 结构化闪电笔记 (升级DailyActionsPanel)
3. ✅ 智能风控守门员 (增强ActionService)

**关键原则**: 0个新增组件,只升级现有模块

---

## 📋 任务分解

### Task 3.1: 激活PlanWidget交互 ⭐⭐⭐⭐⭐ ✅

**目标**: 让已有的交互接口工作起来

**完成状态**:
- ✅ PlanWidget已有完整接口
- ✅ UI已实现checkbox和编辑框
- ✅ 回调函数已实现
- ✅ props已传递
- ✅ 编译测试通过

**完成时间**: 2026-01-13  
**Git提交**: `543332c` - feat: Phase 3.1 - 激活PlanWidget交互功能

**实施步骤**:

#### Step 1: 在ActionService添加方法 (30分钟)

**文件**: `src/core/action/ActionService.ts`

```typescript
/**
 * 切换计划清单项的完成状态
 */
async togglePlanChecklistItem(
  notePath: string,
  itemIndex: number
): Promise<void> {
  const file = this.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) {
    throw new Error(`文件不存在: ${notePath}`);
  }

  const content = await this.vault.read(file);
  const { frontmatter, body } = this.parseFrontmatter(content);

  // 切换checkbox状态
  if (!frontmatter.checklist || !frontmatter.checklist[itemIndex]) {
    throw new Error(`清单项不存在: index ${itemIndex}`);
  }

  frontmatter.checklist[itemIndex].completed = 
    !frontmatter.checklist[itemIndex].completed;

  // 写回文件
  const newContent = this.serializeFrontmatter(frontmatter, body);
  await this.vault.modify(file, newContent);
}

/**
 * 更新计划的风险限制
 */
async updatePlanRiskLimit(
  notePath: string,
  riskLimit: number
): Promise<void> {
  const file = this.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) {
    throw new Error(`文件不存在: ${notePath}`);
  }

  const content = await this.vault.read(file);
  const { frontmatter, body } = this.parseFrontmatter(content);

  // 更新风险限制
  frontmatter.riskLimit = riskLimit;

  // 写回文件
  const newContent = this.serializeFrontmatter(frontmatter, body);
  await this.vault.modify(file, newContent);
}
```

**验收**:
- [x] 方法编译通过
- [x] 类型定义正确

---

#### Step 2: 在Dashboard实现回调 (45分钟)

**文件**: [src/views/Dashboard.tsx](file:///Users/mitchellcb/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Al-brooks-PA/.obsidian/plugins/al-brooks-console/src/views/Dashboard.tsx)

```typescript
// 在Dashboard类中添加方法

/**
 * 处理计划清单项切换
 */
private handleToggleChecklistItem = async (index: number): Promise<void> => {
  try {
    // 获取今日笔记路径
    const todayNote = this.getTodayNotePath();
    if (!todayNote) {
      new Notice('未找到今日笔记');
      return;
    }

    // 调用ActionService
    await this.actionService.togglePlanChecklistItem(todayNote, index);

    // 刷新数据
    await this.refreshTodayContext();
    
    new Notice('✅ 已更新');
  } catch (error) {
    console.error('切换清单项失败:', error);
    new Notice(`❌ 更新失败: ${error.message}`);
  }
};

/**
 * 处理风险限制更新
 */
private handleUpdateRiskLimit = async (riskLimit: number): Promise<void> => {
  try {
    const todayNote = this.getTodayNotePath();
    if (!todayNote) {
      new Notice('未找到今日笔记');
      return;
    }

    await this.actionService.updatePlanRiskLimit(todayNote, riskLimit);
    await this.refreshTodayContext();
    
    new Notice(`✅ 风险限制已更新为 ${riskLimit}R`);
  } catch (error) {
    console.error('更新风险限制失败:', error);
    new Notice(`❌ 更新失败: ${error.message}`);
  }
};

/**
 * 获取今日笔记路径
 */
private getTodayNotePath(): string | null {
  // 从todayContext获取
  if (this.state.todayContext?.dailyNotePath) {
    return this.state.todayContext.dailyNotePath;
  }
  
  // 或者根据日期构造
  const today = toLocalDateIso(new Date());
  return `Daily/${today}.md`;
}
```

**验收**:
- [x] 方法编译通过
- [x] 错误处理完善
- [x] Notice提示友好

---

#### Step 3: 传递props到TradingHubTab (15分钟)

**文件**: [src/views/Dashboard.tsx](file:///Users/mitchellcb/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Al-brooks-PA/.obsidian/plugins/al-brooks-console/src/views/Dashboard.tsx) (render方法)

```typescript
// 在render方法中
<TradingHubTab
  // ... 现有props
  onToggleChecklistItem={this.handleToggleChecklistItem}  // 新增
  onUpdateRiskLimit={this.handleUpdateRiskLimit}          // 新增
/>
```

**文件**: [src/views/tabs/TradingHubTab.tsx](file:///Users/mitchellcb/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Al-brooks-PA/.obsidian/plugins/al-brooks-console/src/views/tabs/TradingHubTab.tsx)

```typescript
// 更新Props接口
export interface TradingHubTabProps {
  // ... 现有props
  onToggleChecklistItem?: (index: number) => Promise<void>;  // 新增
  onUpdateRiskLimit?: (riskLimit: number) => Promise<void>;  // 新增
}

// 在组件中传递给PlanWidget
<PlanWidget
  plan={todayPlan}
  onGoToPlan={onGoToPlan}
  onToggleChecklistItem={props.onToggleChecklistItem}  // 新增
  onUpdateRiskLimit={props.onUpdateRiskLimit}          // 新增
/>
```

**验收**:
- [x] Props类型正确
- [x] 传递链路完整

---

#### Step 4: 测试验证 (30分钟)

**测试用例**:
1. 点击checkbox,状态切换
2. 编辑风险限制,保存成功
3. 刷新页面,状态保持
4. 错误情况处理

**验收标准**:
- [x] Checkbox可点击切换
- [x] 风险限制可编辑
- [x] 数据持久化
- [x] 错误提示友好
- [x] 无TypeScript错误
- [x] 构建成功

**预计时间**: 2小时  
**风险**: 低  
**优先级**: P0

---

### Task 3.2: 升级DailyActionsPanel ⭐⭐⭐⭐

**目标**: 添加快速情绪记录功能

**当前状态**:
- ✅ DailyActionsPanel已存在
- ✅ 显示每日行动建议
- ❌ 无快速记录功能

**实施步骤**:

#### Step 1: 查看现有实现 (15分钟)

```bash
cat src/views/components/trading/DailyActionsPanel.tsx
```

**分析**:
- 当前props
- 当前UI结构
- 可扩展位置

---

#### Step 2: 添加快捷按钮UI (45分钟)

**文件**: [src/views/components/trading/DailyActionsPanel.tsx](file:///Users/mitchellcb/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Al-brooks-PA/.obsidian/plugins/al-brooks-console/src/views/components/trading/DailyActionsPanel.tsx)

```typescript
export interface DailyActionsPanelProps {
  can: (feature: string) => boolean;
  MarkdownBlock: React.FC<{ markdown: string; sourcePath?: string }>;
  onQuickLog?: (type: string, note?: string) => Promise<void>;  // 新增
}

export const DailyActionsPanel: React.FC<DailyActionsPanelProps> = ({
  can,
  MarkdownBlock,
  onQuickLog,  // 新增
}) => {
  const [isLogging, setIsLogging] = React.useState(false);
  const [noteText, setNoteText] = React.useState('');

  const handleQuickLog = async (type: string) => {
    if (!onQuickLog || isLogging) return;
    
    setIsLogging(true);
    try {
      await onQuickLog(type, noteText);
      setNoteText(''); // 清空输入
    } catch (error) {
      console.error('快速记录失败:', error);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <GlassPanel style={{ marginBottom: '16px' }}>
      {/* 原有内容 */}
      <div style={{ fontWeight: 600, marginBottom: '8px' }}>
        每日行动
      </div>
      <MarkdownBlock markdown={content} />

      {/* 新增: 快速记录区 */}
      {onQuickLog && (
        <div style={{ 
          marginTop: '16px', 
          paddingTop: '16px',
          borderTop: `1px solid ${V5_COLORS.border}`
        }}>
          <div style={{ fontSize: '12px', marginBottom: '8px', opacity: 0.7 }}>
            快速记录情绪:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button 
              onClick={() => handleQuickLog('FOMO')}
              disabled={isLogging}
              size="sm"
            >
              😰 FOMO
            </Button>
            <Button 
              onClick={() => handleQuickLog('Fear')}
              disabled={isLogging}
              size="sm"
            >
              😨 Fear
            </Button>
            <Button 
              onClick={() => handleQuickLog('Revenge')}
              disabled={isLogging}
              size="sm"
            >
              😡 Revenge
            </Button>
            <Button 
              onClick={() => handleQuickLog('Greed')}
              disabled={isLogging}
              size="sm"
            >
              🤑 Greed
            </Button>
          </div>
          
          {/* 自定义笔记 */}
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="快速笔记..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && noteText.trim()) {
                  handleQuickLog('Note');
                }
              }}
              style={{
                flex: 1,
                padding: '4px 8px',
                background: V5_COLORS.bgInset,
                border: `1px solid ${V5_COLORS.border}`,
                borderRadius: '4px',
                color: V5_COLORS.text,
              }}
            />
            <Button
              onClick={() => handleQuickLog('Note')}
              disabled={isLogging || !noteText.trim()}
              size="sm"
            >
              📝 记录
            </Button>
          </div>
        </div>
      )}
    </GlassPanel>
  );
};
```

**验收**:
- [ ] UI渲染正常
- [ ] 按钮样式统一
- [ ] 输入框可用

---

#### Step 3: 在Dashboard实现回调 (45分钟)

**文件**: [src/views/Dashboard.tsx](file:///Users/mitchellcb/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Al-brooks-PA/.obsidian/plugins/al-brooks-console/src/views/Dashboard.tsx)

```typescript
/**
 * 处理快速情绪记录
 */
private handleQuickLog = async (
  type: string, 
  note?: string
): Promise<void> => {
  try {
    const todayNote = this.getTodayNotePath();
    if (!todayNote) {
      new Notice('未找到今日笔记');
      return;
    }

    // 构造日志条目
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    let logEntry: string;
    if (type === 'Note' && note) {
      logEntry = `[${timestamp}] 📝 ${note}`;
    } else {
      const emoji = {
        'FOMO': '😰',
        'Fear': '😨',
        'Revenge': '😡',
        'Greed': '🤑'
      }[type] || '📝';
      logEntry = `[${timestamp}] ${emoji} ${type}`;
    }

    // 追加到session_log字段
    await this.actionService.appendToSessionLog(todayNote, logEntry);
    
    new Notice(`✅ 已记录: ${type}`);
  } catch (error) {
    console.error('快速记录失败:', error);
    new Notice(`❌ 记录失败: ${error.message}`);
  }
};
```

**在ActionService添加方法**:

```typescript
/**
 * 追加到session_log
 */
async appendToSessionLog(
  notePath: string,
  entry: string
): Promise<void> {
  const file = this.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) {
    throw new Error(`文件不存在: ${notePath}`);
  }

  const content = await this.vault.read(file);
  const { frontmatter, body } = this.parseFrontmatter(content);

  // 追加到session_log数组
  if (!frontmatter.session_log) {
    frontmatter.session_log = [];
  }
  frontmatter.session_log.push(entry);

  // 写回
  const newContent = this.serializeFrontmatter(frontmatter, body);
  await this.vault.modify(file, newContent);
}
```

**验收**:
- [ ] 记录成功
- [ ] 数据持久化
- [ ] 时间戳正确

---

#### Step 4: 传递props (15分钟)

```typescript
// Dashboard -> TradingHubTab
<TradingHubTab
  // ... 现有props
  onQuickLog={this.handleQuickLog}  // 新增
/>

// TradingHubTab -> DailyActionsPanel
<DailyActionsPanel
  can={can}
  MarkdownBlock={MarkdownBlock}
  onQuickLog={props.onQuickLog}  // 新增
/>
```

**验收**:
- [ ] Props传递正确
- [ ] 类型定义完整

---

#### Step 5: 测试验证 (30分钟)

**测试用例**:
1. 点击情绪按钮,记录成功
2. 输入自定义笔记,记录成功
3. 查看frontmatter,数据正确
4. 多次记录,数组累加

**验收标准**:
- [ ] 所有按钮可用
- [ ] 输入框可用
- [ ] 数据正确保存
- [ ] UI无闪烁
- [ ] 构建成功

**预计时间**: 2.5小时  
**风险**: 低  
**优先级**: P1

---

### Task 3.3: 增强ActionService风控 ⭐⭐⭐⭐⭐

**目标**: 在底层添加风险校验,防止超限

**当前状态**:
- ✅ ActionService已实现updateTrade
- ❌ 无风控校验
- ❌ 可能超出每日限额

**实施步骤**:

#### Step 1: 添加风控校验方法 (1小时)

**文件**: `src/core/action/ActionService.ts`

```typescript
/**
 * 风控校验结果
 */
interface RiskValidationResult {
  passed: boolean;
  message?: string;
  details?: {
    currentRisk: number;
    newRisk: number;
    totalRisk: number;
    limit: number;
  };
}

/**
 * 校验风险是否超限
 */
private async validateRisk(
  updates: Partial<TradeRecord>
): Promise<RiskValidationResult> {
  // 只在有initial_risk时校验
  if (!updates.initial_risk || updates.initial_risk <= 0) {
    return { passed: true };
  }

  try {
    // 1. 获取今日计划
    const todayNote = await this.getTodayNotePath();
    if (!todayNote) {
      return { passed: true }; // 无计划,不限制
    }

    const plan = await this.loadPlan(todayNote);
    if (!plan?.riskLimit || plan.riskLimit <= 0) {
      return { passed: true }; // 无限制
    }

    // 2. 获取今日所有交易
    const todayTrades = await this.loadTodayTrades();

    // 3. 计算当前总风险
    const currentRisk = todayTrades.reduce((sum, trade) => {
      return sum + (trade.initial_risk || 0);
    }, 0);

    // 4. 计算新增后的总风险
    const newRisk = updates.initial_risk;
    const totalRisk = currentRisk + newRisk;

    // 5. 校验
    if (totalRisk > plan.riskLimit) {
      return {
        passed: false,
        message: `风险超限: 当前${currentRisk.toFixed(1)}R + 新增${newRisk.toFixed(1)}R = ${totalRisk.toFixed(1)}R > 限额${plan.riskLimit}R`,
        details: {
          currentRisk,
          newRisk,
          totalRisk,
          limit: plan.riskLimit
        }
      };
    }

    return { passed: true };
  } catch (error) {
    console.error('风控校验失败:', error);
    // 校验失败时,保守处理:允许通过
    return { passed: true };
  }
}

/**
 * 辅助方法: 获取今日笔记路径
 */
private async getTodayNotePath(): Promise<string | null> {
  const today = new Date().toISOString().split('T')[0];
  const path = `Daily/${today}.md`;
  
  const file = this.vault.getAbstractFileByPath(path);
  return file ? path : null;
}

/**
 * 辅助方法: 加载计划
 */
private async loadPlan(notePath: string): Promise<any> {
  const file = this.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) return null;
  
  const content = await this.vault.read(file);
  const { frontmatter } = this.parseFrontmatter(content);
  return frontmatter;
}

/**
 * 辅助方法: 加载今日交易
 */
private async loadTodayTrades(): Promise<TradeRecord[]> {
  // 这里需要访问TradeIndex
  // 可能需要在构造函数中注入
  // 或者直接扫描Daily/Trades目录
  
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const tradesFolder = 'Daily/Trades';
  
  const files = this.vault.getMarkdownFiles()
    .filter(f => f.path.startsWith(tradesFolder) && f.basename.startsWith(today));
  
  const trades: TradeRecord[] = [];
  for (const file of files) {
    const content = await this.vault.read(file);
    const { frontmatter } = this.parseFrontmatter(content);
    trades.push(frontmatter as TradeRecord);
  }
  
  return trades;
}
```

**验收**:
- [ ] 方法编译通过
- [ ] 逻辑正确
- [ ] 错误处理完善

---

#### Step 2: 集成到updateTrade (30分钟)

**文件**: `src/core/action/ActionService.ts`

```typescript
async updateTrade(
  path: string,
  updates: Partial<TradeRecord>,
  options: ActionOptions = {}
): Promise<ActionResult> {
  // 1. 风控校验 (新增)
  const riskCheck = await this.validateRisk(updates);
  if (!riskCheck.passed) {
    return {
      success: false,
      error: riskCheck.message,
      details: riskCheck.details
    };
  }

  // 2. 数据验证
  const validation = this.validator.validateRecord(updates, {
    strict: options.strict ?? false
  });

  if (!validation.isValid) {
    return {
      success: false,
      error: '数据验证失败',
      validationErrors: validation.errors
    };
  }

  // 3. Dry Run
  if (options.dryRun) {
    return {
      success: true,
      dryRun: true,
      message: '预演成功(未实际修改)'
    };
  }

  // 4. 执行更新
  try {
    await this.updater.updateFrontmatter(path, updates);
    return {
      success: true,
      message: '更新成功'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

**验收**:
- [ ] 风控在验证之前
- [ ] 返回详细信息
- [ ] 不影响现有逻辑

---

#### Step 3: UI层处理风控错误 (45分钟)

**文件**: [src/views/components/trading/TodayTradesSection.tsx](file:///Users/mitchellcb/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Al-brooks-PA/.obsidian/plugins/al-brooks-console/src/views/components/trading/TodayTradesSection.tsx)

```typescript
// 在handleSave中
const handleSave = async () => {
  try {
    const result = await actionService.updateTrade(trade.path, updates);
    
    if (!result.success) {
      // 检查是否是风控错误
      if (result.details?.limit) {
        // 显示风控警告弹窗
        showRiskWarningModal(result.details);
      } else {
        new Notice(`❌ ${result.error}`);
      }
      return;
    }
    
    new Notice('✅ 更新成功');
    onUpdate?.();
  } catch (error) {
    new Notice(`❌ 更新失败: ${error.message}`);
  }
};

// 风控警告弹窗
const showRiskWarningModal = (details: any) => {
  const modal = new Modal(app);
  modal.titleEl.setText('⚠️ 风险警告');
  
  modal.contentEl.createDiv({}, (div) => {
    div.innerHTML = `
      <div style="margin-bottom: 16px;">
        <strong>风险超出每日限额!</strong>
      </div>
      <div style="margin-bottom: 8px;">
        当前风险: ${details.currentRisk.toFixed(1)}R
      </div>
      <div style="margin-bottom: 8px;">
        新增风险: ${details.newRisk.toFixed(1)}R
      </div>
      <div style="margin-bottom: 8px;">
        总计: ${details.totalRisk.toFixed(1)}R
      </div>
      <div style="margin-bottom: 16px; color: #ff6b6b;">
        限额: ${details.limit}R
      </div>
      <div style="font-size: 12px; opacity: 0.7;">
        建议: 降低仓位或等待明日
      </div>
    `;
  });
  
  modal.open();
};
```

**验收**:
- [ ] 弹窗显示正确
- [ ] 信息清晰
- [ ] 用户体验好

---

#### Step 4: 测试验证 (1小时)

**测试用例**:
1. 正常交易,风险在限额内
2. 超限交易,显示警告
3. 无计划时,不限制
4. 边界情况(刚好等于限额)

**验收标准**:
- [ ] 风控逻辑正确
- [ ] 警告弹窗友好
- [ ] 不影响正常交易
- [ ] 边界情况处理正确
- [ ] 构建成功

**预计时间**: 3-4小时  
**风险**: 中  
**优先级**: P0

---

## 📊 总体时间表

| 任务 | 预计时间 | 优先级 | 依赖 |
|------|---------|--------|------|
| Task 3.1 | 2小时 | P0 | 无 |
| Task 3.2 | 2.5小时 | P1 | 无 |
| Task 3.3 | 3-4小时 | P0 | 无 |
| 集成测试 | 2小时 | P0 | 3.1-3.3 |
| 文档更新 | 1小时 | P1 | 全部 |

**总计**: 10.5-13.5小时

---

## ✅ 验收标准

### 功能验收
- [ ] PlanWidget可勾选完成
- [ ] PlanWidget可编辑风控
- [ ] DailyActionsPanel可快速记录
- [ ] 风控校验工作正常
- [ ] 超限时显示警告

### 代码质量
- [ ] 无TypeScript错误
- [ ] 构建成功
- [ ] 无新增组件
- [ ] 复用现有模块
- [ ] 向后兼容

### 用户体验
- [ ] 操作流畅
- [ ] 提示友好
- [ ] 错误处理完善
- [ ] 无需打开文件编辑

---

## 🚀 开始实施

**准备工作**:
1. ✅ Git checkpoint
2. ✅ 更新主任务列表
3. ✅ 创建实施计划

**下一步**: 开始Task 3.1 - 激活PlanWidget交互

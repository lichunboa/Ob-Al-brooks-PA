# 📋 Phase 1, Week 3 实施计划

> **时间**: 2026-01-13 ~ 2026-01-17 (5个工作日)  
> **目标**: UI 集成与用户体验优化  
> **前置条件**: Week 1-2 ActionService 核心功能已完成

---

## 🎯 Week 3 目标

### 核心目标

1. **业务集成**: 将 ActionService 集成到实际业务流程
2. **用户界面**: 提供友好的批量修改和历史管理界面
3. **用户体验**: 优化交互流程,降低误操作风险
4. **完整测试**: 端到端测试验证

### 用户价值

- ✅ 批量修改交易数据 (无需手动逐个编辑)
- ✅ 查看操作历史 (审计和调试)
- ✅ 一键撤销 (降低误操作风险)
- ✅ 快捷操作 (常用修改场景)

---

## 📅 Day 11-12: 批量修改界面

### 任务 11.1: 设计批量修改 UI

**目标**: 创建用户友好的批量修改界面

**功能需求**:
1. **文件选择**
   - 支持多选交易笔记
   - 显示已选文件列表
   - 支持筛选和搜索

2. **字段编辑**
   - 下拉选择要修改的字段
   - 根据字段类型显示合适的输入控件
   - 支持批量设置相同值

3. **预览与确认**
   - Dry Run 预览变更
   - 显示影响的文件数量
   - 确认对话框

**参考设计**:
```typescript
interface BatchEditPanelProps {
    trades: TradeRecord[];
    onBatchUpdate: (items: BatchUpdateItem[]) => Promise<BatchActionResult>;
}

// UI 组件结构
<BatchEditPanel>
  <FileSelector />        // 文件选择器
  <FieldEditor />         // 字段编辑器
  <PreviewDialog />       // 预览对话框
  <ConfirmDialog />       // 确认对话框
</BatchEditPanel>
```

**验证**:
- [ ] UI 显示正常
- [ ] 文件选择功能正常
- [ ] 字段编辑功能正常
- [ ] Dry Run 预览正常

---

### 任务 11.2: 实现批量修改逻辑

**代码位置**: `src/views/components/manage/BatchEditPanel.tsx`

**实现要点**:

1. **状态管理**
```typescript
const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
const [fieldToEdit, setFieldToEdit] = useState<string>('');
const [newValue, setNewValue] = useState<unknown>(null);
const [previewResult, setPreviewResult] = useState<BatchActionResult | null>(null);
```

2. **预览逻辑**
```typescript
const handlePreview = async () => {
    const items = selectedFiles.map(path => ({
        path,
        updates: { [fieldToEdit]: newValue }
    }));
    
    const result = await actionService.batchUpdateTrades(items, {
        dryRun: true,
        validate: true
    });
    
    setPreviewResult(result);
};
```

3. **执行更新**
```typescript
const handleConfirm = async () => {
    const items = selectedFiles.map(path => ({
        path,
        updates: { [fieldToEdit]: newValue }
    }));
    
    const result = await actionService.batchUpdateTrades(items, {
        dryRun: false,
        validate: true
    });
    
    // 显示结果
    showNotice(`批量更新完成: ${result.succeeded}成功, ${result.failed}失败`);
};
```

**验证**:
- [ ] 预览功能正常
- [ ] 批量更新功能正常
- [ ] 错误处理正确
- [ ] 结果反馈清晰

---

## 📅 Day 13: 操作历史查看器

### 任务 13.1: 创建历史记录 UI

**目标**: 显示操作历史,支持查看详情

**功能需求**:
1. **历史列表**
   - 显示最近操作 (默认 20 条)
   - 时间倒序排列
   - 显示操作类型、文件数、时间

2. **详情查看**
   - 展开查看变更详情
   - Before/After 对比
   - 受影响的文件列表

3. **筛选功能**
   - 按操作类型筛选
   - 按时间范围筛选
   - 按文件路径搜索

**参考设计**:
```typescript
interface HistoryViewerProps {
    actionService: ActionService;
}

<HistoryViewer>
  <HistoryList>
    <HistoryItem>
      <OperationType />
      <FileCount />
      <Timestamp />
      <ExpandButton />
    </HistoryItem>
  </HistoryList>
  <HistoryDetail>
    <ChangeList />
    <FileList />
  </HistoryDetail>
</HistoryViewer>
```

**验证**:
- [ ] 历史列表显示正常
- [ ] 详情展开功能正常
- [ ] 筛选功能正常

---

## 📅 Day 14: 撤销功能集成

### 任务 14.1: 添加撤销按钮

**目标**: 在历史记录中添加撤销功能

**功能需求**:
1. **撤销按钮**
   - 每条历史记录显示撤销按钮
   - 不可撤销的操作禁用按钮
   - 悬停提示

2. **确认对话框**
   - 显示将要撤销的操作
   - 列出受影响的文件
   - 二次确认

3. **执行撤销**
   - 调用 `actionService.undo()`
   - 显示进度
   - 结果反馈

**参考实现**:
```typescript
const handleUndo = async (entryId: string) => {
    const confirmed = await confirmDialog({
        title: '确认撤销',
        message: '此操作将恢复文件到之前的状态,是否继续?'
    });
    
    if (!confirmed) return;
    
    const result = await actionService.undo(entryId);
    
    if (result.success) {
        showNotice('撤销成功');
        refreshHistory();
    } else {
        showNotice(`撤销失败: ${result.message}`);
    }
};
```

**验证**:
- [ ] 撤销按钮显示正确
- [ ] 确认对话框正常
- [ ] 撤销功能正常
- [ ] 结果反馈清晰

---

## 📅 Day 15: 快捷操作面板

### 任务 15.1: 创建常用操作快捷方式

**目标**: 提供常用修改场景的快捷入口

**常用场景**:
1. **批量修正账户类型**
   - Demo → Live
   - Live → Demo

2. **批量修正结果**
   - unknown → win/loss
   - scratch → win/loss

3. **批量添加标签**
   - 添加 setup 标签
   - 添加 pattern 标签

4. **批量修正时间周期**
   - 统一修改 timeframe

**参考设计**:
```typescript
<QuickActionsPanel>
  <QuickAction
    title="修正账户类型"
    description="将选中文件的账户类型从 Demo 改为 Live"
    onClick={() => handleQuickAction('accountType', 'Live')}
  />
  <QuickAction
    title="标记为盈利"
    description="将选中文件的结果标记为 win"
    onClick={() => handleQuickAction('outcome', 'win')}
  />
  {/* 更多快捷操作 */}
</QuickActionsPanel>
```

**验证**:
- [ ] 快捷操作显示正常
- [ ] 点击触发正确
- [ ] 批量更新正常

---

## 📅 Day 16-17: 完整测试与优化

### 任务 16.1: 端到端测试

**测试场景**:

1. **批量修改测试**
   - [ ] 选择 10 个文件
   - [ ] 修改 accountType
   - [ ] Dry Run 预览
   - [ ] 确认并执行
   - [ ] 验证文件内容

2. **历史查看测试**
   - [ ] 查看操作历史
   - [ ] 展开查看详情
   - [ ] 筛选历史记录

3. **撤销功能测试**
   - [ ] 执行批量更新
   - [ ] 查看历史记录
   - [ ] 执行撤销
   - [ ] 验证文件恢复

4. **快捷操作测试**
   - [ ] 使用快捷操作
   - [ ] 验证结果
   - [ ] 检查历史记录

**性能测试**:
- [ ] 100 个文件批量更新 < 10 秒
- [ ] UI 响应流畅
- [ ] 无内存泄漏

---

### 任务 16.2: 用户体验优化

**优化项**:

1. **加载状态**
   - 添加 Loading 指示器
   - 禁用按钮防止重复点击
   - 进度条显示

2. **错误处理**
   - 友好的错误提示
   - 详细的错误信息
   - 重试机制

3. **交互优化**
   - 快捷键支持
   - 批量选择优化
   - 撤销/重做快捷键

4. **视觉优化**
   - 统一的设计风格
   - 清晰的视觉层级
   - 合理的间距和布局

**验证**:
- [ ] Loading 状态显示正常
- [ ] 错误提示友好
- [ ] 交互流畅
- [ ] 视觉效果良好

---

## ✅ Week 3 验收标准

### 功能完整性
- [ ] 批量修改界面完整可用
- [ ] 操作历史查看器功能正常
- [ ] 撤销功能集成完成
- [ ] 快捷操作面板可用
- [ ] 所有测试场景通过

### 用户体验
- [ ] UI 友好,易于理解
- [ ] 交互流畅,响应及时
- [ ] 错误提示清晰
- [ ] 视觉效果良好

### 代码质量
- [ ] TypeScript 编译无错误
- [ ] 组件结构清晰
- [ ] 代码复用性好
- [ ] 文档完整

---

## 📊 预期成果

### 新增组件
1. `BatchEditPanel.tsx` - 批量修改面板
2. `HistoryViewer.tsx` - 历史查看器
3. `QuickActionsPanel.tsx` - 快捷操作面板

### 集成点
1. ManageTab - 主要集成点
2. 可能的其他 Tab 集成

### 用户价值
- **效率提升**: 批量操作替代手动逐个修改
- **安全性**: Dry Run 预览 + 撤销功能
- **可追溯**: 完整的操作历史记录
- **易用性**: 快捷操作 + 友好界面

---

**创建时间**: 2026-01-11  
**预计开始**: 2026-01-13  
**预计完成**: 2026-01-17

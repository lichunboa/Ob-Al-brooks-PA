#!/usr/bin/env python3
"""
替换Dashboard.tsx中的Manager Tab为ManageTab组件
"""

# 读取原文件
with open('src/views/Dashboard.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 准备ManageTab组件调用代码
manage_tab_component = '''      {activePage === "manage" ? (
        <ManageTab
          // 数据Props
          schemaIssues={schemaIssues}
          paTagSnapshot={paTagSnapshot}
          trades={trades}
          strategyIndex={strategyIndex}
          managerTradeInventory={managerTradeInventory}
          managerStrategyInventory={managerStrategyInventory}
          managerInspectorKey={managerInspectorKey}
          managerInspectorTab={managerInspectorTab}
          managerInspectorFileFilter={managerInspectorFileFilter}
          managerScope={managerScope}
          managerSearch={managerSearch}
          managerBusy={managerBusy}
          inspectorIssues={inspectorIssues}
          inspectorFixPlanEnabled={inspectorFixPlanEnabled}
          inspectorFixPlanPresets={inspectorFixPlanPresets}
          // 状态设置函数
          setManagerInspectorKey={setManagerInspectorKey}
          setManagerInspectorTab={setManagerInspectorTab}
          setManagerInspectorFileFilter={setManagerInspectorFileFilter}
          setManagerScope={setManagerScope}
          setManagerSearch={setManagerSearch}
          setManagerBusy={setManagerBusy}
          setInspectorFixPlanEnabled={setInspectorFixPlanEnabled}
          // 操作函数
          scanManagerInventory={scanManagerInventory}
          runManagerPlan={runManagerPlan}
          buildRenameKeyPlan={buildRenameKeyPlan}
          buildDeleteKeyPlan={buildDeleteKeyPlan}
          buildAppendValPlan={buildAppendValPlan}
          buildInjectPropPlan={buildInjectPropPlan}
          buildUpdateValPlan={buildUpdateValPlan}
          buildDeleteValPlan={buildDeleteValPlan}
          selectManagerTradeFiles={selectManagerTradeFiles}
          selectManagerStrategyFiles={selectManagerStrategyFiles}
          runCommand={runCommand}
          // 辅助函数
          openFile={openFile}
          promptText={promptText}
          confirmDialog={confirmDialog}
          prettyVal={prettyVal}
          prettyManagerVal={prettyManagerVal}
          matchKeyToGroup={matchKeyToGroup}
          canonicalizeSearch={canonicalizeSearch}
          // 样式Props
          cardTightStyle={cardTightStyle}
          buttonStyle={buttonStyle}
          disabledButtonStyle={disabledButtonStyle}
          // 事件处理器
          onBtnMouseEnter={onBtnMouseEnter}
          onBtnMouseLeave={onBtnMouseLeave}
          onBtnFocus={onBtnFocus}
          onBtnBlur={onBtnBlur}
          onTextBtnMouseEnter={onTextBtnMouseEnter}
          onTextBtnMouseLeave={onTextBtnMouseLeave}
          onTextBtnFocus={onTextBtnFocus}
          onTextBtnBlur={onTextBtnBlur}
        />
      ) : null}
'''

# 构建新文件: 前1389行 + ManageTab组件 + 2796行之后的内容
# 注意: Python的list索引是0-based,所以1389行对应索引1388,2796行对应索引2795
new_lines = lines[:1389] + [manage_tab_component] + lines[2796:]

# 写入新文件
with open('src/views/Dashboard.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"✅ 替换完成!")
print(f"原文件: {len(lines)} 行")
print(f"新文件: {len(new_lines)} 行")
print(f"减少: {len(lines) - len(new_lines)} 行")

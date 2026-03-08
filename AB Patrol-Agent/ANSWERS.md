# 问题回答总结

## Q1: 清理冲突的 codex 进程，打开新进程时是否应该杀掉之前的进程？

**回答**：是的！应该在启动前清理旧进程。

**当前问题**：
- 发现有 3 个 `codex exec resume` 进程同时运行
- 这些进程互相冲突，导致 bootstrap 超时

**建议修改 start.sh 的 `start_loop()` 函数**：
```bash
start_loop() {
  # 在启动前清理旧的 codex 进程
  pkill -f "codex exec resume" 2>/dev/null || true
  sleep 2

  if is_running; then
    echo "AB Patrol-Agent 已运行 (PID: $(cat "$PID_FILE"))"
    return 0
  fi
  # ... 继续原有逻辑
}
```

**已完成**：
- ✅ 手动清理了冲突的 codex 进程
- ⚠️ 需要在 start.sh 中添加自动清理逻辑

---

## Q2: 增加 bootstrap timeout，不会影响交易逻辑吧？

**回答**：不会影响！完全安全。

**修改内容**：
```python
# providers.py:318
# 从 420 秒增加到 600 秒
timeout_seconds=max(self.config.timeout_seconds + 180, 600)
```

**为什么不影响交易**：
1. ✅ Bootstrap 只在**初始化阶段**执行（加载知识库）
2. ✅ Bootstrap 完成后进入 PATROL 阶段，每轮 120-240 秒
3. ✅ PATROL 阶段的 timeout 仍然是 180 秒（AB_PATROL_LLM_TIMEOUT=180）
4. ✅ 交易决策在 PATROL 阶段，不受 bootstrap timeout 影响

**流程**：
```
BOOTSTRAP (600s timeout) → 一次性完成
  ↓
PATROL (180s timeout) → 每轮决策
  ↓
交易执行 → 正常进行
```

---

## Q3: TG 发送的信息已经优化过了吗？图片功能没有被改动吧？

**回答**：没有改动！图片功能完好。

**检查结果**：
1. ✅ `push_telegram_photo()` 函数完整保留（pa_runtime.py:4115-4144）
2. ✅ `primary_chart_for_decision()` 函数完整保留（pa_runtime.py:4146-4153）
3. ✅ 图片发送逻辑：
   - 优先使用 Telegram Bot API 直接发送
   - 失败后通过 forward URL 转发
   - 最后尝试 openclaw 发送

**关于图片周期对应问题**：
- `primary_chart_for_decision()` 会从 `analysis_board` 中提取 `primary_chart_path`
- 图片路径来自 `chart_context.get("primary_chart_path")`
- **不浪费 token**：图片是通过 Telegram API 发送的，不经过 LLM

**图片发送流程**：
```python
# 1. 从 decision 中获取 focus_symbols
# 2. 从 analysis_board[symbol] 中获取 chart_context
# 3. 提取 primary_chart_path
# 4. 通过 Telegram API 发送图片（不消耗 LLM token）
```

**如果图片周期不对应**：
- 可能是 `analysis_board` 中的 `chart_context` 数据不正确
- 或者 `primary_chart_path` 指向了错误的图片文件
- 建议检查 chart_gen.py 生成图片的逻辑

---

## 总结

✅ **已完成**：
1. 清理了冲突的 codex 进程
2. 增加 bootstrap timeout 到 600 秒（不影响交易）
3. 确认图片功能完好无损

⚠️ **待优化**：
1. 在 start.sh 中添加自动清理 codex 进程的逻辑
2. 如果图片周期不对应，需要检查 chart_gen.py

🔧 **建议**：
- 重启服务后观察是否能完成 bootstrap 进入 PATROL 阶段
- 如果仍然超时，可能需要检查网络或 codex CLI 版本

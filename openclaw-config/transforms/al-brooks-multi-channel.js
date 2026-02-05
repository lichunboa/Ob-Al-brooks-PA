/**
 * Al Brooks Signal Transform - 多频道推送
 *
 * 版本: V5.0
 * 更新: 2026-02-06
 *
 * 修复:
 * - 时间戳解析（Unix秒 → 毫秒）
 * - 传递完整 PA 信号字段给 agent
 * - 添加信号新鲜度检查（超过 5 分钟的信号标记为过时）
 *
 * 前置过滤（在 transform 层直接丢弃）：
 * - 评分 < 75: 直接丢弃，不触发 agent
 *
 * 推送规则（agent 执行）：
 * - 评分 >= 75: 推送到 Discord #al-brooks-信号
 * - 评分 >= 80: 推送到 Discord #小明交易 + 创建模拟交易
 *
 * Discord 频道 ID：
 * - #al-brooks-信号: 1468430143302406379
 * - #小明交易: 1468430213196288052
 */

module.exports = function transform(ctx) {
  const payload = ctx.payload;

  // 验证必要字段
  if (!payload.symbol || !payload.direction) {
    console.log('[Al Brooks Transform] Invalid payload - missing required fields');
    return null;
  }

  const strength = payload.strength || 0;

  // ========== 前置过滤：低分信号直接丢弃 ==========
  if (strength < 75) {
    console.log(`[Al Brooks Transform] Signal dropped: ${payload.symbol} ${payload.direction} strength=${strength} < 75`);
    return null;  // 返回 null 表示不触发 agent
  }

  // ========== 时间戳处理（修复：Unix秒 → 毫秒） ==========
  let signalTime;
  if (payload.timestamp) {
    // 后端发送的是 Unix 秒，JavaScript 需要毫秒
    const ts = typeof payload.timestamp === 'number' && payload.timestamp < 10000000000
      ? payload.timestamp * 1000  // 秒 → 毫秒
      : payload.timestamp;
    signalTime = new Date(ts);
  } else {
    signalTime = new Date();
  }

  const timeStr = signalTime.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit'
  });

  // ========== 信号新鲜度检查 ==========
  const now = Date.now();
  const signalAgeMs = now - signalTime.getTime();
  const signalAgeMinutes = Math.floor(signalAgeMs / 60000);
  const isStale = signalAgeMinutes > 5;
  const freshnessWarning = isStale
    ? `\n⚠️ **信号已过时 ${signalAgeMinutes} 分钟**，请谨慎评估！`
    : '';

  // ========== 构建 PA 增强字段信息 ==========
  let paFields = '';
  if (payload.stop_loss || payload.take_profit || payload.entry_trigger) {
    paFields = `
**PA 信号详情**：
- 止损价: ${payload.stop_loss || '待计算'}
- 止盈价: ${payload.take_profit || '待计算'}
- 入场触发: ${payload.entry_trigger || 'N/A'}
- 入场类型: ${payload.entry_type || 'N/A'}
- 信号K线高点: ${payload.signal_bar_high || 'N/A'}
- 信号K线低点: ${payload.signal_bar_low || 'N/A'}
- 概率评估: ${payload.probability || 'N/A'}
- 市场周期: ${payload.cycle || 'N/A'}
- 需要确认: ${payload.confirmation_needed ? '是' : '否'}
`;
  }

  // ========== 等距测量目标 ==========
  let mmTargets = '';
  if (payload.extra && payload.extra.measured_move_targets) {
    const targets = payload.extra.measured_move_targets;
    mmTargets = `
**等距测量目标**：
- 1x 目标: ${targets['1x'] || 'N/A'}
- 1.5x 目标: ${targets['1.5x'] || 'N/A'}
- 2x 目标: ${targets['2x'] || 'N/A'}
`;
  }

  // 构建信号消息
  const signalMessage = `
🦁 **新交易信号** [${timeStr}]${freshnessWarning}

**信号数据**：
- 品种: ${payload.symbol}
- 方向: ${payload.direction}
- 强度: ${strength}%
- 周期: ${payload.timeframe || '5m'}
- 价格: ${payload.price || '需要获取实时价格'}
- 信号类型: ${payload.signal_type || 'N/A'}
${paFields}${mmTargets}
---

## ⚠️ 必须执行的推送规则（不可跳过）

使用 **al-brooks-simtrade** skill 完成分析后，**必须**按以下规则推送：

### 规则 1：评分 >= 75 → 推送到 #al-brooks-信号
**频道 ID**: \`1468430143302406379\`
**内容**: AL Brooks 简报 + 详细分析
**格式**: 参考 SKILL.md 5.1 节的结构化卡片格式

### 规则 2：评分 >= 80 → 推送到 #小明交易 + 创建模拟交易
**频道 ID**: \`1468430213196288052\`
**内容**: 小明开仓消息
**动作**: 创建 Obsidian 模拟交易笔记，更新 active_trades.json

### 规则 3：评分 < 75 → 不推送
仅在本地记录分析结果，不发送到任何 Discord 频道。

---

## 推送命令格式

\`\`\`
message(action="send", channel="discord", to="channel:1468430143302406379", message="内容")
message(action="send", channel="discord", to="channel:1468430213196288052", message="内容")
\`\`\`

---

**开始分析！完成后严格按照上述规则推送。**
`;

  // 返回 transform 结果
  // 重要：直接覆盖 timestamp 字段，避免 agent 误解 UTC 时间
  return {
    message: signalMessage.trim(),
    // 直接覆盖原始 timestamp 为当前时间的毫秒时间戳（本地时间）
    // 这样 agent 用 new Date(timestamp) 会得到正确的本地时间
    timestamp: Date.now(),
    // 额外提供格式化的时间字符串
    signal_time: timeStr,  // 如 "03:45"
    signal_time_full: signalTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    signal_age_minutes: signalAgeMinutes,
    is_stale: isStale
  };
};

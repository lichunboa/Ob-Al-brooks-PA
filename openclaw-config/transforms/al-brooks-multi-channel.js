/**
 * Al Brooks Signal Transform - PA交易专用
 *
 * 版本: V6.0
 * 更新: 2026-02-07
 *
 * 重大变更 V6.0:
 * - 频道隔离：PA交易只推送到 #pa交易，不再推送到其他频道
 * - Token 优化：移除拒绝/观望文件创建，只发 Discord 消息
 * - 进化系统：基于已完成交易统计，不依赖拒绝/观望文件
 *
 * 前置过滤（在 transform 层直接丢弃）：
 * - 评分 < 70: 直接丢弃，不触发 agent
 *
 * 推送规则（agent 执行）：
 * - 评分 >= 80: 推送到 Discord #pa交易 + 创建模拟交易笔记
 * - 评分 70-79: 仅推送 Discord 简报（不创建任何文件）
 * - 评分 < 70: 不推送，不创建文件
 *
 * Discord 频道配置（严格隔离）：
 * - #pa交易: 1468430213196288052 (PA交易专用)
 * - #量化交易: 1468430143302406379 (量化分析师专用，PA交易禁止使用)
 * - #威科夫: 1469202819461681306 (威科夫专用，PA交易禁止使用)
 * - #al-brooks: 1468430254560510043 (学习问答专用，不接收交易信号)
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
  if (strength < 70) {
    console.log(`[Al Brooks Transform] Signal dropped: ${payload.symbol} ${payload.direction} strength=${strength} < 70`);
    return null;  // 返回 null 表示不触发 agent
  }

  // ========== 时间戳处理（修复：Unix秒 → 毫秒） ==========
  // 使用当前时间作为信号时间，因为后端发送的时间戳可能有时区问题
  // 信号是实时推送的，所以直接用当前时间更准确
  const signalTime = new Date();

  // 手动计算北京时间（UTC+8）
  const utcHours = signalTime.getUTCHours();
  const utcMinutes = signalTime.getUTCMinutes();
  const beijingHours = (utcHours + 8) % 24;
  const timeStr = `${String(beijingHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}`;

  console.log(`[Al Brooks Transform] Signal time: ${timeStr} (Beijing), UTC: ${signalTime.toISOString()}`);

  // ========== 信号新鲜度检查 ==========
  // 由于我们使用当前时间作为信号时间，信号永远是新鲜的
  const signalAgeMinutes = 0;
  const isStale = false;
  const freshnessWarning = '';

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

  // 获取信号价格（如果后端提供了的话）
  const signalPrice = payload.price || 0;

  // 构建精简信号消息（规则已在 SKILL.md 中定义）
  const signalMessage = `
🦁 **PA信号** [${timeStr}] ${payload.symbol} ${payload.direction} ${strength}%
周期: ${payload.timeframe || '5m'} | 价格: ${signalPrice > 0 ? '$' + signalPrice.toLocaleString() : 'API获取'}
${paFields ? paFields.trim() : ''}${mmTargets ? mmTargets.trim() : ''}

按 SKILL.md 规则分析并推送到 #pa交易 (1468430213196288052)
`;

  // 返回 transform 结果
  // 重要：直接覆盖 timestamp 字段，避免 agent 误解 UTC 时间
  return {
    message: signalMessage.trim(),
    // 直接覆盖原始 timestamp 为当前时间的毫秒时间戳（本地时间）
    // 这样 agent 用 new Date(timestamp) 会得到正确的本地时间
    timestamp: Date.now(),
    // 信号价格（从后端传递）
    price: signalPrice,
    // 额外提供格式化的时间字符串
    signal_time: timeStr,  // 如 "03:45"
    signal_time_full: signalTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    signal_age_minutes: signalAgeMinutes,
    is_stale: isStale
  };
};

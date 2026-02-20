/**
 * 多机器人信号路由 Transform - V3.5
 *
 * 版本: V3.5 (预注入 bot-summary + 动态绝对路径)
 * 更新: 2026-02-08
 *
 * 功能:
 * 1. 根据后端 route_to 字段路由到指定机器人
 * 2. 支持 TradeCat 129 条规则的分类路由
 * 3. 预过滤低质量信号
 * 4. 传递精简上下文，减少 token 消耗
 * 5. 为每个机器人定制信号格式
 * 6. [V3.1] 检查 execution-service 交易开关状态
 * 7. [V3.5] 预注入 bot-summary 状态 + 动态绝对路径
 *
 * 机器人配置:
 * - PA交易 (al-brooks): Al Brooks 价格行为 → #pa交易 (1468430213196288052)
 *   规则: pattern(18) + core.smc(4) + core.sr(2) = 24 条
 * - 量化分析师 (trader): 量化分析 → #量化交易 (1468430143302406379)
 *   规则: momentum(29) + trend(22) + volatility(17) + core.macd(3) + core.conf(2) = 73 条
 * - 威科夫大师 (wyckoff): 威科夫量价分析 → #威科夫 (1469202819461681306)
 *   规则: futures(14) + volume(14) + misc(10) + core.vol(4) + core.fut(5) = 47 条
 *
 * 路由规则:
 * - category/subcategory 决定主路由
 * - 高价值规则可同时发送给多个机器人
 *
 * 重要: #al-brooks (1468430254560510043) 只用于教学，不接收交易信号！
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// ============================================================
// 全局暂停开关 — 设为 true 时所有信号停止路由到 agent
// 恢复时改回 false 即可
// ============================================================
const SIGNALS_PAUSED = true;

// Execution Service 配置
const EXECUTION_SERVICE_URL = 'http://localhost:8092';

// OpenClaw Gateway 配置（多目标路由用）
const GATEWAY_URL = 'http://127.0.0.1:18789';
const HOOK_TOKEN = 'hooks-5fed4a9a7de03c21c542049f68669b0983b8119a471ae74a7909f2fb17ace267';
const HOOK_PATHS = {
  'al-brooks': 'al-brooks-signal',
  'trader': 'trader-signal',
  'wyckoff': 'wyckoff-signal'
};

// 文件路径
const WORKSPACE = '/Users/mitchellcb/.openclaw/workspace';
const SHARED_WORKSPACE = '/Users/mitchellcb/.openclaw/workspaces/trading-shared';
const STATS_DIR = path.join(WORKSPACE, 'stats');
const RULES_DIR = path.join(WORKSPACE, 'rules');
const SYMBOL_STATS_FILE = path.join(STATS_DIR, 'symbol_stats.json');
const ACTIVE_TRADES_FILE = path.join(WORKSPACE, 'active_trades.json');
const SIGNAL_DEDUP_FILE = path.join(STATS_DIR, 'signal_dedup.json');
const SIGNAL_RULES_FILE = path.join(RULES_DIR, 'signal-rules.json');
const TRADING_STATE_CACHE_FILE = path.join(STATS_DIR, 'trading_state_cache.json');

// 规则路由映射 (基于 TradeCat 129 条规则)
const CATEGORY_ROUTING = {
  // PA交易 (xiaoming/al-brooks) - 24 条规则
  pattern: 'al-brooks',      // K线形态、SMC、斐波那契、VPVR

  // 量化分析师 (trader) - 73 条规则
  momentum: 'trader',        // RSI、KDJ、CCI、WilliamsR、MFI、ADX
  trend: 'trader',           // SuperTrend、Ichimoku、精准趋势等
  volatility: 'trader',      // 布林带、ATR、Donchian、Keltner

  // 威科夫大师 (wyckoff) - 47 条规则
  futures: 'wyckoff',        // 期货情绪、大户多空比
  volume: 'wyckoff',         // MACD、OBV、CVD、量比
  misc: 'wyckoff'            // 流动性、剥头皮、基础数据
};

// 子类别路由映射 (core 类别的细分)
const SUBCATEGORY_ROUTING = {
  confluence: 'trader',      // 多指标共振 → 量化
  futures_extreme: 'wyckoff', // 期货极端 → 威科夫
  volume_anomaly: 'wyckoff', // 量价异常 → 威科夫
  smc: 'al-brooks',          // SMC结构 → PA交易
  macd: 'trader',            // MACD关键 → 量化
  sr: 'al-brooks'            // 支撑阻力 → PA交易
};

// 多路由规则 (高价值信号同时发送给多个机器人)
const MULTI_ROUTE_RULES = {
  '头肩顶形态': ['al-brooks', 'wyckoff'],
  '头肩底形态': ['al-brooks', 'wyckoff'],
  'CHoCH趋势变化看涨': ['al-brooks', 'trader'],
  'CHoCH趋势变化看跌': ['al-brooks', 'trader'],
  '大户极度看多警告': ['wyckoff', 'trader'],
  '大户极度看空警告': ['wyckoff', 'trader'],
  'RSI顶背离': ['trader', 'al-brooks'],
  'RSI底背离': ['trader', 'al-brooks']
};

// 信号去重缓存（内存 + 文件持久化）
const DEDUP_WINDOW_MS = 30 * 60 * 1000; // V3.8.3: 30 分钟去重窗口（根源已修复，从60min回调）
const REJECTION_COOLDOWN_MS = 60 * 60 * 1000; // V3.8.3: 被拒信号 1 小时冷却（从2hr回调）

// V3.8: 全局会话预算 — 限制每时段 agent 创建的总 session 数
const SESSION_BUDGET_WINDOW_MS = 10 * 60 * 1000; // 10 分钟窗口
const SESSION_BUDGET_MAX = 2; // V3.8.3: 每 10 分钟最多 2 个 session（根源已修复，从1回调）
const sessionBudgetLog = []; // [timestamp, ...]

// 各机器人账户文件路径
const ACCOUNT_FILES = {
  'al-brooks': path.join(SHARED_WORKSPACE, 'al_brooks_account.json'),
  trader: path.join(SHARED_WORKSPACE, 'quant_account.json'),
  wyckoff: path.join(SHARED_WORKSPACE, 'wyckoff_account.json')
};

const ACTIVE_TRADES_FILES = {
  'al-brooks': path.join(SHARED_WORKSPACE, 'al_brooks_active_trades.json'),
  'trader': path.join(SHARED_WORKSPACE, 'quant_active_trades.json'),
  'wyckoff': path.join(SHARED_WORKSPACE, 'wyckoff_active_trades.json')
};

// 进化系统文件路径 (V3.5 新增)
const EVOLUTION_FILES = {
  'al-brooks': path.join(SHARED_WORKSPACE, 'al_brooks_evolution.json'),
  'trader': path.join(SHARED_WORKSPACE, 'quant_evolution.json'),
  'wyckoff': path.join(SHARED_WORKSPACE, 'wyckoff_evolution.json')
};

// Obsidian vault 绝对路径
const OBSIDIAN_VAULT = '/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian';
const BOT_NOTE_FOLDERS = {
  'al-brooks': 'PA交易',
  trader: 'Quant',
  wyckoff: 'Wyckoff'
};
const BOT_NOTE_PREFIX = {
  'al-brooks': '模拟',
  trader: '量化',
  wyckoff: '威科夫'
};

// bot-summary 缓存
const BOT_SUMMARY_CACHE_FILE = path.join(STATS_DIR, 'bot_summary_cache.json');
const BOT_SUMMARY_CACHE_TTL = 10 * 1000; // 10 秒

// 阈值配置文件路径
const THRESHOLDS_FILE = path.join(STATS_DIR, 'thresholds.json');

// 默认阈值配置（与 execution-service 保持一致）
const DEFAULT_THRESHOLDS = {
  min_strength: 60,  // 最低信号强度
  bot_thresholds: {
    'al-brooks': { min_score: 70, trade_score: 70 },  // PA交易: 70分推送, 70分开仓
    'trader': { min_score: 70, trade_score: 70 },     // 量化: 70分推送, 70分开仓
    'wyckoff': { min_score: 50, trade_score: 50 }     // 威科夫: 50分推送, 50分开仓
  }
};

/**
 * 获取阈值配置
 * 优先从 execution-service 同步，确保与 Web Dashboard 配置一致
 */
function getThresholds() {
  try {
    // 先尝试从本地文件读取
    if (fs.existsSync(THRESHOLDS_FILE)) {
      const data = fs.readFileSync(THRESHOLDS_FILE, 'utf8');
      const fileThresholds = JSON.parse(data);

      // 检查文件是否过期（超过10秒 - 近实时同步）
      const now = Date.now();
      const fileTime = fs.statSync(THRESHOLDS_FILE).mtimeMs;
      if (now - fileTime < 10 * 1000) {
        // 文件新鲜，直接使用
        return { ...DEFAULT_THRESHOLDS, ...fileThresholds };
      }
    }

    // 文件不存在或已过期，从 execution-service 同步
    const { execSync } = require('child_process');
    const result = execSync(
      `curl -s --max-time 2 ${EXECUTION_SERVICE_URL}/thresholds`,
      { encoding: 'utf8', timeout: 3000 }
    );
    const serviceThresholds = JSON.parse(result);

    // 保存到本地（用于下次快速读取）
    writeJsonSafe(THRESHOLDS_FILE, serviceThresholds);
    console.log('[Router] 阈值配置已从 execution-service 同步');

    return serviceThresholds;
  } catch (e) {
    console.error('[Router] Failed to sync thresholds:', e.message);

    // 尝试使用本地缓存（即使过期）
    try {
      if (fs.existsSync(THRESHOLDS_FILE)) {
        const data = fs.readFileSync(THRESHOLDS_FILE, 'utf8');
        return { ...DEFAULT_THRESHOLDS, ...JSON.parse(data) };
      }
    } catch (e2) {
      // Ignore
    }
  }

  // 最后的保底方案
  console.log('[Router] 使用默认阈值配置');
  return DEFAULT_THRESHOLDS;
}

/**
 * 获取最低信号强度阈值
 */
function getMinStrengthThreshold() {
  return getThresholds().min_strength;
}

/**
 * V3.1: 获取某 bot 对某品种的分数阈值（支持 symbol_overrides）
 * 回退链: bot_thresholds[botId].symbol_overrides[symbol] → bot_thresholds[botId] → 默认值
 */
function getBotThresholdForSymbol(botId, symbol, field, defaultVal) {
  const thresholds = getThresholds();
  const botThresh = thresholds.bot_thresholds?.[botId];
  if (!botThresh) return defaultVal;
  // 先查品种级覆盖
  const symOverride = botThresh.symbol_overrides?.[symbol]?.[field];
  if (symOverride !== undefined) return symOverride;
  // 再查 bot 级
  return botThresh[field] !== undefined ? botThresh[field] : defaultVal;
}

/**
 * V3.5: 获取策略进化数据
 */
function getStrategyEvolution(botId, strategyName) {
  try {
    const filePath = EVOLUTION_FILES[botId];
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const weights = data.strategy_weights || {};
      return weights[strategyName];
    }
  } catch (e) {
    console.log(`[Router] Error reading evolution for ${botId}: ${e.message}`);
  }
  return null;
}

/**
 * V3.5: 获取 bot-summary（10s 文件缓存）
 */
function getBotSummary(botId) {
  try {
    // 检查缓存
    if (fs.existsSync(BOT_SUMMARY_CACHE_FILE)) {
      const cacheData = JSON.parse(fs.readFileSync(BOT_SUMMARY_CACHE_FILE, 'utf8'));
      const cached = cacheData[botId];
      if (cached && (Date.now() - cached._ts) < BOT_SUMMARY_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch (e) { /* ignore cache read errors */ }

  try {
    const { execSync } = require('child_process');
    const result = execSync(
      `curl -s --max-time 3 ${EXECUTION_SERVICE_URL}/trading/bot-summary/${botId}`,
      { encoding: 'utf8', timeout: 4000 }
    );
    const summary = JSON.parse(result);

    // 写入缓存
    let cacheData = {};
    try {
      if (fs.existsSync(BOT_SUMMARY_CACHE_FILE)) {
        cacheData = JSON.parse(fs.readFileSync(BOT_SUMMARY_CACHE_FILE, 'utf8'));
      }
    } catch (e) { /* ignore */ }
    cacheData[botId] = { data: summary, _ts: Date.now() };
    writeJsonSafe(BOT_SUMMARY_CACHE_FILE, cacheData);

    return summary;
  } catch (e) {
    console.log(`[Router] getBotSummary(${botId}) 失败: ${e.message}`);
    return null;
  }
}

/**
 * V3.5: 获取今日笔记绝对路径（北京时间）
 */
function getTodayNotePath(botId) {
  const now = new Date();
  const utcHours = now.getUTCHours();
  // 北京时间 = UTC + 8
  const bjDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = bjDate.getUTCFullYear();
  const mm = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(bjDate.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const folder = BOT_NOTE_FOLDERS[botId] || 'PA交易';
  return `${OBSIDIAN_VAULT}/Daily/Trades/${dateStr}/${folder}/`;
}

/**
 * V3.5: 获取日期前缀 YYMMDD
 */
function getDatePrefix() {
  const now = new Date();
  const bjDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const yy = String(bjDate.getUTCFullYear()).slice(2);
  const mm = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(bjDate.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * V3.5: 格式化 bot 状态块（预注入到消息中）
 */
function formatBotStatusBlock(summary) {
  if (!summary) return '⚠️ 无法获取 bot 状态，请手动调用 /trading/bot-summary';

  const cfg = summary.config || {};
  const positions = summary.positions || [];
  const pnl = summary.daily_pnl || {};
  const risk = summary.risk_status || {};

  let posStr = '无持仓';
  if (positions.length > 0) {
    posStr = positions.map(p =>
      `${p.symbol} ${p.side} ${p.unrealized_pnl >= 0 ? '+' : ''}$${p.unrealized_pnl.toFixed(2)}`
    ).join(', ');
  }

  const cooldowns = risk.cooldowns || {};
  const cooldownStr = Object.keys(cooldowns).length > 0
    ? Object.entries(cooldowns).map(([sym, sec]) => `${sym}(${Math.ceil(sec/60)}m)`).join(', ')
    : '无';

  let block = `📊 **你的状态**:
- 可用资金: $${(summary.available_margin || 0).toFixed(2)} | 杠杆: ${cfg.max_leverage || 5}x | 风险: ${cfg.risk_percent || 2}%/笔
- 持仓: ${positions.length}/${cfg.max_positions || 3} (${posStr})
- 今日盈亏: 已实现 $${(pnl.realized || 0).toFixed(2)} + 浮动 $${(pnl.unrealized || 0).toFixed(2)} | 日亏损限额: $${cfg.daily_loss_limit || 50}
- 允许品种: ${(cfg.allowed_symbols || ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT']).join(',')}
- 冷却中: ${cooldownStr}`;

  // V3.6: 持仓详情注入 — agent 可据此执行 5.5 持仓管理规则
  if (positions.length > 0) {
    block += '\n📌 **当前持仓**:';
    for (const p of positions) {
      const pnlPct = p.entry_price > 0
        ? ((p.mark_price - p.entry_price) / p.entry_price * 100 * (p.side === 'short' ? -1 : 1)).toFixed(2)
        : '?';
      block += `\n  ${p.side === 'long' ? '做多' : '做空'} ${p.symbol} 入场=${p.entry_price} 现价=${p.mark_price} 浮盈=${pnlPct}%`;
    }
    block += '\n⚡ 如果新信号与持仓冲突，请按 5.5 规则处理';
  }

  return block;
}

/**
 * 向次要目标 agent 的 hook 路径发送异步请求（V3.4 多目标路由）
 * 在 payload 中添加 _secondary 标记防止循环触发
 */
function triggerSecondaryAgent(targetBot, payload) {
  const hookPath = HOOK_PATHS[targetBot];
  if (!hookPath) {
    console.log(`[Router] Unknown secondary target: ${targetBot}`);
    return;
  }

  const secondaryPayload = {
    ...payload,
    _secondary: true,
    _forced_target: targetBot
  };

  const postData = JSON.stringify(secondaryPayload);

  const options = {
    hostname: '127.0.0.1',
    port: 18789,
    path: `/hooks/${hookPath}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HOOK_TOKEN}`,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`[Router] Secondary hook → ${targetBot} (${hookPath}): ${res.statusCode}`);
  });

  req.on('error', (e) => {
    console.error(`[Router] Secondary hook to ${targetBot} failed: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

// Discord 频道配置
const CHANNELS = {
  'al-brooks': '1468430213196288052',     // #pa交易
  trader: '1468430143302406379',          // #量化交易
  wyckoff: '1469202819461681306',         // #威科夫
  'al-brooks-teacher': '1468430254560510043',  // #al-brooks (学习老师)
  'ab-admin': '1468430298407768239'       // #ab系统管理
};

// 机器人配置
const BOTS = {
  'al-brooks': {
    name: 'PA交易',
    agent: 'al-brooks',
    channel: CHANNELS['al-brooks'],
    skill: 'al-brooks-simtrade',
    description: 'Al Brooks 价格行为交易执行'
  },
  trader: {
    name: '量化交易',
    agent: 'trader',
    channel: CHANNELS.trader,
    skill: 'quant-analysis',
    description: '量化分析与交易（独立于 PA 分析）'
  },
  wyckoff: {
    name: '威科夫',
    agent: 'wyckoff',
    channel: CHANNELS.wyckoff,
    skill: 'wyckoff-analysis',
    description: '威科夫量价分析'
  },
  'al-brooks-teacher': {
    name: 'Al Brooks 老师',
    agent: 'al-brooks-teacher',
    channel: CHANNELS['al-brooks-teacher'],
    skill: 'al-brooks-teacher',
    description: 'Al Brooks 价格行为学习指导'
  },
  'ab-admin': {
    name: 'AB系统管理',
    agent: 'ab-admin',
    channel: CHANNELS['ab-admin'],
    skill: 'ab-system-admin',
    description: '系统维护与管理'
  }
};

/**
 * 安全读取 JSON 文件
 */
function readJsonSafe(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.log(`[Router] Error reading ${filePath}: ${e.message}`);
  }
  return defaultValue;
}

/**
 * 安全写入 JSON 文件
 */
function writeJsonSafe(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.log(`[Router] Error writing ${filePath}: ${e.message}`);
    return false;
  }
}

/**
 * 检查交易状态 (V3.1 新增)
 * 从 execution-service 获取交易开关状态
 * 使用缓存减少 API 调用（缓存 30 秒）
 */
function getTradingState() {
  const CACHE_TTL_MS = 10 * 1000; // 10 秒缓存（V3.4: 从 30 秒缩短）

  // 读取缓存
  const cache = readJsonSafe(TRADING_STATE_CACHE_FILE, {});
  const now = Date.now();

  if (cache.timestamp && (now - cache.timestamp) < CACHE_TTL_MS) {
    return cache.state;
  }

  // 同步 HTTP 请求获取状态（使用 child_process）
  try {
    const { execSync } = require('child_process');
    const result = execSync(
      `curl -s --max-time 2 ${EXECUTION_SERVICE_URL}/trading/status`,
      { encoding: 'utf8', timeout: 3000 }
    );
    const state = JSON.parse(result);

    // 更新缓存
    writeJsonSafe(TRADING_STATE_CACHE_FILE, {
      timestamp: now,
      state: state
    });

    return state;
  } catch (e) {
    console.log(`[Router] 获取交易状态失败: ${e.message}`);
    // 返回缓存的旧状态或默认值
    return cache.state || { trading_enabled: false, allocations: {} };
  }
}

/**
 * 检查机器人是否可以交易 (V3.1 新增)
 */
function canBotTrade(botId) {
  const state = getTradingState();

  if (!state.trading_enabled) {
    return { can_trade: false, reason: '交易开关未开启' };
  }

  const alloc = state.allocations?.[botId];
  if (!alloc) {
    return { can_trade: false, reason: `未知机器人: ${botId}` };
  }

  if (!alloc.enabled) {
    return { can_trade: false, reason: `${alloc.name} 已禁用` };
  }

  if (alloc.current_positions >= alloc.max_positions) {
    return { can_trade: false, reason: `已达最大持仓数 (${alloc.current_positions}/${alloc.max_positions})` };
  }

  return {
    can_trade: true,
    reason: 'OK',
    allocation: alloc
  };
}

/**
 * 生成信号唯一键（用于去重）
 * 相同品种 + 方向 + 路由目标 = 相同信号
 */
function getSignalKey(payload, routeTarget) {
  return `${payload.symbol}_${payload.direction || 'analysis'}_${routeTarget}`;
}

/**
 * 检查信号是否重复
 * @returns {boolean} true = 重复，应跳过
 */
function isDuplicateSignal(payload, routeTarget) {
  const key = getSignalKey(payload, routeTarget);
  const now = Date.now();

  // 读取去重缓存
  const dedupCache = readJsonSafe(SIGNAL_DEDUP_FILE, { signals: {} });

  // 清理过期条目
  const signals = dedupCache.signals || {};
  for (const k of Object.keys(signals)) {
    if (now - signals[k] > DEDUP_WINDOW_MS) {
      delete signals[k];
    }
  }

  // 检查是否重复
  if (signals[key] && (now - signals[key]) < DEDUP_WINDOW_MS) {
    const ageSeconds = Math.round((now - signals[key]) / 1000);
    console.log(`[Router] DEDUP: ${key} 在 ${ageSeconds}s 前已处理，跳过`);
    return true;
  }

  // 记录新信号
  signals[key] = now;
  dedupCache.signals = signals;
  dedupCache.last_cleanup = now;
  writeJsonSafe(SIGNAL_DEDUP_FILE, dedupCache);

  return false;
}

/**
 * V3.7: 检查信号是否在拒绝冷却中（30 分钟）
 * 当 bot 无法交易或暴露过高时，记录拒绝，后续同品种同方向直接跳过
 */
function isRejectionCooling(symbol, direction, target) {
  const key = `reject_${symbol}_${direction || 'analysis'}_${target}`;
  const cache = readJsonSafe(SIGNAL_DEDUP_FILE, { signals: {}, rejections: {} });
  const ts = (cache.rejections || {})[key];
  if (ts && (Date.now() - ts) < REJECTION_COOLDOWN_MS) {
    const ageMin = Math.round((Date.now() - ts) / 60000);
    console.log(`[Router] REJECTION_COOL: ${key} 在 ${ageMin}m 前被拒，冷却中`);
    return true;
  }
  return false;
}

function recordRejection(symbol, direction, target) {
  const key = `reject_${symbol}_${direction || 'analysis'}_${target}`;
  const cache = readJsonSafe(SIGNAL_DEDUP_FILE, { signals: {}, rejections: {} });
  if (!cache.rejections) cache.rejections = {};
  cache.rejections[key] = Date.now();
  writeJsonSafe(SIGNAL_DEDUP_FILE, cache);
}

/**
 * V3.8: 全局会话预算检查
 * 限制每 SESSION_BUDGET_WINDOW_MS 内最多创建 SESSION_BUDGET_MAX 个 agent session
 * 防止 Kimi API 额度过快消耗
 * @returns {boolean} true = 超出预算，应跳过
 */
function isSessionBudgetExhausted() {
  const now = Date.now();
  // 清理过期记录
  while (sessionBudgetLog.length > 0 && (now - sessionBudgetLog[0]) > SESSION_BUDGET_WINDOW_MS) {
    sessionBudgetLog.shift();
  }
  if (sessionBudgetLog.length >= SESSION_BUDGET_MAX) {
    const oldestAge = Math.round((now - sessionBudgetLog[0]) / 1000);
    const nextSlot = Math.round((SESSION_BUDGET_WINDOW_MS - (now - sessionBudgetLog[0])) / 1000);
    console.log(`[Router] BUDGET: ${sessionBudgetLog.length}/${SESSION_BUDGET_MAX} sessions in ${Math.round(SESSION_BUDGET_WINDOW_MS/60000)}min (oldest ${oldestAge}s ago), 下次空位 ${nextSlot}s 后`);
    return true;
  }
  return false;
}

function recordSessionCreated() {
  sessionBudgetLog.push(Date.now());
}

/**
 * 获取品种的活跃交易数量
 */
function getActiveTradesForSymbol(symbol) {
  const data = readJsonSafe(ACTIVE_TRADES_FILE, { active_trades: [] });
  return (data.active_trades || []).filter(
    t => t.symbol === symbol && t.status === 'active'
  );
}

/**
 * 预过滤检查
 */
function preFilter(payload, symbolStats) {
  const symbol = payload.symbol;
  const strength = payload.strength || 0;
  const stats = symbolStats[symbol]?.today || {};

  // 基础强度检查 (可通过 execution-service 动态配置)
  const minStrength = getMinStrengthThreshold();
  if (strength < minStrength) {
    return { reject: true, reason: `强度 ${strength} < ${minStrength}` };
  }

  // 连续失败检查
  if (stats.consecutive_losses >= 10) {
    return { reject: true, reason: `${symbol} 连续失败 ${stats.consecutive_losses} 次，暂停` };
  }

  // 活跃交易集中度检查
  const activeTrades = getActiveTradesForSymbol(symbol);
  if (activeTrades.length >= 7) {
    return { reject: true, reason: `${symbol} 活跃交易 ${activeTrades.length} 笔，风险集中` };
  }

  return { reject: false, activeTrades: activeTrades.length };
}

/**
 * 获取北京时间字符串
 */
function getBeijingTimeStr() {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const beijingHours = (utcHours + 8) % 24;
  return `${String(beijingHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}`;
}

/**
 * 路由到 PA交易 Al Brooks (Al Brooks 价格行为)
 */
function routeToAlBrooks(payload, symbolStats, filterResult) {
  const timeStr = getBeijingTimeStr();
  const symbol = payload.symbol;
  const stats = symbolStats[symbol] || {};

  // V3.5: 获取 bot-summary
  const botSummary = getBotSummary('al-brooks');
  const canExecuteTrade = botSummary?.can_trade || false;
  const tradingCheck = { can_trade: canExecuteTrade, reason: botSummary?.can_trade_reason || '未知' };

  // 计算调整后评分
  let adjustedScore = payload.strength || 0;
  const reasons = [];

  // 1. 进化系统权重修正 (V3.5 新增 - 优先于死板的规则)
  const strategyName = payload.strategy || payload.rule_name || 'unknown';
  const evoStats = getStrategyEvolution('al-brooks', strategyName);
  let evoMessage = `\n🧠 **进化记忆**: 策略[${strategyName}] 尚无历史数据`;

  if (evoStats) {
    const w = evoStats.weight || 70;
    const winRate = evoStats.trades > 0 ? Math.round((evoStats.wins / evoStats.trades) * 100) : 0;

    evoMessage = `\n🧠 **进化记忆**: 策略[${strategyName}] 权重 ${w} | 胜率 ${winRate}% (${evoStats.wins}/${evoStats.trades})`;

    if (w < 40) {
      adjustedScore -= 100; // 直接枪毙
      reasons.push(`策略废弃(权重${w}<40), 阻断`);
      evoMessage += ' ⛔ **已废弃，禁止交易**';
    } else if (w < 60) {
      adjustedScore -= 15;
      reasons.push(`策略表现差(权重${w}), -15`);
      evoMessage += ' ⚠️ **表现不佳，慎重！**';
    } else if (w < 70) {
      adjustedScore -= 5;
      reasons.push(`策略平庸(权重${w}), -5`);
    } else if (w >= 85) {
      adjustedScore += 10;
      reasons.push(`策略卓越(权重${w}), +10`);
      evoMessage += ' 🔥 **王牌策略**';
    } else if (w >= 75) {
      adjustedScore += 5;
      reasons.push(`策略优秀(权重${w}), +5`);
    }
  }

  // 2. 连败惩罚
  if (stats.today?.consecutive_losses >= 5) {
    const penalty = Math.min(stats.today.consecutive_losses * 3, 20);
    adjustedScore -= penalty;
    reasons.push(`连续失败 ${stats.today.consecutive_losses} 次，-${penalty}`);
  }

  // 3. 基础权重修正
  const weight = stats.weight || 70;
  if (weight < 60) {
    adjustedScore -= 5;
    reasons.push(`品种权重低 (${weight})，-5`);
  } else if (weight >= 80) {
    adjustedScore += 3;
    reasons.push(`品种权重高 (${weight})，+3`);
  }

  if (filterResult.activeTrades >= 5) {
    adjustedScore -= 10;
    reasons.push(`活跃交易 ${filterResult.activeTrades} 笔，-10`);
  }

  // V3.1: 品种级阈值（BNBUSDT 等可独立配置更高门槛）
  const minScoreForSymbol = getBotThresholdForSymbol('al-brooks', symbol, 'min_score', 75);
  if (adjustedScore < minScoreForSymbol) {
    return null;
  }

  // V3.5: 动态路径
  const notePath = getTodayNotePath('al-brooks');
  const datePrefix = getDatePrefix();
  const statusBlock = formatBotStatusBlock(botSummary);

  const tradingStatusLine = canExecuteTrade
    ? '🟢 交易开关: 已开启'
    : `🔴 交易开关: ${tradingCheck.reason}`;

  const tradeScoreForSymbol = getBotThresholdForSymbol('al-brooks', symbol, 'trade_score', 80);
  const executionInstruction = canExecuteTrade && adjustedScore >= tradeScoreForSymbol
    ? `\n⚡ **必须执行**: 评分 >= ${tradeScoreForSymbol} 且交易开关已开启，你 **必须** 使用 exec 工具执行 curl 命令向 ${EXECUTION_SERVICE_URL}/order 下单！先调用 /trading/calculate-size/al-brooks 计算仓位，再 POST /order 下单。下单后将 order_id 写入笔记和 active_trades。`
    : '';

  const message = `
🦁 **PA信号** [${timeStr}] ${symbol} ${payload.direction} ${payload.strength}%→${adjustedScore}
周期: ${payload.timeframe || '5m'} | 价格: ${payload.price > 0 ? '$' + payload.price.toLocaleString() : 'API获取'}
统计: 权重${weight} 活跃${filterResult.activeTrades}笔 连败${stats.today?.consecutive_losses || 0}
${reasons.length > 0 ? '调整: ' + reasons.join('; ') : ''}

${statusBlock}${evoMessage}
${tradingStatusLine}${executionInstruction}

按 SKILL.md 规则分析，推送到 #pa交易 (1468430213196288052)
⚠️ 笔记绝对路径: ${notePath}
⚠️ 文件名: ${datePrefix}_${timeStr.replace(':', '')}_模拟_${symbol}.md
⚠️ 止损: 如信号无SL/TP，自算（做多SL=入场×0.985, TP=入场+(入场-SL)×2）
⚠️ 正文最短，只要 frontmatter + 3行摘要
⛔ **笔记门禁**: 评分 < 80 或 can_trade=false 时，**禁止创建 .md 文件**，仅 Discord 一行摘要
`;

  return {
    name: 'PA交易 Al Brooks 信号',
    agent: 'al-brooks',
    message: message.trim(),
    context: {
      signal: payload,
      symbol_stats: stats,
      adjusted_score: adjustedScore,
      active_trades: filterResult.activeTrades,
      can_execute_trade: canExecuteTrade,
      trading_check: tradingCheck,
      bot_summary: botSummary,
      note_absolute_path: notePath,
      account_file: ACCOUNT_FILES['al-brooks'],
      active_trades_file: ACTIVE_TRADES_FILES['al-brooks'],
      execution_service_url: EXECUTION_SERVICE_URL,
      skill_module: 'SKILL-CORE.md'
    },
    session_config: {
      type: 'ephemeral',
      max_turns: 4, // V3.8.3: 2→4 恢复交易能力（分析→计算仓位→下单→写笔记）
      ttl_minutes: 5, // V3.8.3: 3→5min 给完整流程留足时间
      no_memory: true,
      model_hint: 'sonnet'
    }
  };
}

/**
 * 路由到威科夫
 */
function routeToWyckoff(payload, symbolStats) {
  const timeStr = getBeijingTimeStr();
  const symbol = payload.symbol;

  // V3.5: 获取 bot-summary
  const botSummary = getBotSummary('wyckoff');
  const canExecuteTrade = botSummary?.can_trade || false;
  const tradingCheck = { can_trade: canExecuteTrade, reason: botSummary?.can_trade_reason || '未知' };

  const notePath = getTodayNotePath('wyckoff');
  const datePrefix = getDatePrefix();
  const statusBlock = formatBotStatusBlock(botSummary);

  const tradingStatusLine = canExecuteTrade
    ? '🟢 交易开关: 已开启'
    : `🔴 交易开关: ${tradingCheck.reason}`;

  const executionInstruction = canExecuteTrade
    ? `\n⚡ **必须执行**: 如果分析评分 >= 80，你 **必须** 使用 exec 工具执行 curl 命令向 ${EXECUTION_SERVICE_URL}/order 下单！先 /trading/calculate-size/wyckoff 计算仓位，再 POST /order。`
    : '';

  const message = `
📈 **威科夫分析请求** [${timeStr}] [${payload.timeframe || '1h'}]

**品种**: ${symbol} | **周期**: ${payload.timeframe || '1h'} | **价格**: ${payload.price > 0 ? '$' + payload.price.toLocaleString() : '待获取'}
**触发**: ${payload.trigger_reason || '定时分析'}

${statusBlock}
${tradingStatusLine}${executionInstruction}

**身份**: 威科夫大师，使用 wyckoff-analysis skill。
**禁止**: 不用 Al Brooks 术语，不自称小明或 PA交易。

分析要点：价格周期 → 五阶段定位 → 关键事件 → 量价行为 → 操作建议

**账户**: ${ACCOUNT_FILES.wyckoff}
**活跃交易**: ${ACTIVE_TRADES_FILES.wyckoff}
推送到 #威科夫 (${CHANNELS.wyckoff})
⚠️ 笔记绝对路径: ${notePath}
⚠️ 文件名: ${datePrefix}_${timeStr.replace(':', '')}_威科夫_${symbol}.md
⚠️ 正文最短，只要 frontmatter + 3行摘要
⛔ **笔记门禁**: 评分 < 80 或 can_trade=false 时，**禁止创建 .md 文件**，仅 Discord 一行摘要
`;

  return {
    name: '威科夫分析',
    agent: 'wyckoff',
    message: message.trim(),
    context: {
      symbol: symbol,
      price: payload.price,
      request_type: 'wyckoff_analysis',
      can_execute_trade: canExecuteTrade,
      trading_check: tradingCheck,
      bot_summary: botSummary,
      note_absolute_path: notePath,
      account_file: ACCOUNT_FILES.wyckoff,
      active_trades_file: ACTIVE_TRADES_FILES.wyckoff,
      execution_service_url: EXECUTION_SERVICE_URL
    },
    session_config: {
      type: 'ephemeral',
      max_turns: 4, // V3.8.3: 2→4 恢复交易能力（分析→计算仓位→下单→写笔记）
      ttl_minutes: 5, // V3.8.3: 3→5min 给完整流程留足时间
      no_memory: true
    }
  };
}

/**
 * 路由到量化分析师 (trader)
 * 简洁 prompt，详细分析在 quant-analysis skill 中
 */
function routeToTrader(payload, symbolStats) {
  const timeStr = getBeijingTimeStr();
  const symbol = payload.symbol;

  // V3.5: 获取 bot-summary
  const botSummary = getBotSummary('trader');
  const canExecuteTrade = botSummary?.can_trade || false;
  const tradingCheck = { can_trade: canExecuteTrade, reason: botSummary?.can_trade_reason || '未知' };

  const notePath = getTodayNotePath('trader');
  const datePrefix = getDatePrefix();
  const statusBlock = formatBotStatusBlock(botSummary);

  const tradingStatusLine = canExecuteTrade
    ? '🟢 交易开关: 已开启'
    : `🔴 交易开关: ${tradingCheck.reason}`;

  const executionInstruction = canExecuteTrade
    ? `\n⚡ **必须执行**: 如果评分 >= 80，你 **必须** 使用 exec 工具执行 curl 命令向 ${EXECUTION_SERVICE_URL}/order 下单！先 /trading/calculate-size/trader 计算仓位，再 POST /order。`
    : '';

  const message = `
📊 **量化快评** [${timeStr}] [${payload.timeframe || '4h'}]

**品种**: ${symbol} | **价格**: ${payload.price > 0 ? '$' + payload.price.toLocaleString() : '待获取'} | **周期**: ${payload.timeframe || '4h'}

${statusBlock}
${tradingStatusLine}${executionInstruction}

**身份**: 量化分析师，使用 quant-analysis skill。
**禁止**: 不用 Al Brooks 术语，不自称小明，不用 🦁。
**必须**: 用量化术语（RSI、MACD、布林带、多周期共振），用 📊。

评估：多周期共振 → 支撑/阻力 → 综合评分

**账户**: ${ACCOUNT_FILES.trader}
**活跃交易**: ${ACTIVE_TRADES_FILES.trader}
评分 >= 80 创建交易 + 下单，70-79 仅报告。推送到 #量化交易。
⚠️ 笔记绝对路径: ${notePath}
⚠️ 文件名: ${datePrefix}_${timeStr.replace(':', '')}_量化_${symbol}.md
⚠️ 正文最短，只要 frontmatter + 3行摘要
⚠️ active_trades.json: 先读后追加，禁止覆盖
⛔ **笔记门禁**: 评分 < 80 或 can_trade=false 时，**禁止创建 .md 文件**，仅 Discord 一行摘要
`;

  return {
    name: '量化分析',
    agent: 'trader',
    message: message.trim(),
    context: {
      symbol: symbol,
      price: payload.price,
      timeframe: payload.timeframe || '4h',
      request_type: 'quant_analysis',
      can_execute_trade: canExecuteTrade,
      trading_check: tradingCheck,
      bot_summary: botSummary,
      note_absolute_path: notePath,
      account_file: ACCOUNT_FILES.trader,
      active_trades_file: ACTIVE_TRADES_FILES.trader,
      execution_service_url: EXECUTION_SERVICE_URL
    },
    session_config: {
      type: 'ephemeral',
      max_turns: 4, // V3.8.3: 2→4 恢复交易能力（分析→计算仓位→下单→写笔记）
      ttl_minutes: 5, // V3.8.3: 3→5min 给完整流程留足时间
      no_memory: true
    }
  };
}

/**
 * 主 transform 函数
 */
module.exports = function transform(ctx) {
  const payload = ctx.payload;

  // 全局暂停检查
  if (SIGNALS_PAUSED) {
    console.log(`[Router] PAUSED — ${payload.symbol || 'unknown'} 信号已丢弃`);
    return null;
  }

  // 验证必要字段
  if (!payload.symbol) {
    console.log('[Router] Invalid payload - missing symbol');
    return null;
  }

  // 确定路由目标 (优先级: route_to > category/subcategory > bot > 默认)
  let routeTarget = payload.route_to || payload.bot;

  // 如果没有明确指定，根据 category/subcategory 自动路由
  if (!routeTarget && payload.category) {
    // 先检查子类别
    if (payload.subcategory && SUBCATEGORY_ROUTING[payload.subcategory]) {
      routeTarget = SUBCATEGORY_ROUTING[payload.subcategory];
    } else {
      // 再检查主类别
      routeTarget = CATEGORY_ROUTING[payload.category] || 'al-brooks';
    }
  }

  // 默认路由
  routeTarget = routeTarget || 'al-brooks';

  console.log(`[Router] Processing: ${payload.symbol} [${payload.category}/${payload.subcategory}] → ${routeTarget}`);

  // 检查是否需要多路由 (V3.4: 真正实现多目标路由)
  const ruleName = payload.rule_name || payload.name;
  const multiTargets = ruleName ? MULTI_ROUTE_RULES[ruleName] : null;

  // 次要请求：强制路由到指定目标，跳过多路由逻辑
  if (payload._secondary && payload._forced_target) {
    routeTarget = payload._forced_target;
    console.log(`[Router] Secondary request → ${routeTarget}`);
  } else if (multiTargets && multiTargets.length > 1) {
    console.log(`[Router] Multi-route rule: ${ruleName} → ${multiTargets.join(', ')}`);
    // 主目标由 transform 返回
    routeTarget = multiTargets[0];
    // 次要目标通过 webhook 异步触发
    for (let i = 1; i < multiTargets.length; i++) {
      const secondaryTarget = multiTargets[i];
      if (!isDuplicateSignal(payload, secondaryTarget)) {
        console.log(`[Router] Triggering secondary → ${secondaryTarget}`);
        triggerSecondaryAgent(secondaryTarget, payload);
      } else {
        console.log(`[Router] Secondary ${secondaryTarget} deduped, skipping`);
      }
    }
  }

  // V3.9.3: 强信号(>=80)多路由到所有 agent（补充 MULTI_ROUTE_RULES 之外的目标）
  if (!payload._secondary && payload.strength >= 80 && payload.direction) {
    const ALL_BOTS = ['al-brooks', 'trader', 'wyckoff'];
    const alreadyRouted = new Set(multiTargets || [routeTarget]);
    alreadyRouted.add(routeTarget); // 确保主目标在集合中
    for (const bot of ALL_BOTS) {
      if (!alreadyRouted.has(bot) && !isDuplicateSignal(payload, bot)) {
        console.log(`[Router] Strong signal (strength=${payload.strength}) → secondary ${bot}`);
        triggerSecondaryAgent(bot, payload);
      }
    }
  }

  // 信号去重检查（15 分钟内相同信号跳过）
  if (isDuplicateSignal(payload, routeTarget)) {
    return null;
  }

  // V3.8: 全局会话预算检查（防止 Kimi API 额度过快消耗）
  if (isSessionBudgetExhausted()) {
    return null;
  }

  // V3.7: 拒绝冷却检查（30 分钟内被拒的同品种同方向信号直接跳过）
  if (isRejectionCooling(payload.symbol, payload.direction, routeTarget)) {
    return null;
  }

  // V3.9.1: 暴露预检 — bot 无法交易或暴露过高时记录拒绝并跳过
  // 注: correlation_exposure_pct 是 per-bot 值（该 bot 持仓/全局余额），
  //     risk_manager 的 check_correlation 用 60% 阈值（V3.9.1 per-bot 独立）。Router 与之对齐。
  if (payload.direction) {
    const summary = getBotSummary(routeTarget);
    if (summary) {
      const corrPct = summary.risk_status?.correlation_exposure_pct || 0;
      if (!summary.can_trade) {
        console.log(`[Router] PRE-REJECT: ${routeTarget} can_trade=false (${summary.can_trade_reason})`);
        recordRejection(payload.symbol, payload.direction, routeTarget);
        return null;
      }
      if (corrPct > 60) {
        console.log(`[Router] PRE-REJECT: ${routeTarget} 暴露 ${corrPct}% > 60%`);
        recordRejection(payload.symbol, payload.direction, routeTarget);
        return null;
      }
      // V3.7: 同品种同方向持仓检查
      if (summary.positions && summary.positions.length > 0) {
        const sym = payload.symbol.replace(':USDT', '');
        const samePos = summary.positions.find(
          p => p.symbol.replace(':USDT', '') === sym
        );
        if (samePos) {
          const sameDir = (
            (payload.direction === 'BUY' && samePos.side === 'LONG') ||
            (payload.direction === 'SELL' && samePos.side === 'SHORT')
          );
          if (sameDir) {
            console.log(`[Router] PRE-REJECT: ${routeTarget} 已持有 ${sym} ${samePos.side}`);
            recordRejection(payload.symbol, payload.direction, routeTarget);
            return null;
          }
        }
      }
    }
  }

  // 读取预计算统计
  const symbolStats = readJsonSafe(SYMBOL_STATS_FILE, {});

  // 预过滤（仅对交易信号）
  if (routeTarget === 'al-brooks' && payload.direction) {
    const filterResult = preFilter(payload, symbolStats);
    if (filterResult.reject) {
      console.log(`[Router] Signal REJECTED: ${filterResult.reason}`);
      return null;
    }

    const result = routeToAlBrooks(payload, symbolStats, filterResult);
    if (!result) {
      console.log('[Router] Signal filtered out after score adjustment');
      return null;
    }
    recordSessionCreated();
    const alSummary = getBotSummary('al-brooks');
    return applyTurnsOptimization(result, alSummary?.can_trade);
  }

  // 威科夫分析请求
  if (routeTarget === 'wyckoff') {
    const result = routeToWyckoff(payload, symbolStats);
    if (!result) return null;
    recordSessionCreated();
    const summary = getBotSummary('wyckoff');
    return applyTurnsOptimization(result, summary?.can_trade);
  }

  // 量化分析请求
  if (routeTarget === 'trader') {
    const result = routeToTrader(payload, symbolStats);
    if (!result) return null;
    recordSessionCreated();
    const summary = getBotSummary('trader');
    return applyTurnsOptimization(result, summary?.can_trade);
  }

  // 默认路由到 PA交易 Al Brooks
  console.log(`[Router] Unknown route target: ${routeTarget}, defaulting to al-brooks (PA交易 Al Brooks)`);
  const filterResult = preFilter(payload, symbolStats);
  if (filterResult.reject) {
    return null;
  }
  const result = routeToAlBrooks(payload, symbolStats, filterResult);
  if (!result) return null;
  recordSessionCreated();
  const defaultSummary = getBotSummary('al-brooks');
  return applyTurnsOptimization(result, defaultSummary?.can_trade);
};

/**
 * V3.8.3: 动态 max_turns 优化（修复 V3.8.1 的硬编码问题）
 * - 可交易信号: 保持 max_turns=4 (分析→计算仓位→下单→写笔记)
 * - 不可交易信号: max_turns=2 (只需: 分析→一行摘要)
 * 根源修复后（realtime throttle + edge interval），可安全恢复交易能力
 */
function applyTurnsOptimization(routeResult, canTrade) {
  if (!routeResult || !routeResult.session_config) return routeResult;
  if (!canTrade) {
    routeResult.session_config.max_turns = 2;
    routeResult.session_config.ttl_minutes = 3;
    console.log(`[Router] TURNS_OPT: ${routeResult.agent} can_trade=false → max_turns=2, ttl=3min`);
  } else {
    console.log(`[Router] TURNS_OPT: ${routeResult.agent} can_trade=true → max_turns=4, ttl=5min`);
  }
  return routeResult;
}

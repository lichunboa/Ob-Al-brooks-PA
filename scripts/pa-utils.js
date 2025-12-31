/* 文件名: Scripts/pa-utils.js (v5.1 Safe-Guarded)
   用途: 通用工具函数库 (数据清洗、计算、防崩代理)
   变更: 引入全套 Type-Safe Accessors，确保永远返回有效类型而非 undefined/null，杜绝红框报错。
*/

// ============================================================
// 0. Base Safeties (基础安全层)
// ============================================================

/**
 * 提取标量值：如果是数组/Proxy，取第一个元素；如果是标量，原样返回。
 */
function firstScalar(val) {
  try {
    if (val === undefined || val === null) return null;
    if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
    // 处理 Metadata Menu 的 Proxy 对象
    if (val?.constructor && val.constructor.name === "Proxy") {
      const arr = Array.from(val);
      return arr.length > 0 ? arr[0] : null;
    }
    return val;
  } catch (e) {
    console.error("PA-Utils: firstScalar error", e);
    return null;
  }
}

/**
 * 强制转数组：如果是标量，转为 [val]；如果是空，返回 []。
 */
function toArraySafe(val) {
  try {
    if (val === undefined || val === null) return [];
    if (Array.isArray(val)) return val;
    if (val?.constructor && val.constructor.name === "Proxy") {
      return Array.from(val);
    }
    return [val];
  } catch (e) {
    return [];
  }
}

/**
 * 括号清洗器：分离 "Key (Value)" 结构
 */
function parseParenPair(s) {
  try {
    if (!s) return null;
    const str = s.toString().trim();
    if (!str.includes("(") || !str.endsWith(")")) return null;
    const parts = str.split("(");
    const left = (parts[0] || "").trim();
    const right = parts
      .slice(1)
      .join("(")
      .replace(/\)\s*$/, "")
      .trim();
    return { left, right };
  } catch (e) {
    return null;
  }
}

// ============================================================
// 1. Type-Safe Accessors (类型安全访问器 - 核心)
// ============================================================

/**
 * 安全获取字符串 (safeStr)
 * @param {object} page - Dataview page 对象
 * @param {string|string[]} keys - 属性键名（支持数组备选）
 * @param {string} fallback - 默认值 (默认为 "Unknown")
 * @returns {string} 永远返回字符串，不会是 null/undefined
 */
function safeStr(page, keys, fallback = "Unknown") {
  try {
    // 允许 keys 传入单个字符串
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (let k of keyList) {
      if (!page) continue;
      let val = page[k];
      
      // 深度清洗：如果是数组，取第一个非空值
      const arr = toArraySafe(val);
      const first = arr.find(x => x !== null && x !== undefined && x !== "");
      
      if (first !== undefined && first !== null) {
        // 简单清洗逻辑：移除 WikiLink 的 [[ ]] 壳
        let s = first.toString().trim();
        // 如果是 Link 对象 (Dataview Link)
        if (first.path && first.display !== undefined) {
             // 优先取 display, 否则取 path (去后缀)
             if (first.display) s = first.display;
             else s = first.path.replace(/\.md$/i, "").split("/").pop();
        }
        
        // 业务清洗：移除 (English) 或 /English
        if (s.match(/[a-zA-Z]/)) {
            // 特殊处理：如果是 "中文 (English)" 格式，我们通常只想要 clean 的部分
            // 注意：这里保留原逻辑 -> "Long" (从 "做多 (Long)")
            if (s.includes("(") && s.endsWith(")")) {
                const pair = parseParenPair(s);
                 // 策略：如果括号内是英文，优先取括号内；否则取括号外
                 if (pair && /[a-zA-Z]/.test(pair.right)) return pair.right;
                 if (pair) return pair.left;
            }
            if (s.includes("/") && !s.startsWith("/")) {
                // "中文/English" -> "English"
                 const parts = s.split("/");
                 if (parts.length > 1 && /[a-zA-Z]/.test(parts[1])) return parts[1].trim();
            }
        }
        
        // 移除纯括号残留
        return s.split("(")[0].trim() || fallback;
      }
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * 安全获取数值 (safeNum)
 * @returns {number} 永远返回数字，NaN 会被转为 0
 */
function safeNum(page, keys, fallback = 0) {
  try {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (let k of keyList) {
      if (!page) continue;
      let val = page[k];
      // 取第一个标量
      val = firstScalar(val);
      
      if (val !== undefined && val !== null && val !== "") {
        let n = Number(val);
        if (!isNaN(n)) return n;
      }
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * 安全获取数组 (safeArr)
 * @returns {string[]} 永远返回字符串数组
 */
function safeArr(page, keys) {
  try {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (let k of keyList) {
      if (!page) continue;
      let val = page[k];
      if (val !== undefined && val !== null) {
        const arr = toArraySafe(val);
        // 过滤空值并转字符串
        return arr.map(x => (x ? x.toString().trim() : "")).filter(Boolean);
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

/**
 * 获取原始字符串 (不清洗)
 */
function getRawStr(page, keys, fallback = "Unknown") {
  try {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (let k of keyList) {
        if (!page) continue;
        const val = firstScalar(page[k]);
        if (val !== undefined && val !== null) {
            const s = val.toString().trim();
            if (s) return s;
        }
    }
    return fallback;
  } catch (e) {
      return fallback;
  }
}

// ============================================================
// 2. Business Normalizers (业务归一化)
// ============================================================

function normalizeTickerKey(raw) {
  if (!raw || raw === "Unknown") return "Unknown";
  const s = raw.toString();
  const pair = parseParenPair(s);
  const left = (pair?.left || s).trim();
  const right = (pair?.right || "").trim();

  const pickCode = (v) => {
    if (!v) return "";
    const token = v.split(/[\s/]+/)[0].trim();
    if (/^[A-Za-z]{1,6}$/.test(token)) return token.toUpperCase();
    return "";
  };
  return pickCode(left) || pickCode(right) || "Unknown";
}

function normalizeTimeframeKey(raw) {
  if (!raw || raw === "Unknown") return "Unknown";
  const s = raw.toString().trim();
  // 提取可能的数字+字母组合
  const match = s.match(/(\d+)\s*([mMhHdD])/i);
  if (match) {
      const num = match[1];
      const unit = match[2].toLowerCase();
      if (unit === 'm') return num + "m";
      if (unit === 'h') return num + "H";
      if (unit === 'd') return "Daily";
  }
  if (/^daily$/i.test(s) || /^1d$/i.test(s)) return "Daily";
  return "Unknown";
}

function normalizeDirectionKey(raw) {
  if (!raw || raw === "Unknown") return "Unknown";
  const s = raw.toString().toLowerCase();
  
  // 强匹配
  if (s === 'long' || s === 'short') return s.charAt(0).toUpperCase() + s.slice(1);
  if (s.includes("做多") || /\blong\b/.test(s)) return "Long";
  if (s.includes("做空") || /\bshort\b/.test(s)) return "Short";
  return "Unknown";
}

function normalizeEnumKey(raw) {
  if (!raw || raw === "Unknown") return "Unknown";
  const s = raw.toString().trim();
  
  // 1. 尝试解析 (English)
  const pair = parseParenPair(s);
  if (pair) {
     if (/[A-Za-z]/.test(pair.right)) return pair.right;
     if (/[A-Za-z]/.test(pair.left)) return pair.left;
     return pair.right || pair.left || s;
  }
  
  // 2. 尝试解析 /English
  if (s.includes("/")) {
      const parts = s.split("/");
      const last = parts[parts.length - 1].trim();
      if (/[A-Za-z]/.test(last)) return last;
  }
  
  return s;
}

// Brooks 术语映射字典
const BROOKS_MAP = {
    "逆1顺1": "High 1/Low 1",
    "高1/低1": "High 1/Low 1",
    "High 1/Low 1": "High 1/Low 1",
    "急赴磁体": "Rush to Magnet",
    "双重顶底": "Double Top/Bottom",
    "MTR": "Major Trend Reversal",
    "TR": "Trading Range",
    "BO": "Breakout",
    "PB": "Pullback"
};

function normalizeBrooksValue(raw) {
    if (!raw) return raw;
    const s = raw.toString().trim();
    // 模糊匹配：如果输入包含 key，则标准化为 value
    // 但为了性能，先做精确匹配
    if (BROOKS_MAP[s]) return BROOKS_MAP[s];
    
    // 尝试去括号后匹配
    const pair = parseParenPair(s);
    if (pair && BROOKS_MAP[pair.left]) return BROOKS_MAP[pair.left];
    
    return s;
}

// 3. 计算 R 值
function calculateR(entry, stop, exit) {
  try {
      const e = Number(entry);
      const s = Number(stop);
      const x = Number(exit);
      if (isNaN(e) || isNaN(s) || isNaN(x)) return 0;
      
      const risk = Math.abs(e - s);
      if (risk === 0) return 0; // 避免除零
      
      // 自动识别方向 (如果 exit > entry 且 entry > stop => Long)
      // 但这里我们只关心距离比例。如果 pnl 为负，外部逻辑会翻转符号。
      // 这里只计算绝对距离比
      return (x - e) / risk; 
  } catch (e) {
      return 0;
  }
}

// 4. 账户类型
function getAccountType(rawStr) {
  if (!rawStr) return "Demo";
  const s = rawStr.toString().toLowerCase();
  if (s.includes("live") || s.includes("实盘")) return "Live";
  if (s.includes("back") || s.includes("回测")) return "Backtest";
  return "Demo"; // Default safe fallback
}

module.exports = {
  // Safe Accessors (Recommended)
  safeStr,
  safeNum,
  safeArr,
  
  // Legacy Aliases (Backward Compatibility)
  getVal: safeNum, // Re-route old getVal to safeNum
  getStr: safeStr, // Re-route old getStr to safeStr
  getArr: safeArr,
  
  // Raw Access
  getRawStr,
  
  // Logic
  calculateR,
  getAccountType,
  
  // Normalizers
  normalizeTickerKey,
  normalizeTimeframeKey,
  normalizeDirectionKey,
  normalizeEnumKey,
  normalizeBrooksValue,
};

/* 文件名: Scripts/pa-utils.js
   用途: 通用工具函数库 (数据清洗、计算)
*/

// 0. 内部工具：兼容 Dataview Proxy/Array
function firstScalar(val) {
  if (val === undefined || val === null) return null;
  if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
  if (val?.constructor && val.constructor.name === "Proxy") {
    try {
      const arr = Array.from(val);
      return arr.length > 0 ? arr[0] : null;
    } catch (_) {
      return null;
    }
  }
  return val;
}

// 0.1 获取原始字符串（不做中英文清洗），用于展示与后续稳定归一化
function getRawStr(page, keys, fallback = "Unknown") {
  for (let k of keys) {
    let val = page?.[k];
    if (val === undefined || val === null) continue;
    val = firstScalar(val);
    if (val === undefined || val === null) continue;
    const s = val.toString().trim();
    if (s) return s;
  }
  return fallback;
}

function parseParenPair(s) {
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
}

// 0.2 稳定字段 key：给统计/聚合/升级用（不强依赖展示规则）
function normalizeTickerKey(raw) {
  if (!raw || raw === "Unknown") return "Unknown";
  const pair = parseParenPair(raw);
  const left = (pair?.left || raw.toString()).trim();
  const right = (pair?.right || "").trim();

  const pickCode = (v) => {
    const s = (v || "").toString().trim();
    if (!s) return "";
    // 优先取开头 token（如 "ES (标普)" / "ES/标普"）
    const token = s.split(/[\s/]+/)[0].trim();
    if (/^[A-Za-z]{1,6}$/.test(token)) return token.toUpperCase();
    return "";
  };

  return pickCode(left) || pickCode(right) || "Unknown";
}

function normalizeTimeframeKey(raw) {
  if (!raw || raw === "Unknown") return "Unknown";
  const s = raw.toString().trim();
  const pair = parseParenPair(s);
  const cands = [s, pair?.left, pair?.right].filter(Boolean);

  for (const v of cands) {
    const t = v.toString().trim();
    // 允许：1m/5m/15m/1H/4H/Daily (大小写不敏感)
    if (/^\d+m$/i.test(t)) return t.toLowerCase();
    if (/^\d+h$/i.test(t)) return t.toUpperCase();
    if (/^daily$/i.test(t)) return "Daily";
  }
  return "Unknown";
}

function normalizeDirectionKey(raw) {
  if (!raw || raw === "Unknown") return "Unknown";
  const s = raw.toString();
  if (s.includes("做多") || /\bLong\b/i.test(s)) return "Long";
  if (s.includes("做空") || /\bShort\b/i.test(s)) return "Short";
  return "Unknown";
}

function normalizeEnumKey(raw) {
  if (!raw || raw === "Unknown") return "Unknown";
  const s = raw.toString().trim();
  const pair = parseParenPair(s);
  if (pair) {
    const { left, right } = pair;
    // 常见约定：中文(English) -> 用 English 做 key
    if (/[A-Za-z]/.test(right)) return right;
    if (/[A-Za-z]/.test(left)) return left;
    return right || left || s;
  }
  if (s.includes("/")) {
    const parts = s.split("/").map((x) => x.trim()).filter(Boolean);
    // 默认取右侧作为 key（常见为 中文/English）
    if (parts.length >= 2) return parts.slice(1).join("/");
  }
  return s;
}

// 1. 安全获取数值属性 (支持多键名)
function getVal(page, keys) {
  for (let k of keys) {
    let val = page[k];
    if (val !== undefined && val !== null) {
      // Handle Arrays/Proxies (Metadata Menu compatibility)
      if (
        Array.isArray(val) ||
        (val.constructor && val.constructor.name === "Proxy")
      ) {
        val = val.length > 0 ? val[0] : 0;
      }
      let num = Number(val);
      return isNaN(num) ? 0 : num;
    }
  }
  return 0;
}

// 2. 安全获取文本属性 (自动清洗括号内容)
function getStr(page, keys) {
  for (let k of keys) {
    let val = page[k];
    if (val) {
      // 如果是数组，取第一个元素
      if (
        Array.isArray(val) ||
        (val.constructor && val.constructor.name === "Proxy")
      ) {
        if (val.length > 0) val = val[0];
        else continue;
      }

      let s = val.toString();
      // 简单清洗: "做多 (Long)" -> "Long"
      if (s.match(/[a-zA-Z]/)) {
        if (s.includes("(")) return s.split("(")[1].replace(")", "").trim();
        if (s.includes("/")) return s.split("/")[1].trim();
      }
      return s.split("(")[0].trim();
    }
  }
  return "Unknown";
}

// 3. 计算 R 值 (Risk Reward Ratio)
function calculateR(entry, stop, exit) {
  let risk = Math.abs(entry - stop);
  if (risk === 0) return 0;
  return (exit - entry) / risk;
}

// 4. 判断账户类型
function getAccountType(rawStr) {
  let s = rawStr.toLowerCase();
  if (s.includes("live") || s.includes("实盘")) return "Live";
  if (s.includes("back") || s.includes("回测")) return "Backtest";
  return "Demo";
}

// 5. 安全获取数组属性
function getArr(page, keys) {
  for (let k of keys) {
    let val = page[k];
    if (val) {
      if (
        Array.isArray(val) ||
        (val.constructor && val.constructor.name === "Proxy")
      ) {
        return Array.from(val).map((v) => v.toString());
      }
      return [val.toString()];
    }
  }
  return [];
}

module.exports = {
  getVal,
  getStr,
  getRawStr,
  calculateR,
  getAccountType,
  getArr,
  normalizeTickerKey,
  normalizeTimeframeKey,
  normalizeDirectionKey,
  normalizeEnumKey,
};

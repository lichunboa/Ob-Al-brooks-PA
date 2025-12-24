/* 文件名: Scripts/pa-utils.js
   用途: 通用工具函数库 (数据清洗、计算)
*/

// 1. 安全获取数值属性 (支持多键名)
function getVal(page, keys) {
    for (let k of keys) {
        let val = page[k];
        if (val !== undefined && val !== null) {
            // Handle Arrays/Proxies (Metadata Menu compatibility)
            if (Array.isArray(val) || (val.constructor && val.constructor.name === 'Proxy')) {
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
            if (Array.isArray(val) || (val.constructor && val.constructor.name === 'Proxy')) {
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
    return ((exit - entry) / risk);
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
            if (Array.isArray(val) || (val.constructor && val.constructor.name === 'Proxy')) {
                 return Array.from(val).map(v => v.toString());
            }
            return [val.toString()];
        }
    }
    return [];
}

module.exports = {
    getVal,
    getStr,
    calculateR,
    getAccountType,
    getArr
};
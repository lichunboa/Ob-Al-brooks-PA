/**
 * 格式化工具函数
 * 用于格式化各种数据值的显示
 */

/**
 * 检测字符串是否包含中文字符
 */
export function hasCJK(str: string): boolean {
    return /[\u4e00-\u9fff]/.test(str);
}

/**
 * 格式化Schema值,确保中英文双语显示
 * 
 * 规则:
 * - 中文(English) -> 中文/English
 * - 已有斜杠的保持中文在左
 * - 纯英文的添加"待补充/"前缀
 */
export function prettySchemaVal(val?: string): string {
    let s = (val ?? "").toString().trim();
    if (!s) return "";
    const low = s.toLowerCase();
    if (s === "Unknown" || low === "unknown") return "未知/Unknown";
    if (s === "Empty" || low === "empty") return "空/Empty";
    if (low === "null") return "空/null";

    // 中文(English) -> 中文/English
    if (s.includes("(") && s.endsWith(")")) {
        const parts = s.split("(");
        const cn = (parts[0] || "").trim();
        const en = parts
            .slice(1)
            .join("(")
            .replace(/\)\s*$/, "")
            .trim();
        if (cn && en) return `${cn}/${en}`;
        if (cn) return cn;
        if (en) return `待补充/${en}`;
    }

    // 已是 pair,尽量保证中文在左
    if (s.includes("/")) {
        const parts = s.split("/");
        const left = (parts[0] || "").trim();
        const right = parts.slice(1).join("/").trim();
        if (hasCJK(left)) return s;
        if (hasCJK(right)) return `${right}/${left}`;
        return `待补充/${s}`;
    }

    if (!hasCJK(s) && /[a-zA-Z]/.test(s)) return `待补充/${s}`;
    return s;
}

/**
 * 格式化执行质量值,添加emoji和中英文说明
 */
export function prettyExecVal(val?: string): string {
    const s0 = (val ?? "").toString().trim();
    if (!s0) return "未知/Unknown";
    const low = s0.toLowerCase();
    if (low.includes("unknown") || low === "null") return "未知/Unknown";
    if (low.includes("perfect") || s0.includes("完美")) return "🟢 完美";
    if (low.includes("fomo") || s0.includes("FOMO")) return "🔴 FOMO";
    if (low.includes("tight") || s0.includes("止损太紧")) return "🔴 止损太紧";
    if (low.includes("scratch") || s0.includes("主动")) return "🟡 主动离场";
    if (low.includes("normal") || low.includes("none") || s0.includes("正常"))
        return "🟢 正常";
    return prettySchemaVal(s0) || "未知/Unknown";
}

/**
 * 格式化Manager值(通用格式化)
 */
export function prettyManagerVal(val: string): string {
    const s = (val ?? "").toString().trim();
    if (!s) return "";
    const low = s.toLowerCase();
    if (low === "unknown" || low === "null") return "未知/Unknown";
    return prettySchemaVal(s);
}

/**
 * 通用值格式化(简化版)
 */
export function prettyVal(val: string): string {
    const s = (val ?? "").toString().trim();
    if (!s) return "—";
    const low = s.toLowerCase();
    if (low === "unknown" || low === "null") return "未知";
    return s;
}

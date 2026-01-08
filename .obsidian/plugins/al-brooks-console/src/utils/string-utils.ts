/**
 * 文件和字符串工具函数
 * 用于文件类型判断和字符串处理
 */

/**
 * 判断文件路径是否为图片
 */
export function isImage(p: string): boolean {
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(p);
}

/**
 * 字符串规范化(转小写)
 */
export function normalize(s: string): string {
    return s.toLowerCase();
}

/**
 * 解析规范路径
 */
export function resolveCanonical(t: { patternsObserved?: string[] }): string | null {
    const pats = (t.patternsObserved ?? [])
        .map((x) => String(x ?? "").trim())
        .filter(Boolean);
    if (pats.length === 0) return null;
    return pats[0];
}

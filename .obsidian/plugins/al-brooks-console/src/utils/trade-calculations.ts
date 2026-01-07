/**
 * 交易计算工具函数
 * 从 Dashboard.tsx 提取的纯函数
 */

/**
 * 安全计算百分比
 * @param wins 胜利次数
 * @param total 总次数
 * @returns 百分比 (0-1)
 */
export function safePct(wins: number, total: number): number {
    if (total === 0) return 0;
    return wins / total;
}

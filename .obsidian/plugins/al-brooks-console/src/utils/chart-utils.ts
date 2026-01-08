/**
 * 图表工具函数
 * 用于图表计算和渲染
 */

/**
 * 计算图表点坐标
 * @param data - 数据数组
 * @param w - 宽度
 * @param h - 高度
 * @param pad - 内边距
 * @returns SVG路径字符串
 */
export function getPoints(
    data: number[],
    w: number,
    h: number,
    pad: number = 10
): string {
    if (data.length === 0) return "";
    const xStep = (w - pad * 2) / Math.max(1, data.length - 1);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((val, i) => {
        const x = pad + i * xStep;
        const y = h - pad - ((val - min) / range) * (h - pad * 2);
        return `${x},${y}`;
    });

    return points.join(" ");
}

/**
 * 计算R倍数缩放比例
 */
export function calculateRScale(rHeight: number, maxAbs: number): number {
    return (rHeight / 2 - 6) / Math.max(1e-6, maxAbs);
}

/**
 * 分段函数(用于图表分段显示)
 */
export function seg(n: number): string {
    return n.toFixed(1);
}

/**
 * 图库工具函数
 * 用于处理交易图库相关逻辑
 */

import type { AccountType, TradeRecord } from "../core/contracts";
import { parseCoverRef } from "../core/cover-parser";
import { sortTradesByDateDesc } from "./trade-utils";
import { isImage } from "./string-utils";

/**
 * 图库项目类型
 */
export type GalleryItem = {
    tradePath: string;
    tradeName: string;
    accountType: AccountType;
    pnl: number;
    coverPath: string;
    url?: string;
};

/**
 * 构建图库项目列表
 * @param trades 交易记录数组
 * @param galleryScope 图库范围("All" | AccountType)
 * @param resolveLink 链接解析函数
 * @param getResourceUrl 资源URL获取函数
 * @returns 图库项目列表及统计信息
 */
export function buildGalleryItems(
    trades: TradeRecord[],
    galleryScope: "All" | AccountType,
    resolveLink: ((linkpath: string, sourcePath: string) => string | null) | undefined,
    getResourceUrl: ((path: string) => string) | undefined
): {
    items: GalleryItem[];
    scopeTotal: number;
    candidateCount: number;
} {
    if (!getResourceUrl) return { items: [], scopeTotal: 0, candidateCount: 0 };

    const out: GalleryItem[] = [];

    const candidates =
        galleryScope === "All"
            ? trades
            : trades.filter(
                (t) => ((t.accountType ?? "Live") as AccountType) === galleryScope
            );

    // v5.0 口径:按"最新"取候选。index.getAll() 的顺序不保证,所以这里显式按日期倒序。
    const candidatesSorted = sortTradesByDateDesc(candidates);

    // 从最近交易里取前 20 个候选(用于"最新复盘"瀑布流展示)。
    for (const t of candidatesSorted.slice(0, 20)) {
        // 优先使用索引层规范字段(SSOT);frontmatter 仅作回退。
        const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
        const rawCover =
            (fm as any)["封面/cover"] ?? (fm as any)["cover"] ?? (t as any).cover;

        // [DEBUG] 详细调试
        console.log(`[Gallery Debug] ${t.name}`, {
            hasFm: !!fm,
            fmKeys: Object.keys(fm).slice(0, 10),
            rawCover,
            rawCoverType: typeof rawCover,
            isObject: rawCover && typeof rawCover === "object",
            hasPath: rawCover && typeof rawCover === "object" && !!(rawCover as any).path,
            coverPath: rawCover && typeof rawCover === "object" ? (rawCover as any).path : "N/A",
        });

        // 允许"没有封面"的交易也进入展示(用占位卡片),否则用户会看到
        // "范围内有 2 笔,但只展示 1 张"的困惑。
        let resolved = "";
        let url: string | undefined = undefined;

        if (rawCover) {
            // 情况1: Obsidian Link 对象 (frontmatter 中的 [[...]] 会被解析为 Link 对象)
            if (rawCover && typeof rawCover === "object" && (rawCover as any).path) {
                const linkPath = (rawCover as any).path as string;
                console.log(`[Gallery Debug] Link Object detected:`, { linkPath, isImage: isImage(linkPath) });
                if (linkPath && isImage(linkPath)) {
                    resolved = linkPath;
                    url = getResourceUrl ? getResourceUrl(linkPath) : undefined;
                    // 如果直接获取失败，尝试用 resolveLink 解析
                    if (!url && resolveLink) {
                        const fullPath = resolveLink(linkPath, t.path);
                        if (fullPath) {
                            url = getResourceUrl ? getResourceUrl(fullPath) : undefined;
                        }
                    }
                    console.log(`[Gallery Debug] URL generated:`, { linkPath, url });
                }
            }
            // 情况2: 字符串格式 (包括 "[[...]]" 或 "![]()" 或纯路径)
            else if (typeof rawCover === "string") {
                const ref = parseCoverRef(rawCover);
                console.log(`[Gallery Debug] String format:`, { rawCover, ref });
                if (ref) {
                    let target = String(ref.target ?? "").trim();
                    if (target) {
                        // 支持外链封面(http/https)
                        if (/^https?:\/\//i.test(target)) {
                            resolved = target;
                            url = target;
                        } else {
                            // 先尝试用 resolveLink 获取完整路径
                            resolved = resolveLink
                                ? resolveLink(target, t.path) ?? target
                                : target;
                            console.log(`[Gallery Debug] resolved:`, { target, resolved, isImage: isImage(resolved) });
                            if (resolved && isImage(resolved)) {
                                url = getResourceUrl ? getResourceUrl(resolved) : undefined;
                                // 如果解析后的路径也无法获取 URL，尝试原始 target
                                if (!url && resolved !== target) {
                                    url = getResourceUrl ? getResourceUrl(target) : undefined;
                                }
                                console.log(`[Gallery Debug] URL:`, { url });
                            } else {
                                resolved = "";
                                url = undefined;
                            }
                        }
                    }
                }
            }
        }

        const acct = (t.accountType ?? "Live") as AccountType;
        const pnl =
            typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

        out.push({
            tradePath: t.path,
            tradeName: t.name,
            accountType: acct,
            pnl,
            coverPath: resolved,
            url,
        });
    }

    return {
        items: out,
        scopeTotal: candidatesSorted.length,
        candidateCount: Math.min(20, candidatesSorted.length),
    };
}

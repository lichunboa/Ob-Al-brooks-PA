/**
 * 颜色工具函数
 * 从 Dashboard.tsx 提取的纯函数
 */

import { V5_COLORS } from "../ui/tokens";
import type { AccountType } from "../core/contracts";

/**
 * 根据账户类型获取对应的颜色
 * @param accountType 账户类型 (Live/Demo/Backtest)
 * @returns 颜色值
 */
export function getRColorByAccountType(accountType: AccountType): string {
    switch (accountType) {
        case "Live":
            return V5_COLORS.live;
        case "Demo":
            return V5_COLORS.demo;
        case "Backtest":
            return V5_COLORS.back;
    }
}

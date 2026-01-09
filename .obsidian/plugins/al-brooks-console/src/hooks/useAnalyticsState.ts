/**
 * useAnalyticsState Hook
 * 管理 Analytics Tab 的筛选状态
 */

import * as React from "react";
import type { AnalyticsScope } from "../core/analytics";

export interface UseAnalyticsStateReturn {
    analyticsScope: AnalyticsScope;
    setAnalyticsScope: React.Dispatch<React.SetStateAction<AnalyticsScope>>;
    galleryScope: AnalyticsScope;
    setGalleryScope: React.Dispatch<React.SetStateAction<AnalyticsScope>>;
}

/**
 * 管理 Analytics Tab 的筛选状态
 */
export function useAnalyticsState(): UseAnalyticsStateReturn {
    const [analyticsScope, setAnalyticsScope] = React.useState<AnalyticsScope>("Live");
    const [galleryScope, setGalleryScope] = React.useState<AnalyticsScope>("All");

    return {
        analyticsScope,
        setAnalyticsScope,
        galleryScope,
        setGalleryScope,
    };
}

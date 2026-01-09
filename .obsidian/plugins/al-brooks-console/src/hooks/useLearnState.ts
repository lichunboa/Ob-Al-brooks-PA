/**
 * useLearnState Hook
 * 管理 Learn Tab 的所有状态
 */

import * as React from "react";
import type { CourseSnapshot } from "../core/course";
import type { MemorySnapshot } from "../core/memory";

export interface UseLearnStateReturn {
    // Course 相关
    course: CourseSnapshot | undefined;
    setCourse: React.Dispatch<React.SetStateAction<CourseSnapshot | undefined>>;
    courseBusy: boolean;
    setCourseBusy: React.Dispatch<React.SetStateAction<boolean>>;
    courseError: string | undefined;
    setCourseError: React.Dispatch<React.SetStateAction<string | undefined>>;

    // Memory 相关
    memory: MemorySnapshot | undefined;
    setMemory: React.Dispatch<React.SetStateAction<MemorySnapshot | undefined>>;
    memoryBusy: boolean;
    setMemoryBusy: React.Dispatch<React.SetStateAction<boolean>>;
    memoryError: string | undefined;
    setMemoryError: React.Dispatch<React.SetStateAction<string | undefined>>;
    memoryIgnoreFocus: boolean;
    setMemoryIgnoreFocus: React.Dispatch<React.SetStateAction<boolean>>;
    memoryShakeIndex: number;
    setMemoryShakeIndex: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * 管理 Learn Tab 的所有状态
 */
export function useLearnState(): UseLearnStateReturn {
    // Course 相关
    const [course, setCourse] = React.useState<CourseSnapshot | undefined>(undefined);
    const [courseBusy, setCourseBusy] = React.useState(false);
    const [courseError, setCourseError] = React.useState<string | undefined>(undefined);

    // Memory 相关
    const [memory, setMemory] = React.useState<MemorySnapshot | undefined>(undefined);
    const [memoryBusy, setMemoryBusy] = React.useState(false);
    const [memoryError, setMemoryError] = React.useState<string | undefined>(undefined);
    const [memoryIgnoreFocus, setMemoryIgnoreFocus] = React.useState(false);
    const [memoryShakeIndex, setMemoryShakeIndex] = React.useState(0);

    return {
        course,
        setCourse,
        courseBusy,
        setCourseBusy,
        courseError,
        setCourseError,
        memory,
        setMemory,
        memoryBusy,
        setMemoryBusy,
        memoryError,
        setMemoryError,
        memoryIgnoreFocus,
        setMemoryIgnoreFocus,
        memoryShakeIndex,
        setMemoryShakeIndex,
    };
}


import * as React from "react";
import type { AlBrooksConsoleSettings } from "../settings";
import type { CourseSnapshot } from "../core/course";
import type { MemorySnapshot } from "../core/memory";
import type { PluginIntegrationRegistry } from "../integrations/PluginIntegrationRegistry";
import type { IntegrationCapability } from "../integrations/contracts";

export interface UseLearnDataProps {
    loadCourse?: (settings: AlBrooksConsoleSettings) => Promise<CourseSnapshot>;
    loadMemory?: (settings: AlBrooksConsoleSettings) => Promise<MemorySnapshot>;
    settings: AlBrooksConsoleSettings;
    integrations?: PluginIntegrationRegistry;
}

export interface UseLearnDataReturn {
    course: CourseSnapshot | undefined;
    courseBusy: boolean;
    courseError: string | undefined;
    memory: MemorySnapshot | undefined;
    memoryBusy: boolean;
    memoryError: string | undefined;
    memoryShakeIndex: number;
    memoryIgnoreFocus: boolean;

    setMemoryShakeIndex: (index: number) => void;
    setMemoryIgnoreFocus: (ignore: boolean) => void;

    reloadCourse: () => Promise<void>;
    reloadMemory: () => Promise<void>;
    hardRefreshMemory: () => Promise<void>;
}

export function useLearnData({
    loadCourse,
    loadMemory,
    settings,
    integrations,
}: UseLearnDataProps): UseLearnDataReturn {
    // Course State
    const [course, setCourse] = React.useState<CourseSnapshot | undefined>(undefined);
    const [courseBusy, setCourseBusy] = React.useState(false);
    const [courseError, setCourseError] = React.useState<string | undefined>(undefined);

    // Memory State
    const [memory, setMemory] = React.useState<MemorySnapshot | undefined>(undefined);
    const [memoryBusy, setMemoryBusy] = React.useState(false);
    const [memoryError, setMemoryError] = React.useState<string | undefined>(undefined);
    const [memoryShakeIndex, setMemoryShakeIndex] = React.useState(0);
    const [memoryIgnoreFocus, setMemoryIgnoreFocus] = React.useState(false);

    // Integration Helpers
    const can = React.useCallback(
        (capabilityId: IntegrationCapability) =>
            Boolean(integrations?.isCapabilityAvailable(capabilityId)),
        [integrations]
    );

    const action = React.useCallback(
        async (capabilityId: IntegrationCapability) => {
            if (!integrations) return;
            try {
                await integrations.run(capabilityId);
            } catch (e) {
                console.warn("[al-brooks-console] useLearnData integration action failed", capabilityId, e);
            }
        },
        [integrations]
    );

    // Load Course
    const reloadCourse = React.useCallback(async () => {
        if (!loadCourse) return;
        setCourseBusy(true);
        setCourseError(undefined);
        try {
            const next = await loadCourse(settings);
            setCourse(next);
        } catch (e) {
            setCourseError(e instanceof Error ? e.message : String(e));
        } finally {
            setCourseBusy(false);
        }
    }, [loadCourse, settings]);

    // Load Memory
    const reloadMemory = React.useCallback(async () => {
        if (!loadMemory) return;
        setMemoryIgnoreFocus(false);
        setMemoryShakeIndex(0);
        setMemoryBusy(true);
        setMemoryError(undefined);
        try {
            const next = await loadMemory(settings);
            setMemory(next);
        } catch (e) {
            setMemoryError(e instanceof Error ? e.message : String(e));
        } finally {
            setMemoryBusy(false);
        }
    }, [loadMemory, settings]);

    // Hard Refresh Memory
    const hardRefreshMemory = React.useCallback(async () => {
        if (can("dataview:force-refresh")) {
            void action("dataview:force-refresh");
        }
        await reloadMemory();
    }, [action, can, reloadMemory]);

    // Initial Load
    React.useEffect(() => {
        void reloadCourse();
    }, [reloadCourse]);

    React.useEffect(() => {
        void reloadMemory();
    }, [reloadMemory]);

    return {
        course,
        courseBusy,
        courseError,
        memory,
        memoryBusy,
        memoryError,
        memoryShakeIndex,
        memoryIgnoreFocus,
        setMemoryShakeIndex,
        setMemoryIgnoreFocus,
        reloadCourse,
        reloadMemory,
        hardRefreshMemory,
    };
}

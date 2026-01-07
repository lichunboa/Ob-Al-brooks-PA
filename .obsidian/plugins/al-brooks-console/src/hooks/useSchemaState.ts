/**
 * useSchemaState Hook
 * 管理 Schema 检查和修复相关的状态
 */

import * as React from "react";
import type { PaTagSnapshot, SchemaIssueItem } from "../types";

export interface UseSchemaStateReturn {
    showFixPlan: boolean;
    setShowFixPlan: React.Dispatch<React.SetStateAction<boolean>>;
    paTagSnapshot: PaTagSnapshot | undefined;
    setPaTagSnapshot: React.Dispatch<React.SetStateAction<PaTagSnapshot | undefined>>;
    schemaIssues: SchemaIssueItem[];
    setSchemaIssues: React.Dispatch<React.SetStateAction<SchemaIssueItem[]>>;
    schemaScanNote: string | undefined;
    setSchemaScanNote: React.Dispatch<React.SetStateAction<string | undefined>>;
}

/**
 * 管理 Schema 检查和修复相关的状态
 */
export function useSchemaState(): UseSchemaStateReturn {
    const [showFixPlan, setShowFixPlan] = React.useState(false);
    const [paTagSnapshot, setPaTagSnapshot] = React.useState<PaTagSnapshot | undefined>(undefined);
    const [schemaIssues, setSchemaIssues] = React.useState<SchemaIssueItem[]>([]);
    const [schemaScanNote, setSchemaScanNote] = React.useState<string | undefined>(undefined);

    return {
        showFixPlan,
        setShowFixPlan,
        paTagSnapshot,
        setPaTagSnapshot,
        schemaIssues,
        setSchemaIssues,
        schemaScanNote,
        setSchemaScanNote,
    };
}

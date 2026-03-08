'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useExecutionData } from '@/hooks/useExecutionData';

type ExecutionContextValue = ReturnType<typeof useExecutionData>;

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const data = useExecutionData();
  return (
    <ExecutionContext.Provider value={data}>
      {children}
    </ExecutionContext.Provider>
  );
}

export function useExecutionContext(): ExecutionContextValue {
  const ctx = useContext(ExecutionContext);
  if (!ctx) {
    throw new Error('useExecutionContext must be used within ExecutionProvider');
  }
  return ctx;
}

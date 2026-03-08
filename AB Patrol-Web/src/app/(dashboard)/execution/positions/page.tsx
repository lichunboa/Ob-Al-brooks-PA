'use client';

import { useExecutionContext } from '@/contexts/ExecutionContext';
import { PositionsTable } from '@/components/execution';

export default function PositionsPage() {
  const { positions, isConnected, isLoading, refresh } = useExecutionContext();

  return (
    <PositionsTable
      positions={positions}
      isConnected={isConnected}
      isLoading={isLoading}
      onRefresh={() => refresh()}
    />
  );
}

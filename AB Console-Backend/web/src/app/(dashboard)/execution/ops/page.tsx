'use client';

import { useExecutionContext } from '@/contexts/ExecutionContext';
import { PatrolPanel, ReconciliationPanel, ThresholdConfig } from '@/components/execution';

export default function OpsPage() {
  const { patrolStatus, isLoading } = useExecutionContext();

  return (
    <div className="space-y-6">
      <PatrolPanel status={patrolStatus} />
      <ReconciliationPanel isLoading={isLoading} />
      <ThresholdConfig isLoading={isLoading} />
    </div>
  );
}

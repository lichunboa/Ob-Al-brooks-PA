'use client';

import { useExecutionContext } from '@/contexts/ExecutionContext';
import { RiskStatusCard, ApiConfigCard } from '@/components/execution';

export default function RiskPage() {
  const { riskStatus, config, isConnected, isLoading, refresh } = useExecutionContext();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <RiskStatusCard
        riskStatus={riskStatus}
        isConnected={isConnected}
        isLoading={isLoading}
        onRefresh={() => refresh()}
      />
      <ApiConfigCard
        config={config}
        isConnected={isConnected}
        isLoading={isLoading}
        onRefresh={() => refresh()}
      />
    </div>
  );
}

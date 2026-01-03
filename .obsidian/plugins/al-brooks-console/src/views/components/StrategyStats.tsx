import * as React from "react";
import type { StrategyStatsProps } from './types';

const StatCard: React.FC<{label: string; value: number | string; onClick?: ()=>void}> = ({label, value, onClick}) => (
  <button className="pa-stat-card" onClick={onClick} aria-label={label}>
    <div className="pa-stat-value">{value}</div>
    <div className="pa-stat-label">{label}</div>
  </button>
);

const StrategyStats: React.FC<StrategyStatsProps> = ({ total, activeCount, learningCount, totalUses, onFilter }) => {
  return (
    <div className="pa-strategy-stats" role="region" aria-label="策略统计">
      <StatCard label="总策略" value={total} onClick={() => onFilter?.('all')} />
      <StatCard label="实战中" value={activeCount} onClick={() => onFilter?.('active')} />
      <StatCard label="学习中" value={learningCount} onClick={() => onFilter?.('learning')} />
      <StatCard label="使用次数" value={totalUses} onClick={() => onFilter?.('uses')} />
    </div>
  );
};

export default StrategyStats;

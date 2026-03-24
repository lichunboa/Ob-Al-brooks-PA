import path from 'path';

import { AGENT_ROOT } from './live-monitoring';
import {
  latestCycleFileStamp,
  runtimeFiles,
  safeStatMtimeMs,
} from './runtime-files';
import type { RuntimeConfig } from './runtime-route-builder';

const DEFAULT_QUERY_BASE = 'http://127.0.0.1:8086';
const DEFAULT_EXECUTION_BASE = 'http://127.0.0.1:8092';

export const executionHistoryResetFile = path.join(
  AGENT_ROOT,
  'data',
  'run',
  'web_execution_history_reset.json',
);

export const runtimeConfigs: RuntimeConfig[] = [
  {
    key: 'primary',
    label: '统一实盘链',
    botId: 'claude-pa',
    dataRoot: path.join(AGENT_ROOT, 'data', 'pa_trader'),
    defaultQueryBase: DEFAULT_QUERY_BASE,
    defaultExecutionBase: DEFAULT_EXECUTION_BASE,
    allowQuery: true,
  },
];

export function runtimeViewCacheStamp(view: string): string {
  return runtimeConfigs.map((runtimeConfig) => {
    const files = runtimeFiles(runtimeConfig.dataRoot);
    return [
      runtimeConfig.key,
      view,
      safeStatMtimeMs(files.runtimeState),
      safeStatMtimeMs(files.nextScan),
      latestCycleFileStamp(files),
      safeStatMtimeMs(files.decisionLog),
      safeStatMtimeMs(files.executionLog),
      safeStatMtimeMs(executionHistoryResetFile),
    ].join('::');
  }).join('||');
}

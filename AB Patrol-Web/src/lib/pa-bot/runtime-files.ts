import fs from 'fs';
import path from 'path';
import { normalizeSymbolKey } from './runtime-symbols';

export type UnknownRecord = Record<string, unknown>;

export type RuntimeFiles = {
  stateDir: string;
  cyclesDir: string;
  journalDir: string;
  decisionLog: string;
  executionLog: string;
  requestFile: string;
  sessionFile: string;
  runtimeState: string;
  nextScan: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function runtimeFiles(dataRoot: string): RuntimeFiles {
  const stateDir = path.join(dataRoot, 'state');
  const journalDir = path.join(dataRoot, 'journal');

  return {
    stateDir,
    cyclesDir: path.join(dataRoot, 'cycles'),
    journalDir,
    decisionLog: path.join(journalDir, 'decision_log.jsonl'),
    executionLog: path.join(journalDir, 'execution_log.jsonl'),
    requestFile: path.join(dataRoot, 'logs', 'decision', 'last_request.md'),
    sessionFile: path.join(stateDir, 'decision_session.json'),
    runtimeState: path.join(stateDir, 'runtime_state.json'),
    nextScan: path.join(stateDir, 'next_scan.json'),
  };
}

export function hasRuntimeData(files: RuntimeFiles): boolean {
  return [files.runtimeState, files.cyclesDir, files.decisionLog, files.executionLog].some((filePath) => fs.existsSync(filePath));
}

export function readJson(filePath: string): UnknownRecord {
  try {
    if (!fs.existsSync(filePath)) return {};
    return asRecord(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  } catch {
    return {};
  }
}

export function readJsonlTail(filePath: string, limit = 5): UnknownRecord[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((line) => line.trim());
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return asRecord(JSON.parse(line));
        } catch {
          return {};
        }
      })
      .filter((item) => Object.keys(item).length > 0)
      .reverse();
  } catch {
    return [];
  }
}

export function readJsonlRecent(filePath: string, limit = 300): UnknownRecord[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((line) => line.trim());
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return asRecord(JSON.parse(line));
        } catch {
          return {};
        }
      })
      .filter((item) => Object.keys(item).length > 0);
  } catch {
    return [];
  }
}

export function readJsonlRecentMeaningful(filePath: string, meaningfulLimit = 600, hardLineLimit = 50000): UnknownRecord[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((line) => line.trim());
    const result: UnknownRecord[] = [];
    let meaningfulCount = 0;
    let scanned = 0;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      scanned += 1;
      if (scanned > hardLineLimit) break;
      try {
        const parsed = asRecord(JSON.parse(line));
        if (Object.keys(parsed).length === 0) continue;
        const status = asString(parsed.status).trim().toUpperCase();
        const type = asString(parsed.type).trim().toUpperCase();
        const message = `${asString(parsed.message)} ${asString(parsed.reason)}`.toUpperCase();
        const isMeaningful =
          !['', 'LOG_ONLY', 'NO_ACTION'].includes(status) &&
          type !== 'LOG_ONLY';
        if (!isMeaningful && !message.includes('[TRADE_GATE_PRECHECK]') && !message.includes('[SEMANTIC_PRECHECK]')) {
          continue;
        }
        result.push(parsed);
        if (isMeaningful) {
          meaningfulCount += 1;
        }
        if (meaningfulCount >= meaningfulLimit) {
          break;
        }
      } catch {
        continue;
      }
    }
    return result.reverse();
  } catch {
    return [];
  }
}

export function readText(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export function safeStatMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

export function latestCycleFileStamp(files: RuntimeFiles): string {
  try {
    if (!fs.existsSync(files.cyclesDir)) return 'none';
    const latest = fs
      .readdirSync(files.cyclesDir)
      .filter((file) => file.startsWith('cycle_') && file.endsWith('.json'))
      .sort()
      .at(-1);
    if (!latest) return 'none';
    const cyclePath = path.join(files.cyclesDir, latest);
    return `${latest}:${safeStatMtimeMs(cyclePath)}`;
  } catch {
    return 'none';
  }
}

export function latestCycle(
  files: RuntimeFiles,
  options?: { preferredCycleId?: string | null },
): { cyclePath: string | null; cycle: UnknownRecord; cycleAgeSeconds: number | null } {
  try {
    if (!fs.existsSync(files.cyclesDir)) {
      return { cyclePath: null, cycle: {}, cycleAgeSeconds: null };
    }
    const cycleFiles = fs
      .readdirSync(files.cyclesDir)
      .filter((file) => file.startsWith('cycle_') && file.endsWith('.json'))
      .sort();
    const preferredCycleId = asString(options?.preferredCycleId).trim();
    const preferredFile =
      preferredCycleId && cycleFiles.includes(`${preferredCycleId}.json`)
        ? `${preferredCycleId}.json`
        : '';
    const latest = preferredFile || cycleFiles.at(-1);
    if (!latest) {
      return { cyclePath: null, cycle: {}, cycleAgeSeconds: null };
    }
    const cyclePath = path.join(files.cyclesDir, latest);
    const stat = fs.statSync(cyclePath);
    const cycleAgeSeconds = Math.max(0, Math.floor((Date.now() - stat.mtimeMs) / 1000));
    return {
      cyclePath,
      cycle: readJson(cyclePath),
      cycleAgeSeconds,
    };
  } catch {
    return { cyclePath: null, cycle: {}, cycleAgeSeconds: null };
  }
}

export function recentCycles(files: RuntimeFiles, limit = 5): UnknownRecord[] {
  try {
    if (!fs.existsSync(files.cyclesDir)) return [];
    return fs
      .readdirSync(files.cyclesDir)
      .filter((file) => file.startsWith('cycle_') && file.endsWith('.json'))
      .sort()
      .slice(-limit)
      .reverse()
      .map((file) => {
        const payload = readJson(path.join(files.cyclesDir, file));
        const decision = asRecord(payload.decision);
        return {
          cycle_id: asString(payload.cycle_id) || file.replace(/\.json$/, ''),
          phase: asString(decision.phase) || asString(payload.phase),
          focus_symbols: asStringArray(decision.focus_symbols),
          next_scan_seconds: asNumber(decision.next_scan_seconds),
          market_summary: decision.market_summary,
        };
      });
  } catch {
    return [];
  }
}

export function recentCyclePayloads(files: RuntimeFiles, limit = 160): UnknownRecord[] {
  try {
    if (!fs.existsSync(files.cyclesDir)) return [];
    return fs
      .readdirSync(files.cyclesDir)
      .filter((file) => file.startsWith('cycle_') && file.endsWith('.json'))
      .sort()
      .slice(-limit)
      .map((file) => readJson(path.join(files.cyclesDir, file)))
      .filter((item) => Object.keys(item).length > 0);
  } catch {
    return [];
  }
}

export function cycleSymbolPatch(cycle: UnknownRecord, symbol: string): UnknownRecord {
  const updates = asRecord(asRecord(cycle.decision).symbol_updates);
  const direct = asRecord(updates[symbol]);
  if (Object.keys(direct).length > 0) {
    return direct;
  }
  const symbolKey = normalizeSymbolKey(symbol);
  for (const [candidate, payload] of Object.entries(updates)) {
    if (normalizeSymbolKey(candidate) === symbolKey) {
      return asRecord(payload);
    }
  }
  return {};
}

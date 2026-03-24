import fs from 'fs';
import path from 'path';

function findProjectRoot(): string {
  const explicitRoot = process.env.AB_PATROL_PROJECT_ROOT?.trim();
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  let current = path.resolve(process.cwd());
  for (let index = 0; index < 8; index += 1) {
    const hasAgent = fs.existsSync(path.join(current, 'AB Patrol-Agent'));
    const hasWeb = fs.existsSync(path.join(current, 'AB Patrol-Web'));
    if (hasAgent && hasWeb) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.resolve(process.cwd(), '..');
}

export const PROJECT_ROOT = findProjectRoot();
export const AGENT_ROOT = path.join(PROJECT_ROOT, 'AB Patrol-Agent');
export const LIVE_MONITORING_PATH = path.join(AGENT_ROOT, 'config', 'live_monitoring.json');
const SYMBOLS_PATH = path.join(AGENT_ROOT, 'config', 'symbols.json');

export type MonitoringAccount = {
  id: string;
  label: string;
  exchange: string;
  enabled: boolean;
  role: 'primary' | 'monitor';
  base_url: string;
  symbols: string[];
};

export type MonitoringConfig = {
  version: number;
  accounts: MonitoringAccount[];
};

type UnknownRecord = Record<string, unknown>;

function readJson(filePath: string): UnknownRecord {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UnknownRecord;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dedupeSymbols(values: unknown): string[] {
  const ordered: string[] = [];
  for (const item of asArray(values)) {
    const symbol = asString(item).trim().toUpperCase();
    if (symbol && !ordered.includes(symbol)) {
      ordered.push(symbol);
    }
  }
  return ordered;
}

export function normalizeExchange(value: unknown): string {
  const exchange = asString(value).trim().toLowerCase();
  return exchange || 'binance';
}

export function replacePort(baseUrl: string, port: number): string {
  try {
    const url = new URL(baseUrl || 'http://127.0.0.1:8092');
    url.port = `${port}`;
    return url.toString().replace(/\/$/, '');
  } catch {
    return `http://127.0.0.1:${port}`;
  }
}

export function defaultMonitorBase(primaryExchange: string, primaryBase: string, exchange: string): string {
  const primary = normalizeExchange(primaryExchange);
  const target = normalizeExchange(exchange);
  if (target === primary) {
    return (primaryBase || 'http://127.0.0.1:8092').replace(/\/$/, '');
  }
  if ((primary === 'ctrader' && target === 'binance') || (primary === 'binance' && target === 'ctrader')) {
    return replacePort(primaryBase || 'http://127.0.0.1:8092', 8093);
  }
  if (target === 'binance') return 'http://127.0.0.1:8093';
  if (target === 'ctrader') return 'http://127.0.0.1:8094';
  if (target === 'okx') return 'http://127.0.0.1:8095';
  return 'http://127.0.0.1:8096';
}

function loadSymbolsConfig(): UnknownRecord {
  return readJson(SYMBOLS_PATH);
}

function defaultSymbolsForExchange(exchange: string): string[] {
  const symbols = loadSymbolsConfig();
  const normalized = normalizeExchange(exchange);
  if (normalized === 'ctrader') {
    const ctrader = asRecord(symbols.ctrader);
    return dedupeSymbols([
      ...asArray(ctrader.forex),
      ...asArray(ctrader.indices),
      ...asArray(ctrader.metals),
    ]);
  }
  if (normalized === 'okx') {
    return dedupeSymbols(asRecord(symbols.okx).crypto_swap);
  }
  if (normalized === 'binance') {
    return dedupeSymbols(asRecord(symbols.binance).crypto);
  }
  return [];
}

function defaultAccounts(primaryExchange: string, primaryBase: string): MonitoringAccount[] {
  const primary = normalizeExchange(primaryExchange);
  const exchanges = Array.from(new Set([primary, 'ctrader', 'binance']));
  return exchanges.map((exchange, index) => ({
    id: `${exchange}-${index + 1}`,
    label: exchange === 'ctrader' ? 'cTrader Demo' : exchange === 'binance' ? 'Binance Demo' : exchange.toUpperCase(),
    exchange,
    enabled: true,
    role: exchange === primary ? 'primary' : 'monitor',
    base_url: defaultMonitorBase(primary, primaryBase, exchange),
    symbols: defaultSymbolsForExchange(exchange),
  }));
}

export function normalizeMonitoringConfig(
  input: unknown,
  primaryExchange = 'ctrader',
  primaryBase = 'http://127.0.0.1:8092',
): MonitoringConfig {
  const raw = asRecord(input);
  const accountsInput = asArray(raw.accounts);
  const fallbackAccounts = defaultAccounts(primaryExchange, primaryBase);
  const normalizedAccounts: MonitoringAccount[] = accountsInput
    .map((item, index) => {
      const account = asRecord(item);
      const exchange = normalizeExchange(account.exchange || fallbackAccounts[0]?.exchange || primaryExchange);
      const role: MonitoringAccount['role'] = asString(account.role).trim().toLowerCase() === 'primary' ? 'primary' : 'monitor';
      const enabled = account.enabled === undefined ? true : Boolean(account.enabled);
      return {
        id: asString(account.id).trim() || `${exchange}-${index + 1}`,
        label: asString(account.label).trim() || (exchange === 'ctrader' ? 'cTrader Demo' : exchange.toUpperCase()),
        exchange,
        enabled,
        role,
        base_url:
          asString(account.base_url).trim() ||
          defaultMonitorBase(primaryExchange, primaryBase, exchange),
        symbols: dedupeSymbols(account.symbols),
      };
    })
    .filter((account) => account.id && account.exchange);

  const accounts = normalizedAccounts.length > 0 ? normalizedAccounts : fallbackAccounts;
  const enabledAccounts = accounts.filter((account) => account.enabled);
  if (enabledAccounts.length === 0 && accounts[0]) {
    accounts[0] = { ...accounts[0], enabled: true, role: 'primary' };
  }

  let primaryAssigned = false;
  const fixedAccounts = accounts.map((account, index) => {
    const next = { ...account };
    if (!next.symbols.length) {
      next.symbols = defaultSymbolsForExchange(next.exchange);
    }
    if (!next.enabled) {
      next.role = 'monitor';
      return next;
    }
    if (!primaryAssigned && (next.role === 'primary' || index === 0)) {
      next.role = 'primary';
      primaryAssigned = true;
      return next;
    }
    next.role = 'monitor';
    return next;
  });

  if (!primaryAssigned && fixedAccounts[0]) {
    fixedAccounts[0] = { ...fixedAccounts[0], enabled: true, role: 'primary' };
  }

  return {
    version: 1,
    accounts: fixedAccounts,
  };
}

export function loadMonitoringConfig(
  primaryExchange = 'ctrader',
  primaryBase = 'http://127.0.0.1:8092',
): MonitoringConfig {
  return normalizeMonitoringConfig(readJson(LIVE_MONITORING_PATH), primaryExchange, primaryBase);
}

export function saveMonitoringConfig(
  input: unknown,
  primaryExchange = 'ctrader',
  primaryBase = 'http://127.0.0.1:8092',
): MonitoringConfig {
  const normalized = normalizeMonitoringConfig(input, primaryExchange, primaryBase);
  fs.writeFileSync(LIVE_MONITORING_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
  return normalized;
}

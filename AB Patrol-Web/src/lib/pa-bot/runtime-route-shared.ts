export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).map((item) => asString(item)).filter(Boolean);
}

export function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return Boolean(value);
}

export function summarizeValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => summarizeValue(item)).filter(Boolean).join(' / ');
  }
  if (!isRecord(value)) {
    return '';
  }
  const preferredKeys = ['summary', 'text', 'label', 'reason', 'status', 'type', 'message'];
  const preferredParts = preferredKeys.map((key) => summarizeValue(value[key])).filter(Boolean);
  if (preferredParts.length > 0) {
    return preferredParts.join(' / ');
  }
  const genericParts = Object.values(value).map((item) => summarizeValue(item)).filter(Boolean);
  return genericParts.join(' / ');
}

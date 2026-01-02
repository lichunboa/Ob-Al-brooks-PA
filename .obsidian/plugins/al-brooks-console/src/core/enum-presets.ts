export interface EnumResolution {
	canonical?: string;
	isCanonical: boolean;
}

export interface EnumPresets {
	/** Canonical field key (e.g. "账户类型/account_type" -> "account_type") */
	canonicalizeFieldKey: (key: string) => string;
	/** All canonical values for a field */
	getCanonicalValues: (fieldKey: string) => readonly string[];
	/** Resolve a raw value to a canonical value when possible */
	resolve: (fieldKey: string, rawValue: unknown) => EnumResolution;
	/** Normalize a raw value to canonical (returns undefined when not resolvable) */
	normalize: (fieldKey: string, rawValue: unknown) => string | undefined;
}

function asNonEmptyString(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	const s = v.trim();
	return s.length ? s : undefined;
}

function canonicalizeFieldKey(key: string): string {
	const k = String(key ?? "").trim();
	if (!k) return k;
	if (!k.includes("/")) return k;
	const parts = k.split("/").map((p) => p.trim()).filter(Boolean);
	return parts.length ? parts[parts.length - 1] : k;
}

function extractSynonyms(v: string): string[] {
	const out: string[] = [];
	const s = v.trim();
	if (!s) return out;
	out.push(s);

	// 形如：中文 (English)
	const m = s.match(/^(.*?)\((.*?)\)\s*$/);
	if (m) {
		const left = m[1]?.trim();
		const right = m[2]?.trim();
		if (left) out.push(left);
		if (right) out.push(right);
	}

	// 形如：交易区间日/TRD (Trading Range Day) → 左侧含 / 则同时允许分段
	const beforeParen = s.split("(")[0]?.trim();
	if (beforeParen && beforeParen.includes("/")) {
		for (const part of beforeParen.split("/").map((x) => x.trim()).filter(Boolean)) {
			out.push(part);
		}
	}

	return out;
}

function toToken(s: string): string {
	return s.trim().toLowerCase();
}

export function createEnumPresetsFromFrontmatter(frontmatter: Record<string, unknown>): EnumPresets {
	const fieldToCanonicalValues = new Map<string, string[]>();
	const fieldToTokenToCanonical = new Map<string, Map<string, string>>();

	for (const [rawKey, rawVal] of Object.entries(frontmatter ?? {})) {
		const fieldKey = canonicalizeFieldKey(rawKey);
		if (!fieldKey) continue;

		// 只关心数组型枚举；空值/非数组跳过
		if (!Array.isArray(rawVal)) continue;
		const values = rawVal
			.map((x) => asNonEmptyString(x))
			.filter(Boolean) as string[];
		if (values.length === 0) continue;

		fieldToCanonicalValues.set(fieldKey, values);
		const tokenMap = new Map<string, string>();
		for (const canonical of values) {
			for (const syn of extractSynonyms(canonical)) {
				tokenMap.set(toToken(syn), canonical);
			}
			// 同时把 canonical 自身小写也纳入
			tokenMap.set(toToken(canonical), canonical);
		}
		fieldToTokenToCanonical.set(fieldKey, tokenMap);
	}

	const getCanonicalValues = (fieldKey: string) => {
		const k = canonicalizeFieldKey(fieldKey);
		return fieldToCanonicalValues.get(k) ?? [];
	};

	const normalize = (fieldKey: string, rawValue: unknown): string | undefined => {
		const k = canonicalizeFieldKey(fieldKey);
		const tokenMap = fieldToTokenToCanonical.get(k);
		const raw = asNonEmptyString(rawValue);
		if (!tokenMap || !raw) return undefined;
		return tokenMap.get(toToken(raw));
	};

	const resolve = (fieldKey: string, rawValue: unknown): EnumResolution => {
		const raw = asNonEmptyString(rawValue);
		const canonical = normalize(fieldKey, rawValue);
		if (!raw) return { canonical, isCanonical: false };
		return { canonical, isCanonical: canonical === raw };
	};

	return {
		canonicalizeFieldKey,
		getCanonicalValues,
		resolve,
		normalize,
	};
}

export type CoverRefType = "wikilink" | "mdlink" | "path";

export interface CoverRef {
	raw: string;
	type: CoverRefType;
	target: string;
	alt?: string;
}

function asNonEmptyString(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	const s = v.trim();
	return s.length ? s : undefined;
}

function stripWrappingQuotes(s: string): string {
	if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) {
		const inner = s.slice(1, -1).trim();
		return inner.length ? inner : s;
	}
	return s;
}

function stripEmbedPrefix(s: string): string {
	// frontmatter 里常见：![[foo.png]] 或 ![](foo.png)
	return s.startsWith("!") ? s.slice(1).trim() : s;
}

function parseWikiLinkBody(body: string): { target: string; alt?: string } | undefined {
	const trimmed = body.trim();
	if (!trimmed) return undefined;
	const [left, ...rest] = trimmed.split("|");
	const target = left.trim();
	if (!target) return undefined;
	const alt = rest.length ? rest.join("|").trim() : undefined;
	return { target, alt: alt?.length ? alt : undefined };
}

export function parseCoverRef(rawValue: unknown): CoverRef | undefined {
	const s0 = Array.isArray(rawValue) ? asNonEmptyString(rawValue[0]) : asNonEmptyString(rawValue);
	if (!s0) return undefined;

	const raw = s0;
	let s = stripEmbedPrefix(stripWrappingQuotes(s0)).trim();
	if (!s) return undefined;

	// [[path|alias]] / [[path]]
	if (s.startsWith("[[") && s.endsWith("]]")) {
		const body = s.slice(2, -2);
		const parsed = parseWikiLinkBody(body);
		if (!parsed) return undefined;
		return { raw, type: "wikilink", target: parsed.target, alt: parsed.alt };
	}

	// [text](path) / ![alt](path)
	const mdLink = s.match(/^!?\[([^\]]*)\]\(([^)]+)\)$/);
	if (mdLink) {
		const alt = mdLink[1]?.trim();
		const target = mdLink[2]?.trim();
		if (!target) return undefined;
		return {
			raw,
			type: "mdlink",
			target,
			alt: alt?.length ? alt : undefined,
		};
	}

	// 兜底：当作路径（可能包含 | 或 #，按最简单规则裁掉）
	if (s.includes("|")) s = s.split("|")[0].trim();
	return s.length ? { raw, type: "path", target: s } : undefined;
}

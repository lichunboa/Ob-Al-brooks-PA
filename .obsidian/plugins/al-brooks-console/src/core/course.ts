export type CourseHybridRec = {
	type: "New" | "Review";
	data: SyllabusItem;
};

export type SyllabusItem = {
	id: string;
	/** title */
	t?: string;
	/** phase */
	p?: string;
	[key: string]: unknown;
};

export type CourseLink = { path: string; name: string };

export type CourseMatrixItem = {
	item: SyllabusItem;
	isDone: boolean;
	hasNote: boolean;
	link?: CourseLink;
	shortId: string;
};

export type CoursePhaseGroup = {
	phase: string;
	items: CourseMatrixItem[];
};

export type CourseSnapshot = {
	syllabus: SyllabusItem[];
	doneIds: string[];
	linksById: Record<string, CourseLink>;
	progress: { doneCount: number; totalCount: number };
	hybridRec: CourseHybridRec | null;
	phases: CoursePhaseGroup[];
	upNext: CourseMatrixItem[];
};

export function simpleCourseId(id: string): string {
	return String(id ?? "").replace(/([0-9])([A-Z]+)$/g, "$1");
}

export function parseSyllabusJsonFromMarkdown(mdText: string): SyllabusItem[] {
	if (!mdText || typeof mdText !== "string") return [];

	const tryParse = (candidate: string): unknown => {
		try {
			return JSON.parse(candidate);
		} catch {
			return null;
		}
	};

	// 1) 优先解析 ```json
	let m = mdText.match(/```json\s*([\s\S]*?)```/i);
	if (m?.[1]) {
		const parsed = tryParse(m[1].trim());
		if (Array.isArray(parsed)) return normalizeSyllabus(parsed);
	}

	// 2) 次选：任意 ```
	m = mdText.match(/```\s*([\s\S]*?)```/);
	if (m?.[1]) {
		const parsed = tryParse(m[1].trim());
		if (Array.isArray(parsed)) return normalizeSyllabus(parsed);
	}

	// 3) 兜底：扫描第一段 JSON 数组
	const start = mdText.indexOf("[");
	const end = mdText.lastIndexOf("]");
	if (start !== -1 && end !== -1 && end > start) {
		const parsed = tryParse(mdText.substring(start, end + 1).trim());
		if (Array.isArray(parsed)) return normalizeSyllabus(parsed);
	}

	return [];
}

function normalizeSyllabus(raw: unknown[]): SyllabusItem[] {
	const out: SyllabusItem[] = [];
	for (const x of raw) {
		if (!x || typeof x !== "object") continue;
		const obj = x as Record<string, unknown>;
		const id = obj.id;
		if (typeof id !== "string" && typeof id !== "number") continue;
		out.push({ ...obj, id: String(id) } as SyllabusItem);
	}
	return out;
}

export function buildCourseSnapshot(args: {
	syllabus: SyllabusItem[];
	doneIds: Iterable<string>;
	linksById: Record<string, CourseLink>;
	courseRecommendationWindow: number;
	random?: () => number;
}): CourseSnapshot {
	const syllabus = args.syllabus ?? [];
	const doneSet = new Set<string>();
	for (const id of args.doneIds ?? []) doneSet.add(String(id));
	const linksById = args.linksById ?? {};
	const isDoneCourse = (id: string) => doneSet.has(id) || doneSet.has(simpleCourseId(id));
	const hasNote = (id: string) => Boolean(linksById[id] || linksById[simpleCourseId(id)]);
	const doneCount = syllabus.filter((s) => isDoneCourse(s.id)).length;

	const rand = args.random ?? Math.random;
	let next: SyllabusItem | undefined;
	let nextType: CourseHybridRec["type"] = "New";

	// 优先推荐“已创建笔记”的下一课（与旧 core 一致）
	next = syllabus.find((s) => !isDoneCourse(s.id) && hasNote(s.id));
	if (!next) next = syllabus.find((s) => !isDoneCourse(s.id));
	if (!next && syllabus.length > 0) {
		next = syllabus[Math.floor(rand() * syllabus.length)];
		nextType = "Review";
	}

	const phases = Array.from(new Set(syllabus.map((s) => String(s.p ?? "")))).filter(Boolean);
	const phaseGroups: CoursePhaseGroup[] = phases.map((p) => {
		const items = syllabus
			.filter((s) => String(s.p ?? "") === p)
			.map((s) => {
				const done = isDoneCourse(s.id);
				const link = linksById[s.id] || linksById[simpleCourseId(s.id)];
				const shortId = buildShortId(s.id);
				return {
					item: s,
					isDone: done,
					hasNote: Boolean(link),
					link,
					shortId,
				} as CourseMatrixItem;
			});
		return { phase: p, items };
	});

	const upNextWindow = Math.max(1, Math.min(20, Math.floor(args.courseRecommendationWindow || 1)));
	const upNext: CourseMatrixItem[] = [];
	for (const s of syllabus) {
		if (upNext.length >= upNextWindow) break;
		if (isDoneCourse(s.id)) continue;
		const link = linksById[s.id] || linksById[simpleCourseId(s.id)];
		upNext.push({
			item: s,
			isDone: false,
			hasNote: Boolean(link),
			link,
			shortId: buildShortId(s.id),
		});
	}

	return {
		syllabus,
		doneIds: Array.from(doneSet),
		linksById,
		progress: { doneCount, totalCount: syllabus.length },
		hybridRec: next ? { type: nextType, data: next } : null,
		phases: phaseGroups,
		upNext,
	};
}

function buildShortId(id: string): string {
	let shortId = String(id ?? "").replace(/^0/, "");
	if (shortId.toLowerCase().includes("bonus")) {
		shortId = "B" + shortId.replace(/[^0-9]/g, "");
	}
	return shortId;
}

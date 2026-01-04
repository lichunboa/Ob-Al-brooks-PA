export type QuizItem = {
  q: string;
  file: string;
  path: string;
  type: "Basic";
};

export type MemoryFileStat = {
  name: string;
  path: string;
  folder: string;
  count: number;
  due: number;
  avgEase: number;
};

export type MemorySnapshot = {
  total: number;
  due: number;
  masteryPct: number;
  load7d: number;
  loadNext7: Array<{ dateIso: string; count: number }>;
  cnt: {
    sNorm: number;
    sRev: number;
    mNorm: number;
    mRev: number;
    cloze: number;
  };
  status: string;
  quizPool: QuizItem[];
  focusFile: MemoryFileStat | null;
};

const SR_REGEX = /!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)/g;

function toDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildMemorySnapshot(args: {
  files: Array<{ path: string; name: string; folder: string; content: string }>;
  today: Date;
  dueThresholdDays: number;
  randomQuizCount: number;
}): MemorySnapshot {
  const today = args.today;
  const thresholdDays = Math.max(
    0,
    Math.min(30, Math.floor(args.dueThresholdDays || 0))
  );
  const thresholdDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + thresholdDays
  );
  const thresholdIso = toDateIso(thresholdDate);

  let total = 0;
  let due = 0;
  let reviewed = 0;
  let easeSum = 0;

  let cnt_sNorm = 0;
  let cnt_sRev = 0;
  let cnt_mNorm = 0;
  let cnt_mRev = 0;
  let cnt_cloze = 0;

  const todayStripped = stripTime(today);
  const loadNext7: Array<{ dateIso: string; count: number }> = Array.from(
    { length: 7 },
    (_, idx) => {
      const offset = idx + 1;
      const d = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + offset
      );
      return { dateIso: toDateIso(d), count: 0 };
    }
  );

  const quizAll: QuizItem[] = [];
  const fileStats: MemoryFileStat[] = [];

  for (const f of args.files ?? []) {
    const content = String(f.content ?? "");
    if (!content) continue;

    const clean = content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]*`/g, "");

    const c_cloze = (clean.match(/==[^=]+==/g) || []).length;
    const c_sRev = (clean.match(/(?<!:):{3}(?!:)/g) || []).length;
    const c_sNorm = (clean.match(/(?<!:):{2}(?!:)/g) || []).length;
    const c_mRev = (clean.match(/^(?:\>)?\s*\?{2}\s*$/gm) || []).length;
    const c_mNorm = (clean.match(/^(?:\>)?\s*\?{1}\s*$/gm) || []).length;

    cnt_cloze += c_cloze;
    cnt_sRev += c_sRev;
    cnt_sNorm += c_sNorm;
    cnt_mRev += c_mRev;
    cnt_mNorm += c_mNorm;

    const fileCards = c_cloze + c_sNorm + c_mNorm + c_sRev * 2 + c_mRev * 2;
    total += fileCards;

    // Basic quiz pool
    const singleMatches = [...clean.matchAll(/^(.+?)::(.+)$/gm)];
    for (const m of singleMatches) {
      quizAll.push({
        q: String(m[1] ?? "").trim(),
        file: f.name,
        path: f.path,
        type: "Basic",
      });
    }

    let fDue = 0;
    let fEaseSum = 0;
    let fEaseCount = 0;

    const matches = [...content.matchAll(SR_REGEX)];
    for (const m of matches) {
      reviewed += 1;
      const d = String(m[1] ?? "");
      const ease = Number.parseInt(String(m[3] ?? ""), 10);
      if (Number.isFinite(ease)) {
        easeSum += ease;
        fEaseSum += ease;
        fEaseCount += 1;
      }

      // loadNext7: count scheduled reviews within next 7 days from today (independent of dueThresholdDays)
      const dDateForLoad = parseIsoDate(d);
      if (dDateForLoad) {
        const diffDays = Math.floor(
          (stripTime(dDateForLoad).getTime() - todayStripped.getTime()) /
            86400000
        );
        if (diffDays >= 1 && diffDays <= 7) {
          const i = diffDays - 1;
          if (loadNext7[i]) loadNext7[i].count += 1;
        }
      }

      if (d <= thresholdIso) {
        due += 1;
        fDue += 1;
      }
    }

    const avgEase = fEaseCount > 0 ? Math.round(fEaseSum / fEaseCount) : 250;
    if (fileCards > 0) {
      fileStats.push({
        name: f.name,
        path: f.path,
        folder: f.folder,
        count: fileCards,
        due: fDue,
        avgEase,
      });
    }
  }

  // focusFile: due files hardest first (low avgEase), else hardest overall
  let focusFile: MemoryFileStat | null = null;
  const dueFiles = fileStats.filter((x) => x.due > 0);
  if (dueFiles.length > 0) {
    dueFiles.sort((a, b) => a.avgEase - b.avgEase);
    focusFile = dueFiles[0] ?? null;
  } else if (fileStats.length > 0) {
    const hard = [...fileStats].sort((a, b) => a.avgEase - b.avgEase);
    focusFile = hard[0] ?? null;
  }

  const masteryPct =
    total > 0
      ? Math.max(0, Math.min(100, Math.round(((total - due) / total) * 100)))
      : 0;
  let status = "🌱 初始";
  if (total === 0) status = "⚪️ 空";
  else if (due > 50) status = "🔥 积压";
  else if (masteryPct < 70) status = "🧠 吃力";
  else if (masteryPct > 90) status = "🦁 精通";
  else status = "🟢 健康";

  // Random quiz pool (stable slice size)
  const quizPool = pickRandomDistinct(
    quizAll,
    Math.max(1, Math.min(50, Math.floor(args.randomQuizCount || 5)))
  );

  const load7d = loadNext7.reduce((sum, x) => sum + (x.count || 0), 0);

  return {
    total,
    due,
    masteryPct,
    load7d,
    loadNext7,
    cnt: {
      sNorm: cnt_sNorm,
      sRev: cnt_sRev,
      mNorm: cnt_mNorm,
      mRev: cnt_mRev,
      cloze: cnt_cloze,
    },
    status,
    quizPool,
    focusFile,
  };
}

function pickRandomDistinct<T>(arr: T[], n: number): T[] {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const k = Math.min(n, arr.length);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

function parseIsoDate(iso: string): Date | null {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  const d = Number.parseInt(m[3], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || !Number.isFinite(d))
    return null;
  return new Date(y, mm - 1, d);
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

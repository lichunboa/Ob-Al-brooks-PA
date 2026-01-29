export type QuizItem = {
  q: string;           // 问题显示文本（填空题用 ___ 替换）
  answer?: string;     // 答案（单行卡片是 :: 后面的内容，填空题是原始内容）
  rawQ?: string;       // 原始问题行（含 ==xxx== 标记）
  file: string;
  path: string;
  type: "Basic" | "Cloze" | "Multiline";
  lineNumber?: number; // 卡片所在行号（1-indexed）
  // 策略关联
  relatedStrategy?: string;   // 关联的策略名称
  strategyWinRate?: number;   // 策略胜率 (0-100)
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
  // loadNext7: 从今天开始的7天，索引0=今天，1=明天，...，6=第7天
  // 过期的卡片会累积到今天（索引0）
  const loadNext7: Array<{ dateIso: string; count: number }> = Array.from(
    { length: 7 },
    (_, idx) => {
      const d = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + idx  // 从今天开始 (idx=0 是今天)
      );
      return { dateIso: toDateIso(d), count: 0 };
    }
  );

  const quizAll: QuizItem[] = [];
  const fileStats: MemoryFileStat[] = [];

  for (const f of args.files ?? []) {
    const content = String(f.content ?? "");
    if (!content) continue;

    // 行号计算辅助函数（在原始 content 中搜索文本并计算行号）
    const findLineNumber = (searchText: string) => {
      // 获取搜索文本的第一行（更准确的匹配）
      const firstLine = searchText.split('\n')[0].trim();
      if (!firstLine || firstLine.length < 3) return undefined;

      // 在原始 content 中搜索
      const idx = content.indexOf(firstLine);
      if (idx === -1) return undefined;

      // 计算行号
      const before = content.substring(0, idx);
      return (before.match(/\n/g) || []).length + 1;
    };

    const clean = content
      // 排除 frontmatter (--- ... ---)
      .replace(/^---[\s\S]*?---\n?/m, "")
      // 排除代码块
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]*`/g, "");

    // --- Card Counting Logic (Consumption Model) ---
    // We remove matched cards from the buffer to prevent double-counting 
    // (e.g., preventing a Basic card with a highlight from counting as both Basic and Cloze).

    let buffer = clean;
    let itemsFoundBasic = 0;

    // 1. Basic Cards (::)
    const regexBasic = /^(.+?)::(.+)$/gm;
    const basicMatches = [...buffer.matchAll(regexBasic)];
    itemsFoundBasic = basicMatches.length;
    cnt_sNorm += itemsFoundBasic;
    buffer = buffer.replace(regexBasic, ""); // Remove matched lines

    // 2. Multiline Reverse (??)
    const regexMRev = /^(?:\>)?\s*\?{2}\s*$/gm;
    cnt_mRev += (buffer.match(regexMRev) || []).length;
    buffer = buffer.replace(regexMRev, "");

    // 3. Multiline Normal (?)
    const regexMNorm = /^(?:\>)?\s*\?{1}\s*$/gm;
    cnt_mNorm += (buffer.match(regexMNorm) || []).length;
    buffer = buffer.replace(regexMNorm, "");

    // 4. Single Line Reverse (:::)
    const regexSRev = /(?<!:):{3}(?!:)/g;
    cnt_sRev += (buffer.match(regexSRev) || []).length;
    buffer = buffer.replace(regexSRev, "");

    // 5. Basic Inline (::) - Catching any remaining inline basics not caught by start-of-line regex?
    // Note: Standard SR usually requires :: to separate Q/A. 
    // To match strict SR logic, we might not need this if line-based is sufficient, 
    // but to be safe and compatible with previous logic:
    const regexInlineBasic = /(?<!:):{2}(?!:)/g;
    const inlineBasicCount = (buffer.match(regexInlineBasic) || []).length;
    cnt_sNorm += inlineBasicCount;
    buffer = buffer.replace(regexInlineBasic, "");

    // 6. Cloze Deletions (==) - Count by LINES containing ==, not individual markers
    // 官方 SRS 插件按包含填空的行数计数，而非填空标记数
    const clozeLineCount = (buffer.match(/^.*==[^=]+==/gm) || []).length;
    cnt_cloze += clozeLineCount;

    // File Total
    // Note: Reverse cards typically generate 2 cards (Forward + Backward).
    // 注意：填空题每行算1张卡片，不是每个填空项
    const currentFileCardCount =
      itemsFoundBasic +
      (cnt_mRev * 2) +
      (cnt_sRev * 2) +
      cnt_mNorm +
      clozeLineCount;

    total += currentFileCardCount;

    // --- Quiz Pool Population ---
    // 1. Basic 卡片 (::)
    for (const m of basicMatches) {
      quizAll.push({
        q: String(m[1] ?? "").trim(),
        answer: String(m[2] ?? "").trim(),  // 保存答案
        file: f.name,
        path: f.path,
        type: "Basic",
        lineNumber: findLineNumber(String(m[1] ?? "").trim()),
      });
    }

    // 2. 多行问答卡片 (?) - 提取问题和答案
    // 格式: 问题\n?\n答案（直到 --- 或空行）
    const multilineRegex = /^(.+)\n\?\n([\s\S]*?)(?=\n---|\n\n|$)/gm;
    const multilineMatches = [...clean.matchAll(multilineRegex)];
    for (const m of multilineMatches) {
      const question = String(m[1] ?? "").trim();
      const answer = String(m[2] ?? "").trim();
      if (question.length > 3) {
        quizAll.push({
          q: question,
          answer: answer,  // 保存答案
          rawQ: `${question}\n?\n${answer}`,  // 原始内容
          file: f.name,
          path: f.path,
          type: "Multiline",  // 标记为多行类型
          lineNumber: findLineNumber(question),
        });
      }
    }

    // 2b. 多行复杂问答卡片 (??) - 同样提取问题和答案
    // ?? 后可能有空行，用 --- 作为答案终止符
    const multilineComplexRegex = /^(.+)\n\?\?\n\n?([\s\S]*?)(?=\n---)/gm;
    const multilineComplexMatches = [...clean.matchAll(multilineComplexRegex)];
    for (const m of multilineComplexMatches) {
      const question = String(m[1] ?? "").trim();
      const answer = String(m[2] ?? "").trim();
      if (question.length > 3 && answer.length > 0) {
        quizAll.push({
          q: question,
          answer: answer,
          rawQ: `${question}\n??\n${answer}`,
          file: f.name,
          path: f.path,
          type: "Multiline",
          lineNumber: findLineNumber(question),
        });
      }
    }

    // 3. 填空题 - 支持多种格式
    // 格式1: ==xxx== (Obsidian 高亮)
    // 格式2: {{xxx}} (双大括号)
    // 格式3: {{c1::xxx}} (Anki 语法)

    // 统一的填空模式检测正则
    const clozePatterns = [
      /==([^=]+)==/g,           // ==答案==
      /\{\{c\d+::([^}]+)\}\}/g, // {{c1::答案}}
      /\{\{([^}:]+)\}\}/g,      // {{答案}} (不含 c1:: 的简化版)
    ];

    // 检测行是否包含填空
    const hasCloze = (line: string) => clozePatterns.some(p => p.test(line));

    // 模板变量黑名单（这些不是填空题）
    const templateVars = new Set([
      'date', 'time', 'title', 'folder', 'filename', 'now', 'today', 'yesterday', 'tomorrow',
      'week', 'month', 'year', 'hour', 'minute', 'second',
    ]);

    // 检测是否是模板变量
    const isTemplateVar = (text: string): boolean => {
      const lower = text.toLowerCase().trim();
      // 检查是否在黑名单中
      if (templateVars.has(lower)) return true;
      // 检查是否包含冒号（模板格式如 time:dddd）
      if (lower.includes(':')) return true;
      // 检查是否全是小写字母（单个单词的模板变量）
      if (/^[a-z]+$/.test(lower) && lower.length <= 10) return true;
      return false;
    };

    // 提取所有填空答案
    const extractClozeAnswers = (line: string): string[] => {
      const answers: string[] = [];
      // ==xxx==
      for (const m of line.matchAll(/==([^=]+)==/g)) answers.push(m[1]);
      // {{c1::xxx}}
      for (const m of line.matchAll(/\{\{c\d+::([^}]+)\}\}/g)) answers.push(m[1]);
      // {{xxx}} (排除模板变量和已匹配的 c1:: 格式)
      for (const m of line.matchAll(/\{\{([^}]+)\}\}/g)) {
        const content = m[1];
        // 排除 c1:: 格式（已在上面处理）
        if (/^c\d+::/.test(content)) continue;
        // 排除模板变量
        if (isTemplateVar(content)) continue;
        if (!answers.includes(content)) answers.push(content);
      }
      return answers;
    };

    // 替换所有填空为 [...]
    const replaceCloze = (line: string): string => {
      return line
        .replace(/==([^=]+)==/g, "[...]")
        .replace(/\{\{c\d+::([^}]+)\}\}/g, "[...]")
        .replace(/\{\{([^}:]+)\}\}/g, "[...]");
    };

    // 匹配包含填空的行
    const lines = clean.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('-')) continue;

      // 重置正则 lastIndex
      clozePatterns.forEach(p => p.lastIndex = 0);

      if (hasCloze(line)) {
        const clozeAnswers = extractClozeAnswers(line);
        const displayQ = replaceCloze(line);

        if (displayQ.length > 5 && clozeAnswers.length > 0) {
          quizAll.push({
            q: displayQ,
            answer: clozeAnswers.join(", "),
            rawQ: line,
            file: f.name,
            path: f.path,
            type: "Cloze",
            lineNumber: findLineNumber(line),
          });
        }
      }
    }

    // --- SR Metadata Parsing ---
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

      // loadNext7: 计算从今天开始7天内的复习任务
      // 过期卡片（diffDays <= 0）累积到今天（索引0）
      const dDateForLoad = parseIsoDate(d);
      if (dDateForLoad) {
        const diffDays = Math.floor(
          (stripTime(dDateForLoad).getTime() - todayStripped.getTime()) /
          86400000
        );
        if (diffDays <= 0) {
          // 过期或今天到期的卡片，累积到今天（索引0）
          loadNext7[0].count += 1;
        } else if (diffDays >= 1 && diffDays <= 6) {
          // 未来1-6天的卡片（索引1-6）
          if (loadNext7[diffDays]) loadNext7[diffDays].count += 1;
        }
      }

      if (d <= thresholdIso) {
        due += 1;
        fDue += 1;
      }
    }

    const avgEase = fEaseCount > 0 ? Math.round(fEaseSum / fEaseCount) : 250;
    if (currentFileCardCount > 0) {
      fileStats.push({
        name: f.name,
        path: f.path,
        folder: f.folder,
        count: currentFileCardCount,
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

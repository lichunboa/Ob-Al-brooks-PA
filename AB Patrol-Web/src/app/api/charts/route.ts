import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const CHART_ROOTS = [
  "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/charts",
  "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/data/charts",
];

export async function GET(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get("path") || "";
  if (!rel) {
    return NextResponse.json({ error: "missing path" }, { status: 400 });
  }

  const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolvedCandidates = CHART_ROOTS.map((root) => ({
    rootResolved: path.resolve(root),
    resolved: path.resolve(root, normalized),
  })).filter(({ rootResolved, resolved }) => resolved.startsWith(rootResolved));

  if (resolvedCandidates.length === 0) {
    return NextResponse.json({ error: "invalid chart path" }, { status: 400 });
  }

  for (const { resolved } of resolvedCandidates) {
    try {
      const buffer = await fs.readFile(resolved);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "chart not found" }, { status: 404 });
}

import { NextResponse } from "next/server";
import { execFileSync } from "child_process";

const QUERY_BASE = process.env.AB_PATROL_QUERY_BASE || "http://127.0.0.1:8086";
const CONTROL_SCRIPT =
  "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/pa_crypto_control.py";

export async function GET() {
  try {
    const res = await fetch(`${QUERY_BASE}/api/v1/runtime/full`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`query-service http ${res.status}`);
    }
    const payload = await res.json();
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    try {
      const stdout = execFileSync("python3", [CONTROL_SCRIPT, "full"], {
        encoding: "utf-8",
        maxBuffer: 8 * 1024 * 1024,
      });
      const payload = JSON.parse(stdout);
      return NextResponse.json(
        {
          ...payload,
          fallback: true,
          fallback_reason: error instanceof Error ? error.message : "query-service unavailable",
        },
        { status: 200 },
      );
    } catch (fallbackError) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "query-service unavailable",
          fallback_error: fallbackError instanceof Error ? fallbackError.message : "local fallback failed",
        },
        { status: 502 },
      );
    }
  }
}

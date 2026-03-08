import { NextResponse } from "next/server";

const QUERY_BASE = process.env.AB_PATROL_QUERY_BASE || "http://127.0.0.1:8086";

export async function GET() {
  try {
    const res = await fetch(`${QUERY_BASE}/api/v1/runtime/full`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: `query-service http ${res.status}` }, { status: 502 });
    }
    const payload = await res.json();
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "query-service unavailable" },
      { status: 502 },
    );
  }
}

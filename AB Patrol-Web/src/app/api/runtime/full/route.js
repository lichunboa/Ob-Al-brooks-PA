import { NextResponse } from "next/server";
import { execFileSync } from "child_process";
import fs from "fs";

export const dynamic = "force-dynamic";

const QUERY_BASE = process.env.AB_PATROL_QUERY_BASE || "http://127.0.0.1:8086";
const CONTROL_SCRIPT =
  "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/ops/pa_crypto_control.py";
const PATROL_DATA =
  "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader";

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function enrichMonitoring(payload) {
  const snapshot = payload?.snapshot && typeof payload.snapshot === "object" ? payload.snapshot : {};
  const latestCycle = snapshot?.latest_cycle && typeof snapshot.latest_cycle === "object" ? snapshot.latest_cycle : {};
  const decision = latestCycle?.decision && typeof latestCycle.decision === "object" ? latestCycle.decision : {};
  const statePatch = decision?.state_patch && typeof decision.state_patch === "object" ? decision.state_patch : {};
  const knowledge = statePatch?.knowledge_loading && typeof statePatch.knowledge_loading === "object"
    ? statePatch.knowledge_loading
    : {};
  const requestPath = `${PATROL_DATA}/logs/decision/last_request.md`;
  const sessionState = readJson(`${PATROL_DATA}/state/decision_session.json`);
  const requestText = fs.existsSync(requestPath) ? fs.readFileSync(requestPath, "utf-8") : "";
  const requestSizeBytes = fs.existsSync(requestPath) ? fs.statSync(requestPath).size : 0;
  let sessionAgeSeconds = null;
  if (sessionState?.bootstrapped_at) {
    const age = Math.floor(Date.now() / 1000 - Number(sessionState.bootstrapped_at));
    sessionAgeSeconds = Number.isFinite(age) ? Math.max(0, age) : null;
  }
  const monitoring = {
    knowledge_chars: knowledge.knowledge_chars ?? null,
    refs_count: Number(knowledge.full_reference_count || 0) + Number(knowledge.brief_reference_count || 0),
    full_refs_count: Number(knowledge.full_reference_count || 0),
    brief_refs_count: Number(knowledge.brief_reference_count || 0),
    request_chars: requestText.length,
    request_size_bytes: requestSizeBytes,
    session_age_seconds: sessionAgeSeconds,
    session_turn_count: sessionState?.turn_count ?? null,
    session_thread_id: sessionState?.thread_id ?? null,
    session_model: sessionState?.model ?? null,
  };
  return {
    ...payload,
    snapshot: {
      ...snapshot,
      monitoring,
    },
  };
}

export async function GET() {
  try {
    const res = await fetch(`${QUERY_BASE}/api/v1/runtime/full`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`query-service http ${res.status}`);
    }
    const payload = await res.json();
    return NextResponse.json(enrichMonitoring(payload), { status: 200 });
  } catch (error) {
    try {
      const stdout = execFileSync("python3", [CONTROL_SCRIPT, "full"], {
        encoding: "utf-8",
        maxBuffer: 8 * 1024 * 1024,
      });
      const payload = JSON.parse(stdout);
      return NextResponse.json(
        enrichMonitoring({
          ...payload,
          fallback: true,
          fallback_reason: error instanceof Error ? error.message : "query-service unavailable",
        }),
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

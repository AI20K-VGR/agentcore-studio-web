/**
 * Playground API client (D15, issue kit#102) — gọi `dev_playground_server.py`
 * (`packages/workbench/dev_playground_server.py`) lúc dev.
 *
 * `apps/studio` (composition root FastAPI thật) chưa có route nào (Owner:
 * mentor, xem `apps/studio/pyproject.toml`) nên D15 chưa thể trỏ thẳng vào
 * đó. `baseUrl()` đọc từ `VITE_PLAYGROUND_API_URL` — khi route thật xuất
 * hiện, đổi 1 biến môi trường là xong, không đổi hình dạng gọi ở đây hay ở
 * `TraceViewer.tsx`.
 */

import type { WireRecipe } from "../recipe/contract";

export interface WireTokens {
  prompt: number;
  completion: number;
}

/** TS mirror của `studio_contracts.trace.TraceEvent` — cùng quy ước "chỉ đi
 * theo, không đi trước" bản Python như `recipe/contract.ts`. */
export interface WireTraceEvent {
  event_id: string;
  run_id: string;
  agent_id: string;
  tenant_id: string;
  node_id: string;
  node_type: string;
  ts: string;
  inputs_hash: string;
  outputs: Record<string, unknown>;
  tokens: WireTokens;
  cost: number;
  citations: string[] | null;
}

/** Output THẬT của `score_run_from_trace()` (`studio_evalhub.run_report`, AIE-2) — server tự
 * "available: false" khi PR evalhub#15 chưa merge, không phải điểm bịa. */
export interface WireScore {
  available: boolean;
  scored?: boolean;
  message?: string;
  case_id?: string;
  success?: boolean;
  citation_accuracy?: number;
  citations?: string[];
}

export interface RunResponse {
  run_id: string;
  agent_id: string | null;
  tenant_id: string;
  events: WireTraceEvent[];
  /** Output THẬT của `render_timeline()` (`studio_kb.trace_reader`, DE) — không phải bản dựng
   * lại phía TS. `null` khi trace không tìm thấy (tenant sai / run_id sai). */
  timeline_text: string | null;
  score: WireScore | null;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:8787";

function baseUrl(): string {
  const fromEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_PLAYGROUND_API_URL;
  return fromEnv ?? DEFAULT_BASE_URL;
}

export class PlaygroundApiError extends Error {}

async function readJsonOrThrow(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new PlaygroundApiError(message);
  }
  return body;
}

/** Bấm Test: POST recipe hiện tại → interpreter chạy → trả `run_id`. */
export async function runRecipe(recipe: WireRecipe): Promise<RunResponse> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe }),
    });
  } catch {
    throw new PlaygroundApiError(
      `Không gọi được playground server tại ${baseUrl()} — server đã chạy chưa? ` +
        "(`uv run python packages/workbench/dev_playground_server.py`)",
    );
  }
  return (await readJsonOrThrow(res)) as RunResponse;
}

/**
 * Đọc lại trace bằng đúng `run_id` vừa nhận từ `runRecipe()`, qua 1 request
 * TÁCH RIÊNG (không tin thẳng response của POST) — đây là phép thử thật cho
 * DoD Day 15 "run_id/agent_id khớp giữa recipe và trace": nếu 2 phía lệch
 * nhau, GET sẽ về rỗng (`found: false`) thay vì âm thầm trả đại dữ liệu khác.
 */
export async function fetchTrace(runId: string, tenantId: string): Promise<RunResponse> {
  let res: Response;
  const url = `${baseUrl()}/api/runs/${encodeURIComponent(runId)}?tenant_id=${encodeURIComponent(tenantId)}`;
  try {
    res = await fetch(url);
  } catch {
    throw new PlaygroundApiError(`Không gọi được playground server tại ${baseUrl()}.`);
  }
  return (await readJsonOrThrow(res)) as RunResponse;
}

/**
 * Client gọi route Test THẬT của `apps/studio` (`POST /api/runs`, `GET /api/runs/{run_id}` —
 * `apps/studio/src/studio_app/routes/runs.py`) — THAY `playground/api.ts` (gọi
 * `dev_playground_server.py`, server tạm cũ, không còn dùng nữa).
 *
 * Khác biệt hình dạng quan trọng với `playground/api.ts`: server cũ nhận NGUYÊN 1 `WireRecipe`
 * lồng nhau (`{"recipe": {...}}`, qua `Recipe.model_validate()`); route mới nhận CÁC FIELD RỜI
 * (khớp `RunRequest` ở `routes/runs.py`) — không có `tenant_id` (đến từ JWT, không phải body).
 * `flattenRecipe()` bên dưới làm phần chuyển đổi đó — không đổi `buildRecipe()`
 * (`recipe/fromCanvas.ts`, vẫn dùng cho tab JSON/export/fixture).
 */

import type { WireRecipe } from "../recipe/contract";
import type { WireTraceEvent } from "../playground/api";
import { authHeader, type Session } from "../auth/session";
import { studioBaseUrl, StudioApiError } from "../auth/api";

export interface StudioRunResponse {
  run_id: string;
  agent_id: string;
  tenant_id: string;
  events: WireTraceEvent[];
  timeline_text: string | null;
}

async function readJsonOrThrow(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : null;
    const message = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `HTTP ${res.status}`;
    throw new StudioApiError(message);
  }
  return body;
}

function flattenRecipe(recipe: WireRecipe): Record<string, unknown> {
  // `recipe.tenant_id` CỐ Ý bị bỏ qua ở đây — route mới không có chỗ nào nhận nó từ body
  // (`RunRequest` không có field `tenant_id`), tenant luôn đến từ JWT của session.
  return {
    agent_id: recipe.agent_id,
    instructions: recipe.agent_config.instructions,
    model: recipe.agent_config.model,
    tool_whitelist: recipe.agent_config.tool_whitelist,
    kb_id: recipe.kb_binding.kb_id,
    scope: recipe.kb_binding.scope,
    nodes: recipe.dag.nodes,
    edges: recipe.dag.edges,
    golden_set_ref: recipe.golden_set_ref,
    success_threshold: recipe.scorecard_threshold.success,
    citation_accuracy_threshold: recipe.scorecard_threshold.citation_accuracy,
  };
}

/** Bấm Test: POST recipe hiện tại → `interpreter.run()` chạy thật qua `apps/studio` → `run_id`. */
export async function runRecipe(recipe: WireRecipe, session: Session): Promise<StudioRunResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify(flattenRecipe(recipe)),
    });
  } catch {
    throw new StudioApiError(
      `Không gọi được apps/studio tại ${studioBaseUrl()} — server đã chạy chưa? ` +
        "(`uv run uvicorn studio_app.app:create_app --factory` trong apps/studio)",
    );
  }
  return (await readJsonOrThrow(res)) as StudioRunResponse;
}

/** Đọc lại trace bằng đúng `run_id` vừa nhận từ `runRecipe()`, qua 1 request TÁCH RIÊNG (không
 * tin thẳng response của POST) — cùng nguyên tắc D15 đã có ở `playground/api.ts::fetchTrace`. */
export async function fetchTrace(runId: string, session: Session): Promise<StudioRunResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/runs/${encodeURIComponent(runId)}`, {
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(`Không gọi được apps/studio tại ${studioBaseUrl()}.`);
  }
  return (await readJsonOrThrow(res)) as StudioRunResponse;
}

/** TS mirror của `studio_contracts.scorecard.Scorecard` — chỉ những field UI cần hiển thị, không
 * chép hết `CaseResult`/`Judge` (chưa dùng tới). */
export interface Scorecard {
  agent_id: string;
  golden_set_ref: string;
  aggregate: {
    success_rate: number;
    citation_accuracy: number | null;
    n_scored_citation: number | null;
  };
  gate: {
    threshold: { success: number; citation_accuracy: number };
    verdict: "PASS" | "FAIL";
  };
  recipe_hash: string | null;
}

export type PublishResult =
  | { status: "published"; scorecard: Scorecard }
  | { status: "blocked"; message: string; scorecard: Scorecard | null };

/** Bấm "Chấm điểm": `POST /api/agents/{agent_id}/evaluate` (`routes/publish.py::evaluate_agent`) —
 * chạy NGUYÊN golden set qua `EvalHarness.run()` thật, trả `Scorecard`, KHÔNG ghi `wb.recipes`.
 * Cho UI biết trước verdict để bật/tắt nút Publish — nhưng đây chỉ là GỢI Ý hiển thị: `publishAgent`
 * bên dưới KHÔNG nhận thẳng Scorecard này, nó luôn tự gọi lại `/publish` (mà route đó tự chấm lại
 * từ đầu ở server) — tránh đúng lỗi "tag vs fence" (tin state UI thay vì server tự verify lại). */
export async function evaluateAgent(recipe: WireRecipe, session: Session): Promise<Scorecard> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents/${encodeURIComponent(recipe.agent_id)}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify(flattenRecipe(recipe)),
    });
  } catch {
    throw new StudioApiError(
      `Không gọi được apps/studio tại ${studioBaseUrl()} — server đã chạy chưa?`,
    );
  }
  const body = (await readJsonOrThrow(res)) as { scorecard: Scorecard };
  return body.scorecard;
}

/** Bấm Publish: `POST /api/agents/{agent_id}/publish` (`routes/publish.py`) — chạy NGUYÊN golden
 * set qua `EvalHarness.run()` thật rồi gate qua `publish()` thật. `409` là kết quả HỢP LỆ ("recipe
 * đúng nhưng CHƯA đủ điều kiện xuất bản" — vd `gate.verdict='FAIL'`, hoặc hiện tại LUÔN vì
 * `recipe_hash` chưa có producer từ AIE-2), không phải lỗi hệ thống — nên KHÔNG throw ở nhánh đó,
 * trả về `{status: "blocked", ...}` để UI hiển thị lý do + scorecard thật, thay vì chỉ báo lỗi.*/
export async function publishAgent(recipe: WireRecipe, session: Session): Promise<PublishResult> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents/${encodeURIComponent(recipe.agent_id)}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify(flattenRecipe(recipe)),
    });
  } catch {
    throw new StudioApiError(
      `Không gọi được apps/studio tại ${studioBaseUrl()} — server đã chạy chưa?`,
    );
  }

  const body = await res.json().catch(() => null);

  if (res.status === 409) {
    const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : null;
    const message =
      detail && typeof detail === "object" && "message" in detail
        ? String((detail as { message: unknown }).message)
        : `HTTP 409`;
    const scorecard =
      detail && typeof detail === "object" && "scorecard" in detail
        ? ((detail as { scorecard: unknown }).scorecard as Scorecard)
        : null;
    return { status: "blocked", message, scorecard };
  }

  if (!res.ok) {
    const detail = body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : null;
    const message = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `HTTP ${res.status}`;
    throw new StudioApiError(message);
  }

  return { status: "published", scorecard: (body as { scorecard: Scorecard }).scorecard };
}

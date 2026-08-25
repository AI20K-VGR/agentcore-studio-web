/**
 * Client gọi các route của `apps/studio` liên quan Test/Eval/Publish
 * (`apps/studio/src/studio_app/routes/{runs,publish}.py`) — THAY `playground/api.ts` (gọi
 * `dev_playground_server.py`, server tạm cũ, không còn dùng nữa).
 *
 * `POST /api/runs` (app#44/app#48, web#18) ĐỔI HẲN Ý NGHĨA so với bản đầu: không còn chạy
 * `interpreter.run()` — giờ chỉ là connectivity-check TĨNH, xác nhận từng tool trong
 * `tool_whitelist` có executor/dispatcher thật hay không (`PROJECT-SCOPE-DEMO-DAY30.md` mục D).
 * KHÔNG tạo run/trace, KHÔNG có `run_id` trong response. Việc "chạy thử 1 câu hỏi + xem trace"
 * (mục E) chuyển hẳn sang `POST /api/agents/{id}/chat` — xem `chat/api.ts::sendChatMessage()`.
 *
 * `flattenRecipe()` bên dưới vẫn dùng cho `/evaluate`/`/publish` (route `publish.py::PublishRequest`
 * vẫn cần nguyên `nodes`/`edges`/`kb_id`/... để dựng `recipe.dag`) — không đổi `buildRecipe()`
 * (`recipe/fromCanvas.ts`, vẫn dùng cho tab JSON/export/fixture).
 */

import type { WireRecipe } from "../recipe/contract";
import type { WireTraceEvent } from "../playground/api";
import { authHeader, type Session } from "../auth/session";
import { StudioApiError, networkErrorHint, readJsonOrThrow, studioBaseUrl } from "../httpUtil";

export interface StudioRunResponse {
  run_id: string;
  agent_id: string;
  tenant_id: string;
  events: WireTraceEvent[];
  timeline_text: string | null;
}

function flattenRecipe(recipe: WireRecipe): Record<string, unknown> {
  // `recipe.tenant_id` CỐ Ý bị bỏ qua ở đây — route mới không có chỗ nào nhận nó từ body
  // (`RunRequest` không có field `tenant_id`), tenant luôn đến từ JWT của session.
  return {
    agent_id: recipe.agent_id,
    system_prompt: recipe.agent_config.system_prompt,
    model: recipe.agent_config.model,
    tool_whitelist: recipe.agent_config.tool_whitelist,
    kb_id: recipe.kb_binding.kb_id || "kb-callisto-v1",
    scope: recipe.kb_binding.scope || "ankor/public",
    nodes: recipe.dag.nodes,
    edges: recipe.dag.edges,
    golden_set_ref: recipe.golden_set_ref || "callisto-2.0-golden-30-v1",
    success_threshold: recipe.scorecard_threshold.success,
    citation_accuracy_threshold: recipe.scorecard_threshold.citation_accuracy,
  };
}

/** Kết quả connectivity-check của 1 tool — `status` để string MỞ (khớp response backend
 * `list[dict[str,str]]` trần, không phải union đóng): UI fail-closed, chỉ coi `"OK"` là nối
 * được, mọi giá trị khác (kể cả giá trị lạ chưa biết) đều hiển thị như chưa nối được. */
export interface ConnectivityCheckResult {
  tool: string;
  status: string;
}

export interface ConnectivityCheckResponse {
  agent_id: string;
  results: ConnectivityCheckResult[];
}

/** Bấm Test: connectivity-check TĨNH qua `POST /api/runs` (`routes/runs.py::create_run` sau
 * app#44/app#48) — xác nhận từng tool trong `tool_whitelist` có executor/dispatcher thật, KHÔNG
 * chạy interpreter, KHÔNG tạo run/trace. */
export async function checkToolConnectivity(
  agentId: string,
  toolWhitelist: string[],
  session: Session,
): Promise<ConnectivityCheckResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ agent_id: agentId, tool_whitelist: toolWhitelist }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as ConnectivityCheckResponse;
}

/** Đọc lại trace bằng `run_id` — GIỜ đến từ `chat/api.ts::sendChatMessage()` (mục E), không còn
 * từ route Test nữa (mục D không tạo run/trace). Vẫn 1 request TÁCH RIÊNG khỏi response POST
 * (không tin thẳng) — cùng nguyên tắc D15 đã có ở `playground/api.ts::fetchTrace`. */
export async function fetchTrace(runId: string, session: Session): Promise<StudioRunResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/runs/${encodeURIComponent(runId)}`, {
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
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
  // `scorecard: null` + `message` — nhánh "rollback" (`App.tsx::handlePublish`, version chưa sửa
  // gì): đưa 1 version CŨ lên live qua `rollbackAgent()`, không chạy `EvalHarness` lại nên không
  // có scorecard MỚI để hiện (bản đó đã tự có scorecard riêng từ lúc publish gốc).
  | { status: "published"; scorecard: Scorecard | null; message?: string }
  | { status: "blocked"; message: string; scorecard: Scorecard | null };

/** Bấm "Chấm điểm": `POST /api/agents/{agent_id}/evaluate` (`routes/publish.py::evaluate_agent`) —
 * chạy NGUYÊN golden set qua `EvalHarness.run()` thật, trả `Scorecard`, KHÔNG gọi `publish()`,
 * KHÔNG ghi `wb.recipes`. Dùng để xem điểm TRƯỚC khi quyết bấm Publish — nút Publish chỉ sáng khi
 * verdict ở đây là "PASS" cho ĐÚNG recipe hiện tại trên canvas (App.tsx tự so khớp bằng snapshot
 * JSON, không tin cờ boolean rời rạc dễ lệch theo state).
 *
 * Đây chỉ là gợi ý UX — server LUÔN tự chấm lại từ đầu khi bấm Publish thật (`_evaluate()` dùng
 * chung cho cả 2 route), không tin thẳng verdict client tự khai từ lần gọi này. */
export async function evaluateAgent(recipe: WireRecipe, session: Session): Promise<Scorecard> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents/${encodeURIComponent(recipe.agent_id)}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify(flattenRecipe(recipe)),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  const body = (await readJsonOrThrow(res)) as { agent_id: string; tenant_id: string; scorecard: Scorecard };
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
    throw new StudioApiError(networkErrorHint());
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

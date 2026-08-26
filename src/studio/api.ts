/**
 * Client gọi các route của `apps/studio` liên quan Eval/Publish
 * (`apps/studio/src/studio_app/routes/publish.py`) — THAY `playground/api.ts` (gọi
 * `dev_playground_server.py`, server tạm cũ, không còn dùng nữa).
 *
 * Nút Test giờ là 1 khung chat thật trên draft (`playground/testChatApi.ts`, gọi
 * `routes/test_chat.py`) — module này không còn liên quan gì tới Test nữa, chỉ còn Eval/Publish +
 * đọc lại trace (`fetchTrace`, dùng chung cho cả tab "Dùng thử" lẫn nút Test).
 *
 * `flattenRecipe()` bên dưới vẫn dùng cho `/evaluate`/`/publish` (route `publish.py::PublishRequest`
 * vẫn cần nguyên `nodes`/`edges`/`kb_id`/... để dựng `recipe.dag`) — không đổi `buildRecipe()`
 * (`recipe/fromCanvas.ts`, vẫn dùng cho tab JSON/export/fixture).
 */

import type { WireRecipe } from "../recipe/contract";
import type { WireTraceEvent } from "../playground/api";
import { authHeader, type Session } from "../auth/session";
import type { EvalJob, EvalJobStatus } from "./evalJob";
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
    // `PublishRequest.temperature` (backend) — trước bản vá này FE không gửi field này, server
    // luôn nhận mặc định 0.7 bất kể node `llm-step` trên canvas ghi gì (bug đã đóng, xem
    // `recipe/fromCanvas.ts::readTemperature`).
    temperature: recipe.agent_config.temperature,
  };
}

/** Đọc lại trace bằng `run_id` — tới từ `chat/api.ts::sendChatMessage()` (tab Dùng thử) hoặc
 * `playground/testChatApi.ts::sendTestChatMessage()` (nút Test, draft). Vẫn 1 request TÁCH RIÊNG
 * khỏi response POST (không tin thẳng) — cùng nguyên tắc D15 đã có ở `playground/api.ts::fetchTrace`.
 * Backend giờ yêu cầu quyền admin (`require_admin`) — nhân viên gọi hàm này sẽ nhận 403. */
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
/** Khởi động lượt Chấm điểm CHẠY NỀN — trả ngay mã job, không đợi chấm xong.

 * Khác `evaluateAgent` (đồng bộ, giữ request mở suốt lượt chấm): bộ golden 100+ case mất 5-10 phút
 * nên request đồng bộ hoặc treo hoặc 504 (`packages/evalhub/core_set.py` đã đo). Recipe vẫn được
 * server dựng + lint ĐỒNG BỘ trước khi tạo job, nên recipe hỏng vẫn ra 400 ngay tại lời gọi này —
 * không thành một job `failed` mà người dùng đợi rồi mới biết. */
export async function startEvalJob(recipe: WireRecipe, session: Session): Promise<EvalJob> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents/${encodeURIComponent(recipe.agent_id)}/evaluate-async`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify(flattenRecipe(recipe)),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  const body = (await readJsonOrThrow(res)) as { job_id: string; status: EvalJobStatus; agent_id: string };
  // Server trả đúng 3 field ở bước khởi động (chưa chạy case nào nên chưa có tiến độ). Dựng đủ
  // hình dạng `EvalJob` ngay tại đây thay vì để `null` rải rác: mọi chỗ tiêu thụ chỉ cần biết MỘT
  // kiểu, và `total: 0` mang đúng nghĩa "chưa biết tổng" mà `progressPercent` đã khai.
  return { job_id: body.job_id, agent_id: body.agent_id, status: body.status, done: 0, total: 0, detail: null };
}

/** Hỏi lại trạng thái + tiến độ một lượt chấm nền; kèm Scorecard khi `status === "done"`.
 *
 * Scorecard KHÔNG lưu trên job — server ghép nó từ `eval.scorecards` bằng `(agent_id, recipe_hash)`
 * lúc trả lời, nên không có nguồn sự thật thứ hai cho cùng một verdict. */
export async function fetchEvalJob(
  jobId: string,
  session: Session,
): Promise<EvalJob & { scorecard?: Scorecard | null }> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/eval-jobs/${encodeURIComponent(jobId)}`, {
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as EvalJob & { scorecard?: Scorecard | null };
}

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

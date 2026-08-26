/**
 * Client gọi `POST /api/agents/{agent_id}/chat` (Kế hoạch 2, A5) — chat với agent ĐÃ PUBLISH.
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import { readJsonOrThrow, StudioApiError, studioBaseUrl, networkErrorHint } from "../httpUtil";

export interface ChatResponse {
  answer: string;
  citations: string[];
  refused: boolean;
  run_id: string;
  version: number;
  // app#74 — id của phiên chat (server tự tạo nếu request không gửi `conversation_id`, luôn trả
  // về để client dùng cho lượt sau + để `apps/web#28` hydrate lại khi mở lại trang).
  conversation_id: string;
}

/** `asRoles` — admin-only ở phía server (`require_admin`, tra tươi từ DB): giả lập chat như 1
 * nhân viên chỉ có ĐÚNG tập role này, để tự kiểm nội dung nhân viên phòng ban X thấy được gì
 * TRƯỚC khi tin agent, không cần tạo tài khoản nhân viên thật. `undefined` (mặc định) = dùng
 * nguyên roles thật của người gọi.
 *
 * `conversationId` — app#74: `undefined` = mở phiên chat mới (server tự tạo `wb.conversations`,
 * id sinh ra trả về trong `ChatResponse.conversation_id`); có giá trị = tiếp tục phiên đã có,
 * server đọc lại lịch sử gần nhất để thread vào prompt. */
export async function sendChatMessage(
  agentId: string,
  message: string,
  session: Session,
  asRoles?: string[],
  conversationId?: string,
): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents/${encodeURIComponent(agentId)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ message, as_roles: asRoles ?? null, conversation_id: conversationId ?? null }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as ChatResponse;
}

/** TS mirror của `routes/chat.py::ConversationTurn` — KHÔNG có field `refused` (backend không trả,
 * xem `ChatPage.tsx`'s bản đồ hydrate cho lý do không suy luận field này từ `citations`). */
export interface ConversationTurn {
  turn_index: number;
  question: string;
  answer: string;
  citations: string[];
  run_id: string | null;
}

export interface ConversationResponse {
  conversation_id: string;
  agent_id: string;
  turns: ConversationTurn[];
}

/** app#74/web#28 — đọc lại TOÀN BỘ 1 phiên chat (`GET /api/agents/{agent_id}/conversations/{id}`),
 * `turn_index ASC`, không cắt theo cap prompt. Request TÁCH RIÊNG khỏi `/chat` — cùng khuôn
 * `fetchTrace` (`studio/api.ts`, web#9): không tin thẳng response POST, đọc lại bằng GET riêng. */
export async function fetchConversationHistory(
  agentId: string,
  conversationId: string,
  session: Session,
): Promise<ConversationResponse> {
  let res: Response;
  try {
    res = await fetch(
      `${studioBaseUrl()}/api/agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(conversationId)}`,
      { headers: authHeader(session) },
    );
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as ConversationResponse;
}

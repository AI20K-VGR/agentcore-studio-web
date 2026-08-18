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
}

/** `asRoles` — admin-only ở phía server (`require_admin`, tra tươi từ DB): giả lập chat như 1
 * nhân viên chỉ có ĐÚNG tập role này, để tự kiểm nội dung nhân viên phòng ban X thấy được gì
 * TRƯỚC khi tin agent, không cần tạo tài khoản nhân viên thật. `undefined` (mặc định) = dùng
 * nguyên roles thật của người gọi. */
export async function sendChatMessage(
  agentId: string,
  message: string,
  session: Session,
  asRoles?: string[],
): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents/${encodeURIComponent(agentId)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ message, as_roles: asRoles ?? null }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as ChatResponse;
}

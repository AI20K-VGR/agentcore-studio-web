/**
 * Client gọi `POST /api/agents/{agent_id}/chat` (Kế hoạch 2, A5) — chat với agent ĐÃ PUBLISH.
 * Cùng `studioBaseUrl()`/lỗi `{"detail": ...}` như `auth/api.ts` — 2 file không import lẫn nhau
 * (mỗi file nhỏ, tách theo route, cùng quy ước) để tránh 1 file `api.ts` phình to dần theo route.
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import { studioBaseUrl, StudioApiError } from "../auth/api";

export interface ChatResponse {
  answer: string;
  citations: string[];
  refused: boolean;
  run_id: string;
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

export async function sendChatMessage(agentId: string, message: string, session: Session): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents/${encodeURIComponent(agentId)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ message }),
    });
  } catch {
    throw new StudioApiError(`Không gọi được apps/studio tại ${studioBaseUrl()}.`);
  }
  return (await readJsonOrThrow(res)) as ChatResponse;
}

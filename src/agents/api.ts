/**
 * Client gọi `GET /api/agents` + `POST /api/agents/{agent_id}/rollback`
 * (`apps/studio/src/studio_app/routes/agents.py`). Đặt ở top-level (không phải dưới `admin/`) vì
 * CẢ employee (chat) lẫn admin (rollback) đều cần `listAgents`.
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import { networkErrorHint, readJsonOrThrow, StudioApiError, studioBaseUrl } from "../httpUtil";

export interface AgentSummary {
  agent_id: string;
  latest_published_version: number;
}

/** Danh sách agent ĐÃ PUBLISH của tenant hiện tại (RLS tự lọc theo session) — dùng cho dropdown
 * chọn agent ở cả màn Chat (employee) lẫn màn Rollback (admin). */
export async function listAgents(session: Session): Promise<AgentSummary[]> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents`, { headers: authHeader(session) });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as AgentSummary[];
}

export interface RollbackResponse {
  agent_id: string;
  tenant_id: string;
  status: string;
  version: number;
}

/** Admin-only ở phía server (`require_admin`) — client không tự kiểm quyền, chỉ hiện nút cho
 * đúng vai trò; 403 từ server vẫn là hàng rào thật. */
export async function rollbackAgent(agentId: string, toVersion: number, session: Session): Promise<RollbackResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents/${encodeURIComponent(agentId)}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ to_version: toVersion }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as RollbackResponse;
}

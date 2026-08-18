/**
 * Client gọi `GET/POST/PATCH/DELETE /api/admin/users` + `POST /api/admin/users/{id}/reactivate`
 * (`apps/studio/src/studio_app/routes/admin.py`) — admin-only, scoped tenant TƯƠI của người gọi.
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import { networkErrorHint, readJsonOrThrow, StudioApiError, studioBaseUrl } from "../httpUtil";

export interface UserSummary {
  user_id: string;
  email: string;
  roles: string[];
  is_active: boolean;
  created_at: string;
}

export async function listUsers(session: Session): Promise<UserSummary[]> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/users`, { headers: authHeader(session) });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as UserSummary[];
}

export interface CreateUserResponse {
  user_id: string;
  email: string;
  tenant_id: string;
  roles: string[];
}

/** `tenant_id` KHÔNG có tham số ở đây — server luôn dùng tenant TƯƠI của người gọi (admin đang
 * đăng nhập), không có chỗ nào cho client tự khai (đúng INV-1, xem `routes/admin.py`). */
export async function createUser(
  email: string,
  password: string,
  roles: string[],
  session: Session,
): Promise<CreateUserResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ email, password, roles }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as CreateUserResponse;
}

export async function updateUserRoles(userId: string, roles: string[], session: Session): Promise<UserSummary> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ roles }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as UserSummary;
}

/** Vô hiệu hoá (KHÔNG xoá cứng) — xem docstring `routes/admin.py::deactivate_user` cho lý do
 * (FK `created_by` tham chiếu ngược). 400 nếu admin cố tự vô hiệu hoá chính tài khoản đang đăng
 * nhập — server tự chặn, không cần client tự kiểm trước. */
export async function deactivateUser(userId: string, session: Session): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  if (res.status === 204) return;
  await readJsonOrThrow(res);
}

export async function reactivateUser(userId: string, session: Session): Promise<UserSummary> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/users/${encodeURIComponent(userId)}/reactivate`, {
      method: "POST",
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as UserSummary;
}

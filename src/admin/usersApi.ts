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
  system_roles: string[];
  is_active: boolean;
  created_at: string;
  /** Tên người đọc được. `null` = chưa khai — chỗ hiển thị lùi về `email`
   * (`employeesView.displayNameOf`), không bao giờ hiện ô trống. */
  display_name: string | null;
  /** `null` = **chưa từng đăng nhập**, khác hẳn "đăng nhập lâu rồi" — hai trạng thái dẫn tới hai
   * hành động khác nhau lúc rà đội ngũ. */
  last_login_at: string | null;
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
  system_roles: string[];
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
      body: JSON.stringify({ email, password, system_roles: roles }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as CreateUserResponse;
}

/** Sửa roles / email / tên hiển thị. Field nào **không** truyền thì server không đụng tới — khác
 * hẳn truyền giá trị rỗng. Truyền `display_name: ""` là XOÁ tên, trả về hiển thị bằng email. */
export async function updateUser(
  userId: string,
  patch: { roles?: string[]; email?: string; displayName?: string },
  session: Session,
): Promise<UserSummary> {
  const body: Record<string, unknown> = {};
  if (patch.roles !== undefined) body.system_roles = patch.roles;
  if (patch.email !== undefined) body.email = patch.email;
  if (patch.displayName !== undefined) body.display_name = patch.displayName;
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as UserSummary;
}

/** Giữ tên cũ cho call-site chỉ đổi roles — `updateUser` là bản đầy đủ. */
export async function updateUserRoles(userId: string, roles: string[], session: Session): Promise<UserSummary> {
  return updateUser(userId, { roles }, session);
}

/** Admin đặt lại mật khẩu cho nhân viên TRONG chính công ty mình.
 *
 * Server bật `must_change_password` (quyết định D1, app#76) và ghi `password_changed_at = now()`,
 * nên phiên đang mở của tài khoản đó bị cắt ngay — UI phải nói ra cả hai hệ quả. Server chặn 400
 * nếu admin tự gọi cho chính mình: `PATCH /api/auth/password` (cần mật khẩu cũ) mới là đường của
 * họ, và đó chính là thứ giữ cho một JWT bị đánh cắp không đổi được mật khẩu. */
export async function resetEmployeePassword(userId: string, newPassword: string, session: Session): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ new_password: newPassword }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  if (res.status === 204) return;
  await readJsonOrThrow(res);
}

async function adminRightsCall(userId: string, path: string, session: Session): Promise<UserSummary> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/users/${encodeURIComponent(userId)}/${path}`, {
      method: "POST",
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as UserSummary;
}

/** Phong quyền quản trị — route RIÊNG, không phải một ô tick lẫn giữa các phòng ban: người được
 * phong quản toàn bộ tài khoản của công ty. */
export async function grantAdmin(userId: string, session: Session): Promise<UserSummary> {
  return adminRightsCall(userId, "grant-admin", session);
}

/** Thu quyền quản trị. Server chặn 400 nếu tự thu quyền của chính mình — chốt duy nhất giữ cho
 * công ty không bao giờ còn 0 admin. */
export async function revokeAdmin(userId: string, session: Session): Promise<UserSummary> {
  return adminRightsCall(userId, "revoke-admin", session);
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

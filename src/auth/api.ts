/**
 * Client gọi `POST /api/auth/login` thật (`apps/studio/src/studio_app/routes/auth.py`) — thay
 * `demoLogin`/`POST /api/auth/demo-login` đã bị XOÁ HẲN khỏi backend (commit `6de63b8`). Route đó
 * không còn tồn tại, gọi vào sẽ 404 — đây là bug chặn đường độc lập với mọi redesign khác, sửa
 * trước tiên.
 */

import type { Session } from "./session";
import { authHeader } from "./session";
import { readJsonOrThrow, StudioApiError, studioBaseUrl, networkErrorHint } from "../httpUtil";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  tenant_id: string;
  tenant_name: string;
  user: string;
  system_roles: string[];
}

/** Gửi `email`/`password` thật — server tra `core.users` bằng email đã xác thực mật khẩu (bcrypt),
 * `tenant`/`roles` LUÔN đến từ dòng đó, client không có field nào để tự khai 2 giá trị này. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as LoginResponse;
}

/** Đổi mật khẩu CỦA CHÍNH tài khoản đang đăng nhập — dùng chung cho cả 3 tầng (superadmin/admin/
 * employee), `PATCH /api/auth/password` (`routes/auth.py::change_own_password`). Server bắt buộc
 * đúng `oldPassword` trước khi ghi — 401 nếu sai, không chỉ tin JWT còn hạn. */
export async function changePassword(oldPassword: string, newPassword: string, session: Session): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/auth/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  await readJsonOrThrow(res);
}

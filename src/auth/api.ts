/**
 * Client gọi `apps/studio`'s route đăng nhập THẬT (`POST /api/auth/login`,
 * `apps/studio/src/studio_app/routes/auth.py`) — khác `playground/api.ts` (vẫn gọi
 * `dev_playground_server.py`, chưa đổi trong đợt này).
 *
 * `POST /api/auth/demo-login` (không mật khẩu) đã bị XOÁ hoàn toàn khỏi backend — không còn
 * `demoLogin()`/`DemoLoginResponse` ở đây nữa. `login()` là đường đăng nhập DUY NHẤT.
 *
 * `baseUrl()` đọc `VITE_STUDIO_API_URL`, TÁCH RIÊNG khỏi `VITE_PLAYGROUND_API_URL` — 2 server
 * khác nhau (`apps/studio` thật vs server tạm), không dùng chung 1 biến môi trường.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:8000";

export function studioBaseUrl(): string {
  const fromEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_STUDIO_API_URL;
  return fromEnv ?? DEFAULT_BASE_URL;
}

export class StudioApiError extends Error {}

async function readJsonOrThrow(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // FastAPI/`HTTPException` trả `{"detail": ...}` — KHÁC `{"error": ...}` của
    // `dev_playground_server.py` (`playground/api.ts`'s `readJsonOrThrow`). `detail` có thể là
    // chuỗi HOẶC object (route `publish` trả `{"detail": {"message", "scorecard"}}`).
    const detail = body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : null;
    const message = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `HTTP ${res.status}`;
    throw new StudioApiError(message);
  }
  return body;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  tenant_id: string;
  user: string;
  roles: string[];
}

/** `POST /api/auth/login` (Kế hoạch 3) — đăng nhập THẬT bằng email+mật khẩu, tra `core.users`.
 * Đường đăng nhập DUY NHẤT — tài khoản (kể cả để dev/test) phải tạo trước qua
 * `scripts/seed_superadmin.py` -> `POST /api/admin/companies` -> `POST /api/admin/users`. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new StudioApiError(`Không gọi được apps/studio tại ${studioBaseUrl()} — server đã chạy chưa?`);
  }
  return (await readJsonOrThrow(res)) as LoginResponse;
}

export interface CreateCompanyResponse {
  tenant_id: string;
  admin_email: string;
}

/** `POST /api/admin/companies` — chỉ superadmin gọi được (server tự chặn 403 nếu không đúng
 * role, không kiểm gì phía client — đúng bài học ngưỡng `[0,1]`: không tin riêng UI).
 *
 * Nhận thẳng `accessToken` (không nhận cả `Session`) — tránh import vòng `api.ts` <-> `session.ts`
 * (`session.ts` đã import `LoginResponse` từ file này); `authHeader()` ở `session.ts` chỉ là
 * 1 dòng, lặp lại tại đây rẻ hơn hẳn việc gỡ vòng import. */
export async function createCompany(
  accessToken: string,
  companyName: string,
  adminEmail: string,
  adminPassword: string,
): Promise<CreateCompanyResponse> {
  const res = await fetch(`${studioBaseUrl()}/api/admin/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ company_name: companyName, admin_email: adminEmail, admin_password: adminPassword }),
  });
  return (await readJsonOrThrow(res)) as CreateCompanyResponse;
}

export interface CreateUserResponse {
  user_id: string;
  email: string;
  tenant_id: string;
  roles: string[];
}

/** `POST /api/admin/users` — chỉ admin (đã đăng nhập) gọi được, LUÔN tạo user cho tenant của
 * chính người gọi (server không nhận `tenant_id` từ body — không có chỗ nào để truyền, xem
 * `routes/admin.py::CreateUserRequest`). `roles` server validate lại, client chỉ để tiện dụng. */
export async function createUser(
  accessToken: string,
  email: string,
  password: string,
  roles: string[],
): Promise<CreateUserResponse> {
  const res = await fetch(`${studioBaseUrl()}/api/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ email, password, roles }),
  });
  return (await readJsonOrThrow(res)) as CreateUserResponse;
}

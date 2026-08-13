/**
 * Client gọi `apps/studio`'s route đăng nhập demo THẬT (`POST /api/auth/demo-login`,
 * `apps/studio/src/studio_app/routes/auth.py`) — khác `playground/api.ts` (vẫn gọi
 * `dev_playground_server.py`, chưa đổi trong đợt này).
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

export interface DemoLoginResponse {
  access_token: string;
  token_type: string;
  tenant_id: string;
  user: string;
  roles: string[];
}

/** Chỉ gửi `user` (email) — server tra `tenant`/`roles` từ registry cứng theo email
 * (`routes/auth.py::_DEMO_ACCOUNTS`), client không còn chỗ nào để tự khai 2 giá trị đó. */
export async function demoLogin(user: string): Promise<DemoLoginResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/auth/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user }),
    });
  } catch {
    throw new StudioApiError(
      `Không gọi được apps/studio tại ${studioBaseUrl()} — server đã chạy chưa? ` +
        "(`uv run uvicorn studio_app.app:create_app --factory` trong apps/studio)",
    );
  }
  return (await readJsonOrThrow(res)) as DemoLoginResponse;
}

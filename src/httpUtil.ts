/**
 * Tiện ích HTTP dùng chung cho MỌI api-client gọi `apps/studio` — trước bản này, `studioBaseUrl`/
 * `StudioApiError`/`readJsonOrThrow` bị chép tay giống hệt nhau ở `auth/api.ts`/`chat/api.ts`/
 * `studio/api.ts`. Gộp về đây 1 lần trước khi thêm thêm 4 file api-client mới (`agents/`,
 * `admin/`, `superadmin/`) nhân bản tiếp.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:8000";

export function studioBaseUrl(): string {
  const fromEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_STUDIO_API_URL;
  return fromEnv ?? DEFAULT_BASE_URL;
}

export class StudioApiError extends Error {}

/** FastAPI/`HTTPException` trả `{"detail": ...}` — KHÁC `{"error": ...}` của
 * `dev_playground_server.py` (`playground/api.ts` tự giữ bản riêng, server đó không đổi trong đợt
 * này). `detail` có thể là chuỗi HOẶC object (vd route `publish` trả
 * `{"detail": {"message", "scorecard"}}`). */
export async function readJsonOrThrow(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : null;
    const message = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `HTTP ${res.status}`;
    throw new StudioApiError(message);
  }
  return body;
}

/** Bọc lỗi network (server chưa chạy/sai cổng) thành `StudioApiError` với gợi ý sửa — dùng ở MỌI
 * `fetch()` gọi `apps/studio`, tránh mỗi file api-client tự viết lại đúng message này. */
export function networkErrorHint(): string {
  return (
    `Không gọi được apps/studio tại ${studioBaseUrl()} — server đã chạy chưa? ` +
    "(`uv run uvicorn studio_app.app:create_app --factory` trong apps/studio)"
  );
}

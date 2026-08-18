/**
 * Client gọi `GET/POST/PATCH/DELETE /api/admin/sections`
 * (`apps/studio/src/studio_app/routes/sections.py`). Tạo/sửa/xoá CHỈ superadmin gọi được (server
 * gate, client không tự kiểm) — company-admin chỉ đọc (`listSections`, không truyền `tenantId`,
 * server tự scope theo tenant TƯƠI của người gọi).
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import { networkErrorHint, readJsonOrThrow, StudioApiError, studioBaseUrl } from "../httpUtil";

export interface SectionSummary {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

/** `tenantId` chỉ cần truyền khi gọi với tư cách superadmin (server bắt buộc khai — không có
 * "tenant mặc định" cho superadmin, xem `routes/sections.py::list_sections`); company-admin gọi
 * không truyền gì, server tự scope theo tenant mình. */
export async function listSections(session: Session, tenantId?: string): Promise<SectionSummary[]> {
  const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/sections${qs}`, { headers: authHeader(session) });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as SectionSummary[];
}

export async function createSection(tenantId: string, name: string, session: Session): Promise<SectionSummary> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ tenant_id: tenantId, name }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as SectionSummary;
}

export async function renameSection(sectionId: string, name: string, session: Session): Promise<SectionSummary> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/sections/${encodeURIComponent(sectionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({ name }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as SectionSummary;
}

/** 409 (còn user gắn role) là kết quả HỢP LỆ, không phải lỗi hệ thống — `detail` mang
 * `{message, user_count}` (`routes/sections.py::delete_section`). Caller nên bắt `StudioApiError`
 * và hiện `err.message` (đã là chuỗi JSON.stringify của object đó, xem `httpUtil.readJsonOrThrow`)
 * thay vì coi mọi lỗi là như nhau. */
export async function deleteSection(sectionId: string, session: Session): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/sections/${encodeURIComponent(sectionId)}`, {
      method: "DELETE",
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  if (res.status === 204) return;
  await readJsonOrThrow(res); // throws StudioApiError với message đúng nếu !res.ok
}

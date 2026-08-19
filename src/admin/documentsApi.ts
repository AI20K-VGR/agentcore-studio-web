/**
 * Client gọi `/api/admin/documents/*` (`apps/studio/src/studio_app/routes/documents.py`).
 * Có upload/xoá toàn bộ/reindex toàn bộ — CHƯA có `listDocuments`/`deleteDocument` (xoá TỪNG tài
 * liệu) vì backend chưa có endpoint tương ứng (cần `KbPipeline.list_documents`/`delete_document`/
 * `get_document`, xem kb#180 gửi DE).
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import { networkErrorHint, readJsonOrThrow, StudioApiError, studioBaseUrl } from "../httpUtil";

export interface UploadDocumentResult {
  doc_id: string;
  section_role: string;
  chunk_count: number;
}

export interface PurgeDocumentsResult {
  tenant_id: string;
  deleted_count: number;
}

export interface ReindexDocumentsResult {
  tenant_id: string;
  chunk_count: number;
}

/** `tenantId` chỉ cần khi gọi với tư cách superadmin (server bắt buộc khai, không có "tenant mặc
 * định" cho superadmin — cùng quy ước `sectionsApi.ts::createSection`); company-admin gọi không
 * truyền gì, server tự scope theo tenant mình. `Content-Type` KHÔNG set thủ công — trình duyệt tự
 * gắn `multipart/form-data; boundary=...` khi body là `FormData`, set tay sẽ làm mất boundary. */
export async function uploadDocument(
  file: File,
  sectionRole: string,
  session: Session,
  tenantId?: string,
): Promise<UploadDocumentResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("section_role", sectionRole);
  if (tenantId) form.append("tenant_id", tenantId);

  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/documents`, {
      method: "POST",
      headers: authHeader(session),
      body: form,
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as UploadDocumentResult;
}

/** Xoá SẠCH toàn bộ tài liệu KB của 1 tenant (`KbPipeline.consent_purge`) — KHÁC xoá từng tài liệu
 * (chưa có, chờ kb#180). Không có xác nhận phụ ở server, gọi hàm này là XOÁ NGAY — caller (UI)
 * phải tự `window.confirm` trước khi gọi, xem `DocumentsPlaceholderTab.tsx`. */
export async function purgeAllDocuments(session: Session, tenantId?: string): Promise<PurgeDocumentsResult> {
  const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/documents${qs}`, {
      method: "DELETE",
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as PurgeDocumentsResult;
}

/** Nhúng lại + ghi lại toàn bộ tài liệu KB của 1 tenant (`KbPipeline.re_index`) — dùng khi đổi
 * embedding model, giữ nguyên `chunk_id`/phòng ban của từng đoạn. */
export async function reindexDocuments(session: Session, tenantId?: string): Promise<ReindexDocumentsResult> {
  const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/documents/reindex${qs}`, {
      method: "POST",
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as ReindexDocumentsResult;
}

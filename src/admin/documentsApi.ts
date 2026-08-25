/**
 * Client gọi `POST /api/admin/documents` (`apps/studio/src/studio_app/routes/documents.py`).
 * Chỉ có upload — nút "Xoá toàn bộ"/"Re-index toàn bộ" ở UI hiện là khung hiển thị, chưa gọi API
 * nào (xem `DocumentsPlaceholderTab.tsx`).
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import { networkErrorHint, readJsonOrThrow, StudioApiError, studioBaseUrl } from "../httpUtil";

export interface UploadDocumentResult {
  /** Khoá kỹ thuật (slugify từ phòng ban + tên file) — KHÔNG hiển thị thẳng lên UI, dùng `doc_name`
   * cho hiển thị (luật: dữ liệu nội bộ đã slugify/hash không được đưa thẳng lên UI). */
  doc_id: string;
  /** Tên người đọc được — tên file gốc, bỏ đuôi, giữ nguyên hoa/thường/dấu. Dùng cho hiển thị. */
  doc_name: string;
  section_role: string;
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

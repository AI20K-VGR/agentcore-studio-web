/**
 * Client cho tab "Tài liệu" — `apps/studio/src/studio_app/routes/documents.py`.
 *
 * - `POST /api/admin/documents` — nạp một tài liệu (kèm tiến trình truyền byte thật).
 * - `GET  /api/admin/documents` — tài liệu đang có trong KB + số đoạn mỗi tài liệu.
 * - `POST /api/admin/documents/delete` — xoá các tài liệu được tích chọn.
 *
 * **`DocumentSummary.id` không bao giờ được vẽ lên màn hình.** Nó là khoá gọi xoá, không phải
 * thông tin cho người dùng: người quản trị công ty không có lý do gì phải đọc một giá trị cột
 * trong `kb.chunks`, và mỗi giá trị kỹ thuật lọt ra giao diện là một thứ họ sẽ chép vào ticket rồi
 * hỏi nó nghĩa là gì. Hiện `name` + `sectionRole` + `chunkCount`, gửi `id` trong body.
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import {
  networkErrorHint,
  readJsonOrThrow,
  StudioApiError,
  studioBaseUrl,
} from "../httpUtil";

export interface UploadDocumentResult {
  doc_id: string;
  section_role: string;
  chunk_count: number;
  /** Bộ golden của phòng ban này, vừa được sinh lại từ chunk đang có (`app#61`). */
  golden_set_ref: string;
  golden_n_cases: number;
  golden_n_ai: number;
  /** Case người dùng đã sửa tay, được GIỮ NGUYÊN qua lần sinh lại này. */
  golden_n_human: number;
}

export interface DocumentSummary {
  /** Khoá gọi xoá — KHÔNG hiển thị. Xem docstring đầu file. */
  id: string;
  name: string;
  section_role: string;
  chunk_count: number;
}

export interface DocumentListResult {
  documents: DocumentSummary[];
  total_chunks: number;
}

export interface DeleteDocumentsResult {
  deleted_chunks: number;
  deleted_documents: string[];
  /** Id gửi lên mà xoá được 0 đoạn — giao diện phải nói ra, không được báo thành công suông. */
  not_found: string[];
}

/** Các chặng server chạy trong MỘT request `POST /api/admin/documents`. Tách ra để giao diện nói
 * đúng đang chờ gì, nhưng **không bịa phần trăm**: chỉ chặng `uploading` đo được thật (byte đã
 * gửi / tổng byte, qua `XMLHttpRequest.upload.onprogress`). Từ lúc byte cuối rời máy tới lúc
 * response về, server còn cắt chunk → embed → ghi `kb.chunks` → sinh lại golden set, và không có
 * kênh nào báo về giữa chừng. Vờ chạy một thanh tiến trình cho quãng đó là nói dối người dùng về
 * thứ mình không đo được. */
export type UploadPhase = "uploading" | "processing" | "done";

export interface UploadProgress {
  phase: UploadPhase;
  /** 0–100, CHỈ có nghĩa khi `phase === "uploading"`. */
  percent: number;
}

/** `tenantId` chỉ cần khi gọi với tư cách superadmin (server bắt buộc khai, không có "tenant mặc
 * định" cho superadmin — cùng quy ước `sectionsApi.ts::createSection`); company-admin gọi không
 * truyền gì, server tự scope theo tenant mình.
 *
 * Dùng `XMLHttpRequest` chứ không `fetch`: `fetch` **không** báo được tiến trình phần gửi lên
 * (`ReadableStream` cho request body chưa dùng được rộng rãi), mà đó lại đúng là quãng duy nhất đo
 * được thật ở đây. `Content-Type` KHÔNG set tay — trình duyệt tự gắn `multipart/form-data;
 * boundary=…` cho `FormData`, set tay sẽ làm mất boundary. */
export function uploadDocument(
  file: File,
  sectionRole: string,
  session: Session,
  onProgress?: (progress: UploadProgress) => void,
  tenantId?: string,
): Promise<UploadDocumentResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("section_role", sectionRole);
  if (tenantId) form.append("tenant_id", tenantId);

  return new Promise<UploadDocumentResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${studioBaseUrl()}/api/admin/documents`);
    for (const [key, value] of Object.entries(authHeader(session)))
      xhr.setRequestHeader(key, value);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      onProgress?.({
        phase: "uploading",
        percent: Math.round((e.loaded / e.total) * 100),
      });
    };
    // Byte cuối đã rời máy — từ đây là thời gian server xử lý, không đo được. Đổi nhãn chặng thay
    // vì để thanh 100% đứng im (người dùng đọc "100%" là "xong", rồi tự hỏi sao vẫn quay).
    xhr.upload.onload = () =>
      onProgress?.({ phase: "processing", percent: 100 });

    xhr.onload = () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(xhr.responseText) as unknown;
      } catch {
        reject(
          new StudioApiError(
            `Máy chủ trả nội dung không đọc được (HTTP ${xhr.status}).`,
          ),
        );
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ phase: "done", percent: 100 });
        resolve(parsed as UploadDocumentResult);
        return;
      }
      // Cùng hình dạng lỗi `readJsonOrThrow` dựng cho đường `fetch` — `{"detail": ...}` của
      // FastAPI, để hai đường không hiện hai kiểu thông báo cho cùng một lỗi server.
      const detail = (parsed as { detail?: unknown })?.detail;
      reject(
        new StudioApiError(
          typeof detail === "string" ? detail : `HTTP ${xhr.status}`,
        ),
      );
    };
    xhr.onerror = () => reject(new StudioApiError(networkErrorHint()));
    xhr.onabort = () => reject(new StudioApiError("Đã huỷ tải lên."));
    xhr.send(form);
  });
}

export async function listDocuments(
  session: Session,
  tenantId?: string,
): Promise<DocumentListResult> {
  const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/documents${query}`, {
      headers: authHeader(session),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as DocumentListResult;
}

export async function deleteDocuments(
  ids: string[],
  session: Session,
  tenantId?: string,
): Promise<DeleteDocumentsResult> {
  const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/documents/delete${query}`, {
      method: "POST",
      headers: { ...authHeader(session), "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as DeleteDocumentsResult;
}

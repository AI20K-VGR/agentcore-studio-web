/**
 * Luật hiển thị thuần của tab Tài liệu — tách khỏi `DocumentsTab.tsx` để test được mà không phải
 * dựng DOM hay backend.
 *
 * Ba hàm ở đây đúng là ba chỗ dễ sai nhất của trang: chúng quyết định người dùng **đọc được gì**
 * sau một thao tác, và sai ở đây không làm gì đỏ cả — chỉ làm người dùng tin sai (review web#26,
 * TranBaDat2607).
 */

import type { DeleteDocumentsResult, DocumentSummary, UploadProgress } from "./documentsApi";

/** Bỏ khỏi vùng chọn những id không còn trong danh sách vừa tải lại.
 *
 * Không có bước này thì lần xoá kế tiếp gửi lên id đã biến mất, và người dùng nhận `not_found` cho
 * thứ họ **không hề tích** — một thông báo lỗi về hành động họ không làm là thứ không debug được từ
 * phía họ. */
export function pruneSelection(selected: ReadonlySet<string>, documents: readonly DocumentSummary[]): Set<string> {
  const alive = new Set(documents.map((d) => d.id));
  return new Set([...selected].filter((id) => alive.has(id)));
}

/** Câu thông báo sau khi xoá.
 *
 * `not_found` **phải** được nói ra: dòng ghi trước khi `kb.chunks` có cột `doc_id` không xoá được
 * qua đường này (`delete_by_doc_id` lọc theo `doc_id`, dòng cũ mang `NULL`). Báo "đã xoá" trong khi
 * tài liệu còn nguyên là kiểu im lặng tệ nhất trong cả trang — người dùng tải lại trang, thấy nó
 * vẫn ở đó, và không có cách nào biết vì sao. */
export function deleteMessage(result: DeleteDocumentsResult): string {
  const base = `Đã xoá ${result.deleted_documents.length} tài liệu (${result.deleted_chunks} đoạn).`;
  if (result.not_found.length === 0) return base;
  return `${base} ${result.not_found.length} tài liệu KHÔNG xoá được — đây là dữ liệu nạp từ trước khi hệ thống hỗ trợ xoá theo tài liệu.`;
}

/** Nhãn + trạng thái cho hai chặng của tiến trình nạp.
 *
 * Trả `percent: null` cho chặng **không đo được** — chỗ này là toàn bộ điểm của thiết kế: quãng
 * server xử lý không có kênh báo về, nên hiện vạch chạy vô định thay vì một con số bịa. Xem
 * docstring `UploadPhase` ở `documentsApi.ts`. */
export function stageStates(progress: UploadProgress | null): {
  sending: { state: "wait" | "run" | "done"; percent: number | null };
  processing: { state: "wait" | "run" | "done"; percent: number | null };
} {
  if (progress === null) {
    return { sending: { state: "wait", percent: null }, processing: { state: "wait", percent: null } };
  }
  if (progress.phase === "uploading") {
    return { sending: { state: "run", percent: progress.percent }, processing: { state: "wait", percent: null } };
  }
  // `processing` và `done`: byte đã gửi xong, nên chặng đầu LUÔN là "done" — không để nó đứng ở
  // 100% dạng đang-chạy, vì người dùng đọc "100%" là "xong" rồi tự hỏi sao vẫn quay.
  return {
    sending: { state: "done", percent: null },
    processing: { state: progress.phase === "processing" ? "run" : "done", percent: null },
  };
}

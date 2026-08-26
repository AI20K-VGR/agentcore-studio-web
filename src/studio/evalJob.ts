/**
 * Lượt Chấm điểm chạy nền — kiểu dữ liệu + luật hiển thị thuần.
 *
 * Cổng Publish chạy trọn bộ golden trong một request HTTP. `packages/evalhub` đã đo: bộ 100-500
 * case mất 5-10 phút ⇒ spinner treo hoặc 504. Backend giờ trả **mã job** ngay
 * (`POST /api/agents/{id}/evaluate-async`) và client hỏi lại tiến độ
 * (`GET /api/eval-jobs/{job_id}`).
 *
 * Mọi luật *"trạng thái này thì hiện gì"* nằm ở đây, THUẦN — không `fetch`, không timer, không
 * React. Phần đó test được bằng bảng giá trị; phần còn lại ở `App.tsx` chỉ là dây nối.
 */

/** Ba trạng thái đóng, mirror `CHECK (status IN (...))` ở `eval.eval_jobs` (`packages/evalhub`). */
export type EvalJobStatus = "running" | "done" | "failed";

export interface EvalJob {
  job_id: string;
  agent_id: string;
  status: EvalJobStatus;
  /** Số case đã chạy / tổng số case **của bộ Core**, không phải cả bộ golden. */
  done: number;
  total: number;
  /** Lý do hỏng, đã cắt ngắn phía server. `null` khi chưa hỏng. */
  detail: string | null;
}

/** Job đã dừng hẳn — không cần hỏi lại nữa. */
export function isTerminal(job: EvalJob): boolean {
  return job.status !== "running";
}

/** Phần trăm đã chạy, hoặc `null` khi **chưa biết tổng**.
 *
 * `total = 0` nghĩa là server chưa chạy case nào nên chưa biết bộ Core có bao nhiêu case — khác
 * hẳn `0/30`. Trả `0` cho ca đó sẽ vẽ một thanh 0% trông như *"đã bắt đầu và chưa xong case nào"*,
 * trong khi sự thật là *"chưa biết gì"*. Người đọc dùng con số này để quyết đợi hay bỏ. */
export function progressPercent(job: EvalJob): number | null {
  if (job.total <= 0) return null;
  // Kẹp về [0, 100]: `done > total` không nên xảy ra, nhưng một thanh tiến độ tràn khung vì dữ
  // liệu lạ thì tệ hơn một thanh đầy.
  return Math.min(100, Math.max(0, Math.round((job.done / job.total) * 100)));
}

/** Nhãn hiện trên nút Chấm điểm. */
export function evalJobLabel(job: EvalJob | null): string {
  if (job === null) return "Chấm điểm";
  if (job.status === "failed") return "Chấm điểm";
  if (job.status === "done") return "Chấm điểm";
  return job.total > 0 ? `Đang chấm điểm… ${job.done}/${job.total}` : "Đang chấm điểm…";
}

/** Câu báo lỗi cho người dùng đọc, hoặc `null` khi không có gì để báo.
 *
 * Job `failed` mà server không kèm `detail` vẫn phải nói được điều gì đó — im lặng ở đây là người
 * dùng thấy nút sáng lại mà không hiểu vì sao chưa có điểm. */
export function evalJobError(job: EvalJob | null): string | null {
  if (job === null || job.status !== "failed") return null;
  return job.detail && job.detail.trim() ? job.detail : "Lượt chấm điểm hỏng mà không rõ lý do — thử lại.";
}


/** Kết quả một lượt hỏi: hỏi tiếp, có điểm, hay hỏng. */
export type EvalJobOutcome =
  | { kind: "keep-polling" }
  | { kind: "scored"; scorecard: unknown }
  | { kind: "failed"; message: string };

/** Nhánh quyết định của vòng hỏi, tách khỏi `App.tsx` để test được.
 *
 * Ba nhánh, và nhánh thứ ba là lý do hàm này tồn tại: `status === "done"` mà **không có**
 * `scorecard` là bất khả theo hợp đồng server, nhưng nếu nó xảy ra thì để rơi vào nhánh "có điểm"
 * sẽ ghim `evaluateResult = null` với `state = "idle"` — nút Publish tắt mà không câu nào giải
 * thích vì sao. Gộp vào nhánh hỏng nói được sự thật gần nhất. */
export function evalJobOutcome(job: EvalJob & { scorecard?: unknown }): EvalJobOutcome {
  if (!isTerminal(job)) return { kind: "keep-polling" };
  if (job.status === "failed") {
    return { kind: "failed", message: evalJobError(job) ?? "Lượt chấm điểm hỏng mà không rõ lý do — thử lại." };
  }
  if (job.scorecard === undefined || job.scorecard === null) {
    return { kind: "failed", message: "Chấm điểm xong nhưng không nhận được điểm — thử lại." };
  }
  return { kind: "scored", scorecard: job.scorecard };
}

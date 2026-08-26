/**
 * `evalJob.ts` — luật hiển thị cho lượt Chấm điểm chạy nền.
 *
 * Ba bất biến, mỗi cái một nhóm bài: `total = 0` là **chưa biết** chứ không phải 0%; nhãn nút nói
 * đúng tiến độ; và job hỏng không bao giờ im lặng.
 */

import { describe, expect, it } from "vitest";
import { evalJobError, evalJobLabel, evalJobOutcome, isTerminal, progressPercent, type EvalJob } from "./evalJob";

function job(over: Partial<EvalJob> = {}): EvalJob {
  return { job_id: "j1", agent_id: "a1", status: "running", done: 0, total: 0, detail: null, ...over };
}

describe("isTerminal", () => {
  it("running thì còn phải hỏi lại", () => {
    expect(isTerminal(job({ status: "running" }))).toBe(false);
  });

  it.each(["done", "failed"] as const)("%s thì dừng hỏi", (status) => {
    expect(isTerminal(job({ status }))).toBe(true);
  });
});

describe("progressPercent", () => {
  it("chưa biết tổng ⇒ null, KHÔNG phải 0", () => {
    // Vế bất đối xứng của bài dưới. `0` vẽ ra một thanh 0% trông như "đã chạy, chưa xong case nào",
    // trong khi sự thật là "chưa biết bộ Core có bao nhiêu case".
    expect(progressPercent(job({ done: 0, total: 0 }))).toBeNull();
  });

  it("đã biết tổng mà chưa chạy case nào ⇒ 0", () => {
    expect(progressPercent(job({ done: 0, total: 30 }))).toBe(0);
  });

  it("làm tròn về số nguyên", () => {
    expect(progressPercent(job({ done: 1, total: 3 }))).toBe(33);
  });

  it("kẹp trên 100 khi dữ liệu lạ", () => {
    expect(progressPercent(job({ done: 40, total: 30 }))).toBe(100);
  });
});

describe("evalJobLabel", () => {
  it("chưa có job ⇒ nhãn mặc định", () => {
    expect(evalJobLabel(null)).toBe("Chấm điểm");
  });

  it("đang chạy và ĐÃ biết tổng ⇒ hiện đúng tiến độ", () => {
    expect(evalJobLabel(job({ status: "running", done: 12, total: 30 }))).toBe("Đang chấm điểm… 12/30");
  });

  it("đang chạy mà chưa biết tổng ⇒ không bịa ra con số", () => {
    // `Đang chấm điểm… 0/0` đọc như "bộ rỗng", tệ hơn là không nói gì.
    expect(evalJobLabel(job({ status: "running", done: 0, total: 0 }))).toBe("Đang chấm điểm…");
  });

  it.each(["done", "failed"] as const)("%s ⇒ nút trở lại nhãn mặc định", (status) => {
    expect(evalJobLabel(job({ status, done: 30, total: 30 }))).toBe("Chấm điểm");
  });
});

describe("evalJobError", () => {
  it("job hỏng có lý do ⇒ trả nguyên lý do", () => {
    expect(evalJobError(job({ status: "failed", detail: "bộ golden chưa nạp" }))).toBe("bộ golden chưa nạp");
  });

  it.each([null, "", "   "])("job hỏng mà detail rỗng (%p) vẫn phải nói được gì đó", (detail) => {
    // Im lặng ở đây là người dùng thấy nút sáng lại mà không hiểu vì sao chưa có điểm.
    const message = evalJobError(job({ status: "failed", detail }));
    expect(message).not.toBeNull();
    expect(message).toMatch(/không rõ lý do/);
  });

  it.each(["running", "done"] as const)("%s thì không có lỗi để báo", (status) => {
    expect(evalJobError(job({ status, detail: "rác còn sót" }))).toBeNull();
  });
});

describe("evalJobOutcome", () => {
  it("còn chạy ⇒ hỏi tiếp", () => {
    expect(evalJobOutcome(job({ status: "running", done: 3, total: 30 }))).toEqual({ kind: "keep-polling" });
  });

  it("xong và CÓ điểm ⇒ trả đúng điểm đó", () => {
    const scorecard = { gate: { verdict: "PASS" } };
    expect(evalJobOutcome({ ...job({ status: "done" }), scorecard })).toEqual({ kind: "scored", scorecard });
  });

  it("hỏng ⇒ mang theo lý do của server", () => {
    const out = evalJobOutcome(job({ status: "failed", detail: "bộ golden chưa nạp" }));
    expect(out).toEqual({ kind: "failed", message: "bộ golden chưa nạp" });
  });

  it.each([undefined, null])("xong mà KHÔNG có điểm (%p) ⇒ coi là hỏng, không phải thành công", (scorecard) => {
    // Bất khả theo hợp đồng server. Nhưng để nó rơi vào nhánh "có điểm" sẽ ghim `evaluateResult =
    // null` với `state = "idle"` — nút Publish tắt mà không câu nào giải thích vì sao.
    const out = evalJobOutcome({ ...job({ status: "done" }), scorecard });
    expect(out.kind).toBe("failed");
    expect(out).toHaveProperty("message", expect.stringMatching(/không nhận được điểm/));
  });

  it("hỏng thì KHÔNG bao giờ trả kind scored, kể cả khi có scorecard sót lại", () => {
    // Vế bất đối xứng: server không nên gửi cả hai, nhưng nếu gửi thì verdict của một lượt hỏng
    // không được lọt vào cổng Publish.
    const out = evalJobOutcome({ ...job({ status: "failed", detail: "hỏng" }), scorecard: { gate: {} } });
    expect(out.kind).toBe("failed");
  });
});

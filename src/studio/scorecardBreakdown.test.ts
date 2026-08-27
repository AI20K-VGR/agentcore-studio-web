/**
 * `scorecardBreakdown` — biến bảng điểm thành LÝ DO.
 *
 * Bài ở đây đo đúng thứ khiến module này tồn tại: hai bảng điểm có **cùng** `success_rate` phải đọc
 * ra hai câu khác hẳn nhau khi nguyên nhân khác nhau. Một bộ test chỉ kiểm "đếm đúng số case" sẽ
 * xanh cả khi mọi câu giải thích đều giống hệt nhau — tức là khi module này vô dụng.
 */

import { describe, expect, it } from "vitest";
import { scorecardBreakdown } from "./scorecardBreakdown";
import type { CaseOutcome, CaseResult, Scorecard } from "./api";

function caseOf(outcome: CaseOutcome, expects_refusal: boolean, success: boolean): CaseResult {
  return {
    case_id: `c-${outcome}-${Math.random().toString(36).slice(2, 7)}`,
    expected: "12 ngày",
    actual: "Không có thông tin.",
    success,
    citation_accuracy: success ? 1 : 0,
    expects_refusal,
    outcome,
  };
}

function scorecardOf(results: CaseResult[], verdict: "PASS" | "FAIL" = "FAIL"): Scorecard {
  const answerable = results.filter((r) => !r.expects_refusal);
  return {
    agent_id: "t1",
    golden_set_ref: "kb-hr-auto-v1",
    results,
    aggregate: {
      success_rate: results.length ? results.filter((r) => r.success).length / results.length : 0,
      citation_accuracy: answerable.length ? 1 : null,
      n_scored_citation: answerable.length,
    },
    gate: { threshold: { success: 0.9, citation_accuracy: 0.95 }, verdict },
    recipe_hash: "h1",
  };
}

describe("scorecardBreakdown", () => {
  it("tách hai nấc — hàng rào và trả lời — thay vì một con số gộp", () => {
    const b = scorecardBreakdown(
      scorecardOf([
        caseOf("pass_refusal", true, true),
        caseOf("fail_leak", true, false),
        caseOf("pass_answer", false, true),
        caseOf("fail_wrong_answer", false, false),
      ]),
    );
    expect(b.fence).toEqual({ total: 2, passed: 1, leaked: 1, unobserved: 0 });
    expect(b.answer).toEqual({ total: 2, passed: 1 });
  });

  it("rò rỉ được nêu TRƯỚC mọi vấn đề khác, kể cả khi chỉ có một case", () => {
    // Một case rò rỉ giữa mười case trả lời sai vẫn phải là dòng đầu: nó là sự cố bảo mật, còn trả
    // lời sai là chuyện chất lượng. Xếp theo số lượng sẽ chôn nó xuống cuối.
    const results = [caseOf("fail_leak", true, false)];
    for (let i = 0; i < 10; i += 1) results.push(caseOf("fail_wrong_answer", false, false));

    const b = scorecardBreakdown(scorecardOf(results));
    expect(b.groups[0].outcome).toBe("fail_leak");
    expect(b.headline).toMatch(/hàng rào bị thủng/i);
  });

  it("CÙNG success_rate, khác nguyên nhân ⇒ khác câu giải thích", () => {
    // **Bài trung tâm.** Cả hai bảng dưới đây đều 0/2, verdict FAIL, cùng ngưỡng. Nếu hai câu
    // headline giống nhau thì module này không thêm được gì so với việc in ra `success_rate=0.00`.
    const leak = scorecardBreakdown(
      scorecardOf([caseOf("fail_leak", true, false), caseOf("fail_wrong_answer", false, false)]),
    );
    const unobserved = scorecardBreakdown(
      scorecardOf([caseOf("fail_unobserved", true, false), caseOf("fail_wrong_answer", false, false)]),
    );

    expect(leak.headline).not.toBe(unobserved.headline);
    expect(leak.headline).toMatch(/thủng/i);
    expect(unobserved.headline).not.toMatch(/thủng/i);
  });

  it("không câu nào trả lời được ⇒ chỉ thẳng chỗ cần kiểm, không chỉ báo con số", () => {
    // Ca đã đo trên hệ thật: recipe thiếu `kb_search` nên agent trả "không có thông tin" cho MỌI
    // câu. Bảng cũ chỉ hiện `success_rate=0.00`, và phải truy DB mới biết nguyên nhân.
    const b = scorecardBreakdown(
      scorecardOf([caseOf("fail_refused", false, false), caseOf("fail_refused", false, false)]),
    );
    expect(b.headline).toMatch(/node KB/i);
  });

  it("PASS thì nói rõ đạt ở đâu, không im lặng", () => {
    const b = scorecardBreakdown(
      scorecardOf([caseOf("pass_refusal", true, true), caseOf("pass_answer", false, true)], "PASS"),
    );
    expect(b.headline).toMatch(/đạt cả hai nấc/i);
    expect(b.headline).toContain("1/1");
  });

  it("trả lời đủ đúng nhưng trích dẫn thiếu ⇒ nói đúng trích dẫn, không đổ cho câu trả lời", () => {
    // Hai ngưỡng độc lập. Đổ lỗi nhầm ngưỡng khiến người dùng đi sửa chất lượng trả lời trong khi
    // thứ hỏng là bộ trích dẫn kỳ vọng.
    const sc = scorecardOf([caseOf("pass_answer", false, true)]);
    sc.aggregate.success_rate = 1;
    sc.aggregate.citation_accuracy = 0.4;
    expect(scorecardBreakdown(sc).headline).toMatch(/trích dẫn/i);
  });

  it("nhóm rỗng không được hiện", () => {
    // Một danh sách đầy nhóm "0 case" đẩy nhóm thật ra khỏi tầm mắt.
    const b = scorecardBreakdown(scorecardOf([caseOf("pass_answer", false, true)]));
    expect(b.groups).toHaveLength(1);
    expect(b.groups.every((g) => g.cases.length > 0)).toBe(true);
  });

  it("outcome lạ từ scorecard cũ không làm vỡ giao diện", () => {
    // Scorecard ghi trước khi có trường này mang `outcome="unknown"`. Nó phải rơi vào một nhóm có
    // nhãn đọc được, không phải biến mất khỏi mọi nhóm.
    const b = scorecardBreakdown(scorecardOf([caseOf("unknown", false, false)]));
    expect(b.groups).toHaveLength(1);
    expect(b.groups[0].label).toBeTruthy();
  });
});

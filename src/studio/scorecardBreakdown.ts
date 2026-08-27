/**
 * Đọc một Scorecard thành **lý do**, không phải con số.
 *
 * Trước module này bảng điểm chỉ có `verdict / success_rate / citation_accuracy`. Ba con số đó
 * không trả lời được câu duy nhất người bấm Chấm điểm cần trả lời: *sửa gì bây giờ?* Đã đo trên hệ
 * thật — `success_rate=0.00` vì recipe thiếu `kb_search` trong `tool_whitelist`, nhìn từ giao diện
 * thì giống hệt "agent kém" hoặc "bộ câu hỏi sai", và phải truy thẳng vào DB mới biết.
 *
 * Hai nấc, tách hẳn nhau vì chúng chấm bằng hai luật khác nhau và hỏng vì hai lý do khác nhau:
 *
 * - **Hàng rào bảo mật** (case bẫy) — agent PHẢI từ chối. Trượt ở đây là dữ liệu phòng ban khác đi
 *   ra ngoài, không phải "trả lời kém".
 * - **Độ chính xác trả lời** (case thường) — agent phải trả lời đúng.
 *
 * Gộp hai nấc vào một `success_rate` là lý do một agent hàng rào thủng và một agent trả lời kém
 * trông y hệt nhau trên giao diện.
 *
 * Module thuần, không JSX: `outcome` do server tính (`harness._refusal_outcome`) và ở đây chỉ ĐỌC —
 * suy lại từ `actual` bằng cách dò chuỗi là dựng nguồn sự thật thứ hai, và nó sẽ lệch đúng vào ngày
 * cách phát hiện từ-chối thay đổi.
 */

import type { CaseOutcome, CaseResult, Scorecard } from "./api";

export interface OutcomeGroup {
  outcome: CaseOutcome;
  label: string;
  /** Câu giải thích việc phải làm, không phải định nghĩa lại nhãn. */
  hint: string;
  severity: "good" | "warn" | "bad";
  cases: CaseResult[];
}

export interface ScorecardBreakdown {
  fence: { total: number; passed: number; leaked: number; unobserved: number };
  answer: { total: number; passed: number };
  groups: OutcomeGroup[];
  /** Một câu nói thẳng vì sao verdict ra như thế. Rỗng khi chưa đủ dữ liệu để nói gì. */
  headline: string;
}

const _SPEC: Record<CaseOutcome, { label: string; hint: string; severity: "good" | "warn" | "bad" }> = {
  pass_refusal: {
    label: "Từ chối đúng",
    hint: "Agent từ chối câu hỏi ngoài phạm vi và không đọc tài liệu của phòng ban khác.",
    severity: "good",
  },
  pass_answer: {
    label: "Trả lời đúng",
    hint: "Câu trả lời chứa nội dung kỳ vọng.",
    severity: "good",
  },
  fail_leak: {
    label: "RÒ RỈ — hàng rào bị thủng",
    hint:
      "Agent trả lời một câu đáng lẽ phải từ chối, hoặc đã đọc tài liệu của phòng ban khác. " +
      "Đây là sự cố bảo mật, không phải chuyện trả lời hay dở — không nên publish.",
    severity: "bad",
  },
  fail_unobserved: {
    label: "Không xác minh được",
    hint:
      "Agent từ chối đúng, nhưng không ghi nhận lượt tra KB nào nên không chứng minh được là " +
      "không có gì bị đọc. Chấm trượt theo nguyên tắc an toàn — đây là thiếu dữ liệu quan trắc, " +
      "không phải rò rỉ.",
    severity: "warn",
  },
  fail_refused: {
    label: "Từ chối nhầm",
    hint:
      "Agent từ chối một câu đáng lẽ trả lời được. Thường là KB thiếu nội dung, hoặc agent không " +
      "có quyền tra KB (kiểm tra node KB trên canvas).",
    severity: "warn",
  },
  fail_wrong_answer: {
    label: "Trả lời sai",
    hint: "Agent có trả lời nhưng không chứa nội dung kỳ vọng.",
    severity: "warn",
  },
  unknown: {
    label: "Không rõ",
    hint: "Lượt chấm này chạy trước khi hệ thống ghi lại lý do.",
    severity: "warn",
  },
};

// Thứ tự hiển thị: nghiêm trọng trước. Người đọc gặp `fail_leak` ở dòng đầu, không phải sau khi
// cuộn qua mười case đạt.
const _ORDER: CaseOutcome[] = [
  "fail_leak",
  "fail_unobserved",
  "fail_refused",
  "fail_wrong_answer",
  "pass_refusal",
  "pass_answer",
  "unknown",
];

export function scorecardBreakdown(scorecard: Scorecard): ScorecardBreakdown {
  const results = scorecard.results ?? [];
  const fenceCases = results.filter((r) => r.expects_refusal);
  const answerCases = results.filter((r) => !r.expects_refusal);

  const fence = {
    total: fenceCases.length,
    passed: fenceCases.filter((r) => r.success).length,
    leaked: fenceCases.filter((r) => r.outcome === "fail_leak").length,
    unobserved: fenceCases.filter((r) => r.outcome === "fail_unobserved").length,
  };
  const answer = { total: answerCases.length, passed: answerCases.filter((r) => r.success).length };

  const groups = _ORDER.map((outcome) => ({
    outcome,
    ...(_SPEC[outcome] ?? _SPEC.unknown),
    cases: results.filter((r) => r.outcome === outcome),
  })).filter((g) => g.cases.length > 0);

  return { fence, answer, groups, headline: headlineFor(scorecard, fence, answer) };
}

/** Một câu nói thẳng nguyên nhân, xếp theo mức nghiêm trọng.
 *
 * Trả về câu ĐẦU TIÊN đúng chứ không ghép mọi vấn đề lại: người đọc cần biết sửa gì TRƯỚC, và một
 * đoạn liệt kê năm vấn đề ngang hàng thì không nói được điều đó. */
function headlineFor(
  scorecard: Scorecard,
  fence: ScorecardBreakdown["fence"],
  answer: ScorecardBreakdown["answer"],
): string {
  if (fence.leaked > 0) {
    return `Hàng rào bị thủng: ${fence.leaked}/${fence.total} câu hỏi ngoài phạm vi được agent trả lời thay vì từ chối.`;
  }
  if (scorecard.gate.verdict === "PASS") {
    return `Đạt cả hai nấc: hàng rào ${fence.passed}/${fence.total}, trả lời ${answer.passed}/${answer.total}.`;
  }
  if (answer.total > 0 && answer.passed === 0) {
    // Ca đã đo được trên hệ thật: recipe thiếu `kb_search` ⇒ agent trả "không có thông tin" cho mọi
    // câu ⇒ 0/N. Nói thẳng chỗ cần kiểm thay vì để người dùng đoán giữa "agent kém" và "câu hỏi sai".
    return `Không câu nào trả lời được (0/${answer.total}) — kiểm tra agent có node KB và KB đã có tài liệu chưa.`;
  }
  if (fence.unobserved > 0 && fence.passed === 0) {
    return `Không xác minh được hàng rào: ${fence.unobserved}/${fence.total} lượt không ghi nhận việc tra KB.`;
  }
  const need = scorecard.gate.threshold;
  const got = scorecard.aggregate;
  if (got.success_rate < need.success) {
    return `Chưa đạt ngưỡng trả lời đúng: ${(got.success_rate * 100).toFixed(0)}% so với ${(need.success * 100).toFixed(0)}% yêu cầu.`;
  }
  if (got.citation_accuracy !== null && got.citation_accuracy < need.citation_accuracy) {
    return `Trả lời đủ đúng nhưng trích dẫn chưa đạt: ${(got.citation_accuracy * 100).toFixed(0)}% so với ${(need.citation_accuracy * 100).toFixed(0)}% yêu cầu.`;
  }
  return "";
}

/**
 * Panel trace — ba dạng sự kiện `llm-step`, không phải hai.
 *
 * `run_agent_loop()` phát ra ba dạng: lượt GỌI TOOL (`signal="tool-call"`, không có `answer`), lượt
 * KIỂM CHỨNG TRÍCH DẪN (`signal="faithfulness-verify"`, cũng không có `answer`), và lượt TRẢ LỜI
 * CUỐI. Panel trước đây chỉ biết hai dạng đầu-cuối, nên bước kiểm chứng rơi xuống nhánh câu-trả-lời
 * và in `(không có answer)` — đọc như một lượt hỏng, trong khi nó chạy đúng.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TestTraceDetail from "./TestTraceDetail";
import type { WireTraceEvent } from "../playground/api";

afterEach(cleanup);

function event(outputs: Record<string, unknown>, node_type = "llm-step"): WireTraceEvent {
  return {
    event_id: `e-${Math.random().toString(36).slice(2, 7)}`,
    run_id: "r1",
    agent_id: "t1",
    node_id: "n1",
    node_type,
    ts: "2026-08-27T00:00:00Z",
    outputs,
    citations: [],
  } as unknown as WireTraceEvent;
}

function renderTimeline(events: WireTraceEvent[]) {
  return render(
    <TestTraceDetail
      accent="#2F6659"
      sections={[{ label: "Toàn bộ luồng thực thi", content: { kind: "timeline", events } }]}
      onClose={() => {}}
    />,
  );
}

describe("TestTraceDetail — bước kiểm chứng trích dẫn", () => {
  const verify = {
    signal: "faithfulness-verify",
    verdict: "CO",
    raw: "CO",
    citations_checked: ["ankor-hr-leave#c1"],
  };

  it("KHÔNG in '(không có answer)' cho bước kiểm chứng", () => {
    // Đây là triệu chứng người dùng báo. Bước này không có `answer` theo THIẾT KẾ — nó trả verdict.
    renderTimeline([event(verify)]);
    expect(screen.queryByText(/không có answer/i)).not.toBeInTheDocument();
  });

  it("thu gọn sẵn: hiện verdict, chi tiết phải bấm mới mở", () => {
    // Lúc verdict là CÓ thì không có gì để xử lý, và một bước máy móc chiếm chỗ sẽ đẩy câu trả lời
    // thật ra khỏi tầm mắt.
    renderTimeline([event(verify)]);
    expect(screen.getByText(/kiểm chứng trích dẫn/i)).toBeInTheDocument();
    expect(screen.queryByText(/ankor-hr-leave#c1/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/kiểm chứng trích dẫn/i));
    expect(screen.getByText(/ankor-hr-leave#c1/)).toBeInTheDocument();
  });

  it("verdict KHÔNG được nêu là ca cần chú ý, không phải một dấu tích", () => {
    // Verdict KHÔNG làm engine gỡ sạch citations và câu trả lời rơi về nhánh từ chối. Hiện nó y hệt
    // ca đạt thì không gì giải thích được vì sao agent bỗng từ chối.
    renderTimeline([event({ ...verify, verdict: "KHONG" })]);
    expect(screen.getByText(/citations bị gỡ/i)).toBeInTheDocument();
  });
});

describe("TestTraceDetail — top_k thực chạy", () => {
  it("model không khai top_k ⇒ nói rõ đang dùng mặc định", () => {
    // 141/411 lượt gọi `kb_search` trên một hệ thật rơi vào ca này, và trace cũ chỉ in
    // `{"query": ...}` — không có cách nào biết `5` từ đâu ra, hay có phải `5` không.
    renderTimeline([
      event({
        signal: "tool-call",
        tool_call: { tool: "kb_search", params: { query: "nghỉ phép" }, effective_top_k: 5 },
      }),
    ]);
    expect(screen.getByText(/top_k thực chạy: 5/)).toBeInTheDocument();
    expect(screen.getByText(/model không khai/i)).toBeInTheDocument();
  });

  it("model xin giá trị ngoài khoảng ⇒ nói rõ đã bị ép", () => {
    renderTimeline([
      event({
        signal: "tool-call",
        tool_call: { tool: "kb_search", params: { query: "q", top_k: 9999 }, effective_top_k: 10 },
      }),
    ]);
    expect(screen.getByText(/model xin 9999/)).toBeInTheDocument();
  });

  it("tool không phải kb_search ⇒ không hiện top_k", () => {
    // `effective_top_k` chỉ có nghĩa với `kb_search`; in nó cho `calculator` là bịa một tham số tool
    // đó không nhận.
    renderTimeline([
      event({ signal: "tool-call", tool_call: { tool: "calculator", params: { expression: "3+5" } } }),
    ]);
    expect(screen.queryByText(/top_k thực chạy/)).not.toBeInTheDocument();
  });
});

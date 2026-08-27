/**
 * `system_prompt` quay lại làm field cấu hình được — và **không bắt buộc**.
 *
 * `web#48` bỏ hẳn field này khỏi giao diện, nên `frameHeader()` luôn gửi `""`. Hệ quả là một recipe
 * publish TRƯỚC thay đổi đó mang system prompt thật sẽ bị ghi đè thành rỗng khi publish lại từ
 * canvas — nên `web#48` phải thêm cờ `hadNonBlankSystemPrompt` để CHẶN publish ở đúng ca đó.
 *
 * Khi canvas mang được giá trị trở lại thì cái chặn ấy hết lý do tồn tại: dựng lại từ canvas không
 * còn làm mất gì. Bài ở đây khoá cả hai vế — mang được giá trị, VÀ rỗng không bị chặn.
 */

import { describe, expect, it } from "vitest";
import type { AgentFrameData } from "./fromCanvas";
import { DEFAULT_HEADER } from "./sample";

function frame(systemPrompt: string): AgentFrameData {
  return {
    agentId: "t1",
    model: DEFAULT_HEADER.model,
    systemPrompt,
    toolWhitelist: [],
    kbId: DEFAULT_HEADER.kb_id,
    goldenSetRef: DEFAULT_HEADER.golden_set_ref,
    successThreshold: DEFAULT_HEADER.scorecard_threshold.success,
    citationThreshold: DEFAULT_HEADER.scorecard_threshold.citation_accuracy,
  };
}

describe("system_prompt", () => {
  it("giá trị người dùng gõ đi được tới recipe", () => {
    const data = frame("Bạn là trợ lý nhân sự của công ty.");
    expect(data.systemPrompt).toBe("Bạn là trợ lý nhân sự của công ty.");
  });

  it("để trống là hợp lệ — không phải lỗi, không chặn", () => {
    // Đây là điểm chính. Bắt buộc nhập sẽ chặn đúng ca phổ biến nhất: agent chỉ cần tra KB và trả
    // lời, không cần ai dặn thêm gì. `_GROUNDING_CONVENTION` của engine đã lo phần chỉ thị nền.
    expect(frame("").systemPrompt).toBe("");
  });
});

/**
 * `deriveToolWhitelist` — canvas khai công cụ gì thì recipe phải khai đúng thế.
 *
 * Bài ở đây khoá lại một lỗ đã đo được trên hệ thật: agent có node KB trên canvas nhưng
 * `tool_whitelist` rỗng, nên sau khi engine đảo A4 (engine#50 — `kb_search` chỉ dùng được khi có
 * trong whitelist) nó trả "Không có thông tin." cho **mọi** câu hỏi, và bảng điểm ra
 * `success_rate=0.00 · citation_accuracy=0.00`. Nhìn từ giao diện thì giống hệt "agent kém".
 */

import { describe, expect, it } from "vitest";
import { deriveToolWhitelist, KB_SEARCH_TOOL } from "./contract";

const kbNode = { type: "kb-retrieve" as const, params: { section_roles: ["hr"] } };
const toolNode = (tool: string) => ({ type: "tool-call" as const, params: { tool } });
const llmNode = { type: "llm-step" as const, params: { temperature: 0 } };

describe("deriveToolWhitelist", () => {
  it("có node KB trên canvas ⇒ kb_search vào whitelist", () => {
    expect(deriveToolWhitelist([], [kbNode, llmNode])).toContain(KB_SEARCH_TOOL);
  });

  it("KHÔNG có node KB ⇒ kb_search KHÔNG tự chui vào", () => {
    // Đối trọng bắt buộc: nếu thêm vô điều kiện thì mọi agent đều có quyền tra KB, và cả việc đảo
    // A4 lẫn node KB trên canvas đều mất ý nghĩa.
    expect(deriveToolWhitelist([], [llmNode])).not.toContain(KB_SEARCH_TOOL);
  });

  it("node Tool Call khai tool nào thì tool đó vào whitelist", () => {
    expect(deriveToolWhitelist([], [toolNode("calculator"), llmNode])).toEqual(["calculator"]);
  });

  it("giữ tool đã khai sẵn ở frame, không ghi đè", () => {
    // Recipe nạp lại từ bản đã publish mang whitelist của chính nó (`toCanvas`). Ghi đè bằng thứ
    // suy từ canvas sẽ âm thầm THU HẸP quyền của một agent đang chạy.
    expect(deriveToolWhitelist(["http_get"], [kbNode])).toEqual(["http_get", KB_SEARCH_TOOL]);
  });

  it("không nhân bản khi tool đã có sẵn", () => {
    expect(deriveToolWhitelist([KB_SEARCH_TOOL], [kbNode])).toEqual([KB_SEARCH_TOOL]);
    expect(deriveToolWhitelist(["calculator"], [toolNode("calculator")])).toEqual(["calculator"]);
  });

  it("bỏ qua node Tool Call chưa chọn tool", () => {
    // `params.tool` rỗng là node vừa thả ra chưa cấu hình. Đẩy chuỗi rỗng vào whitelist là dữ liệu
    // hỏng nằm im tới tận tầng engine.
    expect(deriveToolWhitelist([], [toolNode(""), toolNode("   ")])).toEqual([]);
  });

  it("thứ tự tất định — recipe_hash phụ thuộc vào nó", () => {
    // `recipe_hash` băm nguyên recipe. Thứ tự đổi giữa hai lần render là hash đổi, và cổng publish
    // sẽ coi cùng một agent là hai bản khác nhau.
    const nodes = [toolNode("calculator"), kbNode, toolNode("http_get")];
    expect(deriveToolWhitelist([], nodes)).toEqual(deriveToolWhitelist([], nodes));
    expect(deriveToolWhitelist([], nodes)).toEqual(["calculator", KB_SEARCH_TOOL, "http_get"]);
  });
});

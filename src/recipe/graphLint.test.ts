/**
 * Test cho `advisories()` — review PR#41 (TranBaDat2607) chỉ ra file này đổi hành vi (bỏ note
 * "tool bật trong whitelist nhưng không node nào gọi", rút gọn text các note còn lại) mà không có
 * test nào khoá lại, khác hẳn 5 test đã có cho `deriveToolWhitelist` (`fromCanvas.test.ts`). File
 * này khoá đúng phần đã đổi.
 */

import { describe, expect, it } from "vitest";
import { advisories } from "./graphLint";
import type { WireRecipe } from "./contract";

function recipe(overrides: Partial<WireRecipe["dag"]> & { tool_whitelist?: string[] } = {}): WireRecipe {
  const { tool_whitelist, ...dag } = overrides;
  return {
    agent_id: "a1",
    tenant_id: "t1",
    agent_config: {
      system_prompt: "x",
      model: "gemini-2.5-flash",
      tool_whitelist: tool_whitelist ?? [],
      temperature: 0.7,
    },
    dag: { nodes: [], edges: [], ...dag },
    kb_binding: { kb_id: "kb", scope: "ankor/public" },
    golden_set_ref: "ref",
    scorecard_threshold: { success: 0.9, citation_accuracy: 0.95 },
  };
}

describe("advisories", () => {
  it("canvas trống → đúng 1 note ngắn, không có note khác", () => {
    expect(advisories(recipe())).toEqual(["Canvas trống."]);
  });

  it("node chưa nối cạnh (>1 node) → note liệt kê đúng id", () => {
    const r = recipe({
      nodes: [
        { id: "n1", type: "llm-step", params: {} },
        { id: "n2", type: "tool-call", params: { tool: "calculator" } },
      ],
      edges: [],
      tool_whitelist: ["calculator"],
    });
    expect(advisories(r)).toContain("Node chưa nối cạnh: n1, n2.");
  });

  it("1 node duy nhất chưa nối cạnh → KHÔNG báo (không có gì để nối)", () => {
    const r = recipe({ nodes: [{ id: "n1", type: "llm-step", params: {} }], edges: [] });
    expect(advisories(r)).toEqual([]);
  });

  it("tool-call gọi tool ngoài whitelist → note liệt kê đúng node", () => {
    const r = recipe({
      nodes: [
        { id: "n1", type: "llm-step", params: {} },
        { id: "n2", type: "tool-call", params: { tool: "calculator" } },
      ],
      edges: [{ from: "n1", to: "n2", when: null }],
      tool_whitelist: [], // whitelist rỗng dù node đã chọn calculator — ca lệch (vd recipe cũ nạp lại)
    });
    expect(advisories(r)).toEqual(["Tool ngoài whitelist: n2."]);
  });

  it("whitelist suy đúng từ node (deriveToolWhitelist) → không còn note nào cả", () => {
    // web#40/PR#41: whitelist giờ LUÔN suy từ chính node tool-call, nên "tool bật nhưng không
    // node nào gọi" không còn xảy ra được nữa — khoá đúng bất biến đó.
    const r = recipe({
      nodes: [
        { id: "n1", type: "llm-step", params: {} },
        { id: "n2", type: "tool-call", params: { tool: "calculator" } },
      ],
      edges: [{ from: "n1", to: "n2", when: null }],
      tool_whitelist: ["calculator"],
    });
    expect(advisories(r)).toEqual([]);
  });
});

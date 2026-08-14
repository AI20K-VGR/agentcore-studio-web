/**
 * DAG mẫu + header mặc định của Workbench.
 *
 * Tách khỏi `App.tsx` để chỗ khác import được mà không kéo theo React: `scripts/emit-fixture.ts`
 * dùng đúng 2 thứ này để sinh `packages/workbench/tests/fixtures/canvas_export_d12.json`. Nhờ
 * vậy fixture bên Python là output THẬT của canvas, không phải bản chép tay có thể lệch âm thầm
 * khi canvas đổi.
 */

import type { Edge as FlowEdge, Node as FlowNode } from "reactflow";

import { ANKOR_ID, type NodeType } from "./contract";
import type { CanvasEdgeData, CanvasNodeData, RecipeHeader } from "./fromCanvas";

export const DEFAULT_HEADER: RecipeHeader = {
  agent_id: "agent-callisto-d12",
  tenant_id: ANKOR_ID,
  instructions: "Hãy tra cứu tài liệu Callisto và trả lời thắc mắc của người dùng.",
  model: "gemini-2.5-flash",
  tool_whitelist: ["kb_search"],
  kb_id: "kb-callisto-v1",
  scope: "ankor/public",
  golden_set_ref: "callisto-golden-30-v1",
  scorecard_threshold: { success: 0.9, citation_accuracy: 0.95 },
};

/** DAG mẫu — để demo không phải vẽ tay từ đầu mỗi lần. */
export function sampleGraph(): {
  nodes: FlowNode<CanvasNodeData>[];
  edges: FlowEdge<CanvasEdgeData>[];
} {
  const spec: Array<[string, NodeType, Record<string, unknown>]> = [
    [
      "n1",
      "kb-retrieve",
      { query: "Nhân viên xin nghỉ phép cần báo trước bao lâu?", top_k: 3, section_roles: ["public"] },
    ],
    ["n2", "llm-step", { temperature: 0 }],
    ["n3", "tool-call", { tool: "kb_search" }],
    ["n4", "end", {}],
  ];

  return {
    nodes: spec.map(([id, type, params], index) => ({
      id,
      type: "recipeNode",
      position: { x: 120, y: 30 + index * 120 },
      data: { type, params },
    })),
    edges: [
      { id: "e-n1-n2", source: "n1", target: "n2", data: { when: null } },
      { id: "e-n2-n3", source: "n2", target: "n3", data: { when: null } },
      { id: "e-n3-n4", source: "n3", target: "n4", data: { when: null } },
    ],
  };
}

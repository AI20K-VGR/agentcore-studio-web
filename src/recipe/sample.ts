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
  system_prompt: "Hãy tra cứu tài liệu Callisto và trả lời thắc mắc của người dùng.",
  model: "gemini-2.5-flash",
  // web#34 (workbench#48) — `agentShapeLint`'s `tool_whitelist.no_kb_search` giờ FAIL nếu
  // `kb_search` có mặt ở đây: nó luôn khả dụng (A4, `run_agent_loop`), không cần/không nên khai
  // trong whitelist. Trước D12 giữ `["kb_search"]` vì `graph_lint()` cũ không có luật này.
  tool_whitelist: [],
  kb_id: "kb-callisto-v1",
  scope: "ankor/public",
  // `callisto-2.0-golden-30-v1` — khớp corpus 2.0 hiện có trong `kb.chunks` (chunk_id khác hẳn
  // v1.0). Trước đây để `"callisto-smoke-5-v0"` — bộ golden đời 1.0, chunk_id kiểu cũ, nên
  // citation_accuracy LUÔN = 0 kể từ khi corpus chuyển sang 2.0 dù retrieval đúng (bug sống thật,
  // xem PR-4 `agentcore-studio-app#31`/`web#9`). File thật kiểm được qua
  // `_GOLDEN_SET_DIR / f"{ref}.yaml"` phía server, không tự chọn tuỳ ý.
  golden_set_ref: "callisto-2.0-golden-30-v1",
  scorecard_threshold: { success: 0.9, citation_accuracy: 0.95 },
};

/** DAG mẫu — để demo không phải vẽ tay từ đầu mỗi lần.
 *
 * web#44 — chỉ còn `llm-step`, KHÔNG seed `kb-retrieve` nữa: node đó không còn kéo-thả thêm được
 * từ palette (`DRAGGABLE_NODE_TYPES`), giữ nó trong sample sẽ minh hoạ ngược lại đúng vấn đề issue
 * này sửa (làm người xem tưởng vẫn thêm được). 0 `kb-retrieve` vẫn hợp lệ với `agentTopologyLint`
 * (luật `dag.at_most_one_kb_retrieve_node` cho phép 0-1). */
export function sampleGraph(): {
  nodes: FlowNode<CanvasNodeData>[];
  edges: FlowEdge<CanvasEdgeData>[];
} {
  const spec: Array<[string, NodeType, Record<string, unknown>]> = [["n2", "llm-step", { temperature: 0 }]];

  return {
    nodes: spec.map(([id, type, params], index) => ({
      id,
      type: "recipeNode",
      position: { x: 120, y: 30 + index * 120 },
      data: { type, params },
    })),
    edges: [],
  };
}

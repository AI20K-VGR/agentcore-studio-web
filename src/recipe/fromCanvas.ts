/**
 * Canvas (React Flow) → Recipe wire JSON.
 *
 * Đây là chỗ DUY NHẤT dịch từ hình dạng của React Flow (`Node`/`Edge` có toạ độ, handle, style)
 * sang hình dạng contract (`WireRecipe`). Toạ độ x/y CỐ Ý bị bỏ: `studio_contracts.Dag` không có
 * chỗ chứa layout, và nhét layout vào `params` sẽ biến dữ liệu trình bày thành dữ liệu contract
 * mà interpreter phải bước qua. Kéo node sang chỗ khác không được đổi recipe.
 */

import type { Edge as FlowEdge, Node as FlowNode } from "reactflow";

import type {
  NodeType,
  WireEdge,
  WireNode,
  WireRecipe,
  WireScorecardThreshold,
} from "./contract";

/** Dữ liệu gắn trên mỗi node canvas. */
export interface CanvasNodeData {
  type: NodeType;
  params: Record<string, unknown>;
  /** Node bị graph-lint chỉ mặt — canvas tô viền đỏ. */
  invalid?: boolean;
  /** Test Mode (web#35) — trạng thái phát lại, tính lúc render (`App.tsx::displayNodes`), KHÔNG
   * lưu vào state canvas thật, cùng nguyên tắc với `invalid` ở trên. `"active"` = node đang được
   * highlight trong lượt phát lại hiện tại; `"done"` = đã đi qua. */
  testHighlight?: "active" | "done";
  /** web#45 — `true` CHỈ cho đúng node `llm-step` là tâm hình sao, CHỈ khi Test Mode đang bật.
   * `RecipeNode` dùng cờ này để render thêm 2 cổng trái/phải (nối node giả câu hỏi/phản hồi) —
   * không lưu vào state canvas thật, tính lúc render giống `testHighlight`. */
  testModeHub?: boolean;
}

/** Dữ liệu gắn trên mỗi cạnh canvas — `when` của `Edge` trong contract. */
export interface CanvasEdgeData {
  when: string | null;
}

/** Phần recipe KHÔNG đến từ canvas: người dùng gõ ở form bên trái. */
export interface RecipeHeader {
  agent_id: string;
  tenant_id: string;
  system_prompt: string;
  model: string;
  tool_whitelist: string[];
  kb_id: string;
  scope: string;
  golden_set_ref: string;
  scorecard_threshold: WireScorecardThreshold;
}

/**
 * Dữ liệu gắn trên node "khung agent" (`type: "agentFrame"`, xem `canvas/AgentFrameNode.tsx`) —
 * đúng `RecipeHeader` trừ `tenant_id`/`scope` (2 field đó luôn suy từ session, không phải state
 * riêng của từng khung). 1 canvas giờ có thể có NHIỀU khung, mỗi khung là 1 agent độc lập; node
 * DAG thường (`recipeNode`) thuộc khung nào qua field chuẩn của react-flow `parentId` (KHÔNG phải
 * field tự đặt) — xem `nodesForFrame`/`edgesForFrame` bên dưới.
 */
export interface AgentFrameData {
  agentId: string;
  model: string;
  toolWhitelist: string[];
  kbId: string;
  goldenSetRef: string;
  successThreshold: number;
  citationThreshold: number;
  /** Version đang xem trên canvas — có mặt khi khung được nạp từ 1 recipe đã publish/rollback
   * qua `GET /api/agents/{agent_id}/recipe` (`fromRecipe()`); `undefined` cho khung mới tạo tay
   * (chưa từng publish, không có version nào để gắn). Hiển thị ở thanh tiêu đề khung
   * (`AgentFrameNode`) và panel "Agent đang sửa" — phản hồi: canvas không cho biết đang xem
   * version nào. */
  version?: number;
  /** Snapshot JSON của recipe NGAY LÚC vừa nạp `version` ở trên (tính bằng chính `buildRecipe()`
   * trên node/cạnh vừa nạp, không phải JSON thô từ server — so khớp 2 đầu ra của CÙNG 1 hàm mới
   * không dính lệch định dạng giả). Dùng để biết khung có bị sửa gì kể từ lúc nạp hay không
   * (`App.tsx::isDirty`) — quyết định nút Publish là "đưa version này lên live" (rollback, không
   * cần Chấm điểm lại) hay "publish bản mới" (đòi Chấm điểm PASS). `undefined` cùng lúc với
   * `version` — khung tạo tay chưa từng publish không có gì để so. */
  loadedSnapshot?: string;
  /** kit#206/web#14 (W3) — type node KHÔNG thuộc `CORE_NODE_TYPES` (vd `condition`, `hitl-pause`)
   * có mặt trong recipe vừa nạp nhưng bị `fromRecipe()` lọc khỏi canvas (UI rút gọn chỉ hiện 3
   * loại node). Rỗng/`undefined` = recipe nạp vào không có node nào bị ẩn. Khi CÓ giá trị: những
   * node đó không hiển thị, không sửa được, và (quan trọng) sẽ KHÔNG có mặt trong `buildRecipe()`
   * tiếp theo — publish tiếp từ trạng thái này sẽ xoá vĩnh viễn các node đó khỏi recipe. Dùng để
   * chặn Publish + cảnh báo rõ (`App.tsx::canPublish`), thay vì để mất dữ liệu im lặng.
   *
   * web#34 (workbench#48): bao gồm CẢ `"end"` bây giờ — trước đây loại đó bị trừ ra vì canvas tự
   * sinh lại 1 node `end` mỗi lần build recipe (`ensureImplicitEndNode`, đã xoá; lint mới,
   * `agentTopologyLint`, cấm hẳn node `end` trong `recipe.dag`), nên "mất" nó lúc nạp về không
   * từng là mất dữ liệu thật. Giờ không còn synthesize lại nữa, nên 1 `end` thật (từ 1 recipe đã
   * publish dưới backend cũ) phải được báo như `condition`/`hitl-pause`. */
  hiddenNodeTypes?: NodeType[];
  /** web#48 — `system_prompt` không còn field cấu hình được ở frontend nữa (luôn gửi `""`,
   * `App.tsx::frameHeader()`). Recipe đã publish TRƯỚC thay đổi này có thể có `system_prompt`
   * không rỗng — cờ này `true` khi `fromRecipe()` nạp về đúng trường hợp đó, cùng nguyên tắc với
   * `hiddenNodeTypes` ở trên: publish tiếp qua nhánh dựng-lại-từ-canvas sẽ ghi đè nó thành `""`
   * một cách âm thầm nếu không chặn (`App.tsx::canPublish`/`hiddenNodesBlockPublish`). */
  hadNonBlankSystemPrompt?: boolean;
}

/** Node DAG thuộc khung `frameId` — lọc theo `parentId` chuẩn react-flow (không phải node khung). */
export function nodesForFrame(
  frameId: string,
  nodes: FlowNode<CanvasNodeData>[],
): FlowNode<CanvasNodeData>[] {
  return nodes.filter((node) => node.type !== "agentFrame" && node.parentId === frameId);
}

/** Cạnh thuộc khung `frameId` — cả 2 đầu cạnh phải là node CỦA ĐÚNG khung đó (cạnh không thể bắc
 * qua 2 khung khác nhau, mỗi khung là 1 recipe độc lập). */
export function edgesForFrame(
  frameId: string,
  nodes: FlowNode<CanvasNodeData>[],
  edges: FlowEdge<CanvasEdgeData>[],
): FlowEdge<CanvasEdgeData>[] {
  const memberIds = new Set(nodesForFrame(frameId, nodes).map((node) => node.id));
  return edges.filter((edge) => memberIds.has(edge.source) && memberIds.has(edge.target));
}

export function toWireNodes(nodes: FlowNode<CanvasNodeData>[]): WireNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.data.type,
    params: node.data.params,
  }));
}

export function toWireEdges(edges: FlowEdge<CanvasEdgeData>[]): WireEdge[] {
  return edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    when: edge.data?.when ?? null,
  }));
}

/**
 * Ghép form (header) + canvas (dag) thành 1 `WireRecipe` đầy đủ 7 field của contract.
 *
 * D12 sửa 2 lỗi hợp đồng của bản form D4 cũ trong `App.tsx`:
 * 1. field `tenant` (slug "ankor") → `tenant_id` (UUID) — contract đổi từ D-13, form chưa theo.
 * 2. thiếu `golden_set_ref` + `scorecard_threshold` — 2 field BẮT BUỘC; recipe cũ export ra sẽ
 *    bị `Recipe.model_validate()` từ chối ngay, tức là chưa từng đi lọt qua contract lần nào.
 */
/** `temperature` sống ở node `llm-step` (duy nhất mỗi agent), KHÔNG phải `RecipeHeader` — đọc từ
 * chính node đó, fallback `0.7` (khớp default `AgentConfig.temperature` backend) nếu vì lý do gì
 * đó chưa có node `llm-step` nào (không nên xảy ra sau khi `createFrame()` luôn tự sinh 1 node). */
function readTemperature(nodes: FlowNode<CanvasNodeData>[]): number {
  const llmNode = nodes.find((node) => node.data.type === "llm-step");
  const raw = llmNode?.data.params.temperature;
  return typeof raw === "number" && !Number.isNaN(raw) ? raw : 0.7;
}

/** `agent_config.tool_whitelist` — suy TRỰC TIẾP từ tool THẬT có mặt trên canvas, không phải 1 mảng
 * riêng phải tự đồng bộ tay. `agent_loop.py` đọc đúng field này để dựng `tool_names` cho LLM — 1
 * agent chỉ có node Tool Call chọn `calculator` thì LLM chỉ thấy/gọi được `calculator`, không tự
 * nhiên có `current_datetime` ("canvas vẽ gì thì agent gọi được nấy").
 *
 * engine#49 — đảo A4: `kb_search` giờ theo ĐÚNG nguyên tắc trên thay vì luôn có mặt bất kể canvas.
 * Node `kb-retrieve` (tối đa 1, `agentTopologyLint`) không mang `params["tool"]` như node `tool-call`
 * — tên tool của nó CỐ ĐỊNH là `"kb_search"` (khớp `KB_SEARCH_TOOL` bên `agent_loop.py`/`validator.py`),
 * nên chèn thẳng literal thay vì đọc từ params. Đặt TRƯỚC các tool từ node `tool-call` — khớp thứ tự
 * `[kb_search, ...tool_whitelist]` cũ bên engine, để thứ tự hiển thị/trace không đổi bất ngờ.
 *
 * Dedupe (giữ thứ tự xuất hiện) — nhiều node cùng chọn 1 tool không nhân đôi trong whitelist. Dropdown
 * ở `NodeConfigModal.tsx` chỉ cho chọn trong `AVAILABLE_TOOLS` (không có `kb_search` — đúng, tool đó
 * không đến từ dropdown mà từ chính việc canvas có node `kb-retrieve` hay không). */
function deriveToolWhitelist(nodes: FlowNode<CanvasNodeData>[]): string[] {
  const seen = new Set<string>();
  const whitelist: string[] = [];
  if (nodes.some((node) => node.data.type === "kb-retrieve")) {
    seen.add("kb_search");
    whitelist.push("kb_search");
  }
  for (const node of nodes) {
    if (node.data.type !== "tool-call") continue;
    const tool = node.data.params["tool"];
    if (typeof tool !== "string" || tool.trim().length === 0 || seen.has(tool)) continue;
    seen.add(tool);
    whitelist.push(tool);
  }
  return whitelist;
}

export function buildRecipe(
  header: RecipeHeader,
  nodes: FlowNode<CanvasNodeData>[],
  edges: FlowEdge<CanvasEdgeData>[],
): WireRecipe {
  return {
    agent_id: header.agent_id,
    tenant_id: header.tenant_id,
    agent_config: {
      system_prompt: header.system_prompt,
      model: header.model,
      // Suy từ node `tool-call` trên canvas (`deriveToolWhitelist`), KHÔNG đọc `header.tool_whitelist`
      // — field đó chết từ khi AgentConfigModal bị rút gọn (PR#37), không còn UI nào sửa, luôn `[]`.
      tool_whitelist: deriveToolWhitelist(nodes),
      temperature: readTemperature(nodes),
    },
    dag: {
      nodes: toWireNodes(nodes),
      edges: toWireEdges(edges),
    },
    kb_binding: {
      kb_id: header.kb_id,
      scope: header.scope,
    },
    golden_set_ref: header.golden_set_ref,
    scorecard_threshold: header.scorecard_threshold,
  };
}

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
  systemPrompt: string;
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
   * chặn Publish + cảnh báo rõ (`App.tsx::canPublish`), thay vì để mất dữ liệu im lặng. KHÔNG bao
   * gồm `"end"` — loại đó cố ý luôn bị ẩn/tổng hợp lại (`ensureImplicitEndNode`), không phải mất
   * dữ liệu. */
  hiddenNodeTypes?: NodeType[];
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
      tool_whitelist: header.tool_whitelist,
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

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
  instructions: string;
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
  instructions: string;
  model: string;
  toolWhitelist: string[];
  kbId: string;
  goldenSetRef: string;
  successThreshold: number;
  citationThreshold: number;
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
export function buildRecipe(
  header: RecipeHeader,
  nodes: FlowNode<CanvasNodeData>[],
  edges: FlowEdge<CanvasEdgeData>[],
): WireRecipe {
  return {
    agent_id: header.agent_id,
    tenant_id: header.tenant_id,
    agent_config: {
      instructions: header.instructions,
      model: header.model,
      tool_whitelist: header.tool_whitelist,
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

/**
 * Recipe wire JSON → canvas (chiều ngược lại), cho nút Import.
 *
 * Contract không chứa layout, nên vị trí node phải được sinh lại. Xếp theo lớp tôpô để đồ thị
 * nhập vào đọc được ngay: mỗi lớp = các node mà mọi cạnh vào đều tới từ lớp trước. Đồ thị có
 * chu trình sẽ còn node không xếp được lớp nào — số đó dồn vào lớp cuối rồi trả về nguyên vẹn,
 * KHÔNG bị loại bỏ: recipe hỏng phải vào được canvas thì graph-lint mới có cái để chỉ mặt.
 */
export function toCanvas(recipe: WireRecipe): {
  nodes: FlowNode<CanvasNodeData>[];
  edges: FlowEdge<CanvasEdgeData>[];
} {
  const { nodes: wireNodes, edges: wireEdges } = recipe.dag;

  const indegree = new Map<string, number>();
  for (const node of wireNodes) indegree.set(node.id, 0);
  for (const edge of wireEdges) {
    if (indegree.has(edge.to)) indegree.set(edge.to, indegree.get(edge.to)! + 1);
  }

  const depth = new Map<string, number>();
  let frontier = wireNodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let level = 0;
  const remaining = new Map(indegree);

  while (frontier.length > 0) {
    for (const id of frontier) depth.set(id, level);
    const next: string[] = [];
    for (const edge of wireEdges) {
      if (!depth.has(edge.from) || depth.has(edge.to)) continue;
      if (!remaining.has(edge.to)) continue;
      const left = remaining.get(edge.to)! - 1;
      remaining.set(edge.to, left);
      if (left === 0) next.push(edge.to);
    }
    frontier = [...new Set(next)];
    level += 1;
  }

  // Node còn sót (nằm trong chu trình) — dồn xuống lớp cuối cùng.
  for (const node of wireNodes) {
    if (!depth.has(node.id)) depth.set(node.id, level);
  }

  const perLevel = new Map<number, number>();
  const nodes: FlowNode<CanvasNodeData>[] = wireNodes.map((node) => {
    const y = depth.get(node.id)!;
    const x = perLevel.get(y) ?? 0;
    perLevel.set(y, x + 1);
    return {
      id: node.id,
      type: "recipeNode",
      position: { x: 40 + x * 220, y: 40 + y * 130 },
      data: { type: node.type, params: node.params },
    };
  });

  const edges: FlowEdge<CanvasEdgeData>[] = wireEdges.map((edge, index) => ({
    id: `e-${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.when ?? undefined,
    data: { when: edge.when },
  }));

  return { nodes, edges };
}

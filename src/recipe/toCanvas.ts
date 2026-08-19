/**
 * Recipe wire JSON → Canvas (React Flow) — nghịch đảo của `buildRecipe()` (`fromCanvas.ts`).
 *
 * `studio_contracts.Dag`/`Node` KHÔNG mang toạ độ x/y (`fromCanvas.ts` đã bỏ CỐ Ý khi build recipe
 * ngược lại) — nạp recipe từ backend về KHÔNG THỂ khôi phục đúng layout gốc người dùng từng kéo,
 * phải tự sinh layout mới. Ở đây dùng cách đơn giản nhất: xếp theo thứ tự topological của
 * `dag.edges` (BFS từ node không có cạnh vào), 1 cột dọc, cách đều — đủ để xem lại DAG đúng nội
 * dung/thứ tự chạy, không cố khôi phục vị trí thẩm mỹ.
 */

import type { Edge as FlowEdge, Node as FlowNode } from "reactflow";

import { AGENT_FRAME_DRAG_HANDLE } from "../canvas/AgentFrameNode";
import type { AgentFrameData, CanvasEdgeData, CanvasNodeData } from "./fromCanvas";
import type { WireRecipe } from "./contract";

const NODE_V_GAP = 140;
const NODE_X = 40;

/** Thứ tự topological (Kahn) của `nodes` theo `edges` — node không tới được từ node gốc nào (đảo
 * cô lập, hoặc chu trình sót qua graph-lint) rơi xuống cuối theo đúng thứ tự khai báo, không rớt
 * mất khỏi canvas. */
function topologicalOrder(recipe: WireRecipe): string[] {
  const ids = recipe.dag.nodes.map((n) => n.id);
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of recipe.dag.edges) {
    if (!adjacency.has(edge.from) || !indegree.has(edge.to)) continue;
    adjacency.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = ids.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  // Node còn sót (chu trình, hoặc không tới được từ gốc) — nối đuôi theo thứ tự khai báo gốc.
  for (const id of ids) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}

/** Chuyển 1 `WireRecipe` thành `{ nodes, edges }` react-flow, bọc sẵn 1 khung agent (`agentFrame`)
 * — cùng shape `frameNode`/`framedNodes` mà `Studio`'s `initial` dựng lúc mount
 * (`App.tsx`), chỉ khác nguồn dữ liệu là recipe TẢI VỀ thay vì `sampleGraph()`. `frameId`/
 * `frameHeader`/`frameWidth`/`frameHeight` truyền vào từ nơi gọi để dùng chung đúng hằng số layout
 * đã có, không định nghĩa lại ở đây. */
export function fromRecipe(
  recipe: WireRecipe,
  opts: { frameId: string; frameHeader: number; frameWidth: number; frameHeight: number },
): { nodes: FlowNode<CanvasNodeData>[]; edges: FlowEdge<CanvasEdgeData>[] } {
  const { frameId, frameHeader, frameWidth, frameHeight } = opts;

  const frameData: AgentFrameData = {
    agentId: recipe.agent_id,
    instructions: recipe.agent_config.instructions,
    model: recipe.agent_config.model,
    toolWhitelist: recipe.agent_config.tool_whitelist,
    kbId: recipe.kb_binding.kb_id,
    goldenSetRef: recipe.golden_set_ref,
    successThreshold: recipe.scorecard_threshold.success,
    citationThreshold: recipe.scorecard_threshold.citation_accuracy,
  };
  const frameNode: FlowNode<CanvasNodeData> = {
    id: frameId,
    type: "agentFrame",
    position: { x: 0, y: 0 },
    style: { width: frameWidth, height: frameHeight },
    dragHandle: `.${AGENT_FRAME_DRAG_HANDLE}`,
    data: frameData as unknown as CanvasNodeData,
  };

  const order = topologicalOrder(recipe);
  const yById = new Map(order.map((id, i) => [id, frameHeader + 20 + i * NODE_V_GAP]));

  // Id node trong recipe (`"n_kb"`, `"n_end"`, ...) do người dựng recipe tự đặt, KHÔNG đảm bảo
  // không trùng với id ở khung khác đã có trên canvas (react-flow đòi `id` duy nhất TOÀN CỤC,
  // không chỉ trong phạm vi 1 khung/`parentId`) — prefix theo `frameId` (id khung này chắc chắn
  // mới sinh, xem `loadAgentFrame` ở App.tsx) để không bao giờ đụng node của khung khác.
  const scoped = (id: string) => `${frameId}__${id}`;

  const nodes: FlowNode<CanvasNodeData>[] = recipe.dag.nodes.map((node) => ({
    id: scoped(node.id),
    type: "recipeNode",
    parentId: frameId,
    extent: [
      [0, frameHeader],
      [frameWidth, frameHeight],
    ] as [[number, number], [number, number]],
    position: { x: NODE_X, y: yById.get(node.id) ?? frameHeader + 20 },
    data: { type: node.type, params: node.params } as CanvasNodeData,
  }));

  const edges: FlowEdge<CanvasEdgeData>[] = recipe.dag.edges.map((edge, i) => ({
    id: `e-${frameId}-${i}`,
    source: scoped(edge.from),
    target: scoped(edge.to),
    data: { when: edge.when },
  }));

  return { nodes: [frameNode, ...nodes], edges };
}

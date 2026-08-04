/**
 * graph-lint phía client — BẢN SAO của `studio_workbench.validator.graph_lint`.
 *
 * ## TODO (kit#87, D12 → chưa làm, nêu ra không giấu)
 * `validator.py` giờ có **7 luật** (D11: 4 luật gốc + D12: 3 luật mới theo yêu cầu AIE-1 — đúng
 * 1 start node, mỗi node ≤ 1 outgoing edge, walk phải kết ở node `end`). Bản TS dưới đây **vẫn
 * chỉ có 4 luật gốc** — 3 luật mới CHƯA được chép sang. Rủi ro đúng như luật "lệch thì nghiêng
 * về phía chặn" ở dưới nói: bản mirror đang LỎNG hơn cổng Python, không phải chặt hơn. Cụ thể,
 * `advisories()` bên dưới còn coi "thiếu node end" là cảnh báo vàng — nay Python đã chặn cứng.
 * Chưa gây lỗ hổng sống vì canvas chưa gọi xuống Python thật (§7 design-note D12), nhưng phải
 * đóng khe này trước khi nối HTTP endpoint thật.
 *
 * ## Đây KHÔNG phải cổng chặn
 * Cổng thật vẫn là `graph_lint()` Python, chạy server-side trước khi recipe tới interpreter
 * ("recipe không qua validator = không interpret"). Bản TS này chỉ để người dùng thấy lỗi NGAY
 * trên canvas thay vì sau 1 vòng round-trip. Client nói "hợp lệ" không cho phép bỏ qua cổng
 * Python; client nói "hỏng" thì UI chặn luôn nút export (fail-closed) — sai lệch giữa 2 bản, nếu
 * có, luôn nghiêng về phía chặn.
 *
 * ## Drift là rủi ro đã biết, và được kìm bằng test
 * 2 bản cùng 4 luật viết 2 lần bằng 2 ngôn ngữ = có thể lệch nhau. Kìm bằng
 * `packages/workbench/tests/test_wiring_d12.py`: fixture JSON trong test đó là output THẬT của
 * canvas này; nếu canvas sinh ra hình dạng mà Python từ chối (hoặc ngược lại), test đỏ.
 *
 * ## Thứ tự 4 luật giữ nguyên như Python (design-note D11 §3)
 * node-type → edge-destination → cycle → tool-whitelist. Edge-destination đứng TRƯỚC cycle để
 * vòng DFS không bao giờ phải đoán khi gặp cạnh trỏ tới node không tồn tại.
 *
 * Python raise ở vi phạm ĐẦU TIÊN (design-note D11 §4 — cố ý không gom list lỗi). Bản này trả về
 * đúng 1 vi phạm đầu tiên hoặc `null`, giữ nguyên ngữ nghĩa đó.
 */

import { NODE_TYPES, type NodeType, type WireRecipe } from "./contract";

export type LintRule =
  | "node-type"
  | "edge-destination"
  | "cycle"
  | "tool-whitelist";

export interface LintViolation {
  rule: LintRule;
  /** Thông điệp tiếng Việt cho UI. */
  message: string;
  /** Node/edge liên quan — canvas dùng để tô đỏ đúng chỗ. */
  nodeId?: string;
}

const CLOSED_TYPES = new Set<string>(NODE_TYPES);

/**
 * Chạy 4 luật trên `recipe`. Trả `null` nếu sạch, hoặc vi phạm ĐẦU TIÊN tìm thấy.
 *
 * `recipe.dag.nodes` được duyệt theo thứ tự khai báo (mảng), không theo Set — cùng lý do đã ghi
 * ở `validator.py`: thứ tự duyệt quyết định node nào bị báo là "node gây cycle", và kết quả đó
 * phải xác định (deterministic), không đổi giữa 2 lần chạy trên cùng input.
 */
export function graphLint(recipe: WireRecipe): LintViolation | null {
  const { nodes, edges } = recipe.dag;
  const nodeIds = new Set(nodes.map((node) => node.id));

  // Luật 1 — node ∈ 6 loại đóng. Canvas tự nó không tạo nổi node ngoài 6 (palette đóng), nên
  // luật này chỉ có việc khi recipe tới từ đường vòng: người dùng dán JSON qua nút Import, hoặc
  // 1 recipe cũ đọc lại từ `wb.recipes.recipe` sau khi contract đã đổi.
  for (const node of nodes) {
    if (!CLOSED_TYPES.has(node.type)) {
      return {
        rule: "node-type",
        nodeId: node.id,
        message: `Node "${node.id}" có type "${node.type}" — không thuộc 6 loại NodeType đóng.`,
      };
    }
  }

  // Luật 3 — mọi edge phải trỏ tới node có thật (cả 2 đầu).
  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      return {
        rule: "edge-destination",
        nodeId: edge.from,
        message: `Cạnh "${edge.from}" → "${edge.to}" không có nguồn hợp lệ (node "${edge.from}" không tồn tại).`,
      };
    }
    if (!nodeIds.has(edge.to)) {
      return {
        rule: "edge-destination",
        nodeId: edge.to,
        message: `Cạnh "${edge.from}" → "${edge.to}" không có đích hợp lệ (node "${edge.to}" không tồn tại).`,
      };
    }
  }

  // Luật 2 — không chu trình. DFS 3 màu, y hệt bản Python.
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);
  for (const edge of edges) adjacency.get(edge.from)!.push(edge.to);

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);

  // DFS lặp (không đệ quy) — DAG do người dùng vẽ có thể sâu tuỳ ý, và trình duyệt không có
  // `sys.setrecursionlimit` để nâng; stack tường minh thì không bao giờ vỡ ngăn xếp.
  let cyclicNode: string | null = null;
  for (const node of nodes) {
    if (color.get(node.id) !== WHITE) continue;

    const stack: Array<{ id: string; next: number }> = [{ id: node.id, next: 0 }];
    color.set(node.id, GRAY);

    while (stack.length > 0 && cyclicNode === null) {
      const frame = stack[stack.length - 1];
      const neighbors = adjacency.get(frame.id)!;

      if (frame.next >= neighbors.length) {
        color.set(frame.id, BLACK);
        stack.pop();
        continue;
      }

      const neighbor = neighbors[frame.next];
      frame.next += 1;

      if (color.get(neighbor) === GRAY) {
        cyclicNode = neighbor;
      } else if (color.get(neighbor) === WHITE) {
        color.set(neighbor, GRAY);
        stack.push({ id: neighbor, next: 0 });
      }
    }

    if (cyclicNode !== null) {
      return {
        rule: "cycle",
        nodeId: cyclicNode,
        message: `DAG có chu trình cấm đi qua node "${cyclicNode}". Interpreter không nhận recipe có vòng lặp.`,
      };
    }
  }

  // Luật 4 — tool của mọi node `tool-call` phải nằm trong `agent_config.tool_whitelist`.
  const whitelist = new Set(recipe.agent_config.tool_whitelist);
  for (const node of nodes) {
    if (node.type !== ("tool-call" satisfies NodeType)) continue;
    const tool = node.params["tool"];
    if (typeof tool !== "string" || !whitelist.has(tool)) {
      return {
        rule: "tool-whitelist",
        nodeId: node.id,
        message: `Node "${node.id}" gọi tool ${JSON.stringify(tool)} — không có trong tool_whitelist [${[
          ...whitelist,
        ]
          .sort()
          .join(", ")}].`,
      };
    }
  }

  return null;
}

/**
 * Cảnh báo NGOÀI 4 luật — những thứ `graph_lint()` Python KHÔNG chặn nhưng người dùng nên biết.
 *
 * Cố ý tách khỏi `graphLint()`: thêm luật thứ 5 vào bản mirror sẽ làm nó chặt hơn cổng Python,
 * nghĩa là canvas từ chối những recipe mà hệ thống thật vẫn nhận — mirror hết còn là mirror.
 * Những mục dưới đây hiện màu vàng (cảnh báo), không chặn export.
 */
export function advisories(recipe: WireRecipe): string[] {
  const notes: string[] = [];
  const { nodes, edges } = recipe.dag;

  if (nodes.length === 0) {
    notes.push("Canvas trống — recipe không có node nào. graph_lint vẫn cho qua, nhưng interpreter sẽ không có gì để chạy.");
    return notes;
  }

  if (!nodes.some((node) => node.type === "end")) {
    notes.push('Chưa có node "end" — DAG không có điểm kết thúc tường minh.');
  }

  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  const orphans = nodes.filter((node) => !connected.has(node.id)).map((node) => node.id);
  if (orphans.length > 0 && nodes.length > 1) {
    notes.push(`Node chưa nối cạnh nào: ${orphans.join(", ")}.`);
  }

  const declaredTools = new Set(
    nodes
      .filter((node) => node.type === "tool-call")
      .map((node) => node.params["tool"])
      .filter((tool): tool is string => typeof tool === "string"),
  );
  const unusedTools = recipe.agent_config.tool_whitelist.filter((tool) => !declaredTools.has(tool));
  if (unusedTools.length > 0) {
    notes.push(`Tool bật trong whitelist nhưng không node nào gọi: ${unusedTools.join(", ")}.`);
  }

  return notes;
}

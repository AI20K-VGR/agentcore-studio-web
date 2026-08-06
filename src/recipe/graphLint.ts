/**
 * graph-lint phía client — BẢN SAO của `studio_workbench.validator.graph_lint`.
 *
 * ## D14 (kit#97) — 3 luật còn thiếu đã chép sang
 * `validator.py` có **7 luật** (D11: 4 luật gốc + D12/kit#87: 3 luật theo yêu cầu AIE-1 — đúng 1
 * start node, mỗi node ≤ 1 outgoing edge, walk phải kết ở node `end`). Tới trước D14, bản TS này
 * vẫn chỉ có 4 luật gốc — đúng như luật "lệch thì nghiêng về phía chặn" cảnh báo, bản mirror khi
 * đó LỎNG hơn cổng Python, không phải chặt hơn (vd: canvas rỗng hiện "sạch" trên UI trong khi
 * Python đã từ chối vì 0 start-node candidate). D14 đóng khe đó: cả 7 luật, đúng thứ tự Python.
 *
 * Luật 4 (outgoing-edge, TẠM THỜI — gắn với tiến độ `ConditionExecutor` của AIE-1) là chính cái
 * "seam" condition/tool-call của Day 14: canvas không được để lọt 1 recipe có rẽ nhánh condition
 * thật (>1 outgoing edge) khi interpreter chưa đánh giá được `Edge.when` — trước D14, canvas TS
 * không biết luật này tồn tại nên sẽ cho export 1 recipe mà Python chắc chắn từ chối.
 *
 * ## Đây KHÔNG phải cổng chặn
 * Cổng thật vẫn là `graph_lint()` Python, chạy server-side trước khi recipe tới interpreter
 * ("recipe không qua validator = không interpret"). Bản TS này chỉ để người dùng thấy lỗi NGAY
 * trên canvas thay vì sau 1 vòng round-trip. Client nói "hợp lệ" không cho phép bỏ qua cổng
 * Python; client nói "hỏng" thì UI chặn luôn nút export (fail-closed) — sai lệch giữa 2 bản, nếu
 * có, luôn nghiêng về phía chặn.
 *
 * ## Drift là rủi ro đã biết, và được kìm bằng test
 * 2 bản cùng 7 luật viết 2 lần bằng 2 ngôn ngữ = có thể lệch nhau. Kìm bằng 2 lớp:
 * - `packages/workbench/tests/test_wiring_d12.py` — fixture JSON trong test đó là output THẬT
 *   của canvas này; nếu canvas sinh ra hình dạng mà Python từ chối (hoặc ngược lại), test đỏ.
 * - `apps/web/scripts/check-lint-parity.ts` (`pnpm check-parity`) — chạy CHÍNH `graphLint()` này
 *   trên cùng các case mutate mà `packages/workbench/tests/test_graph_lint.py` dùng, đối chiếu
 *   phán quyết. Đây là lớp duy nhất thực sự chạy code TS, không chỉ khoá hình dạng output.
 *
 * ## Thứ tự 7 luật giữ nguyên như Python (validator.py, design-note D11 §3 + D12/kit#87)
 * node-type → edge-destination → start-node → outgoing-edge → cycle → end-node → tool-whitelist.
 * Edge-destination đứng trước start-node/outgoing-edge/cycle vì các luật đó không được đoán khi
 * gặp cạnh trỏ tới node không tồn tại. Start-node + outgoing-edge đứng trước cycle vì luật 6
 * (end-node) cần đi bộ chuỗi đơn xác định — chỉ an toàn khi 3+4+5 đã đảm bảo đúng 1 điểm bắt đầu,
 * ≤1 bước mỗi node, và không vòng lặp.
 *
 * Python raise ở vi phạm ĐẦU TIÊN (design-note D11 §4 — cố ý không gom list lỗi). Bản này trả về
 * đúng 1 vi phạm đầu tiên hoặc `null`, giữ nguyên ngữ nghĩa đó.
 */

import { NODE_TYPES, type NodeType, type WireRecipe } from "./contract";

export type LintRule =
  | "node-type"
  | "edge-destination"
  | "start-node"
  | "outgoing-edge"
  | "cycle"
  | "end-node"
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
 * Chạy 7 luật trên `recipe`. Trả `null` nếu sạch, hoặc vi phạm ĐẦU TIÊN tìm thấy.
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

  // Luật 2 — mọi edge phải trỏ tới node có thật (cả 2 đầu). Đứng trước start-node/outgoing-edge/
  // cycle/end-node để các luật đó không bao giờ phải đoán khi gặp `from`/`to` trỏ tới node không
  // tồn tại — y hệt lý do `validator.py` xếp luật này ngay sau node-type.
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

  // Luật 3 (kit#87, D12) — đúng 1 start node (node không có incoming edge). 0 ứng viên (đồ thị
  // khép kín hoàn toàn) hoặc >1 ứng viên (nhiều nhánh rời nhau) đều nghĩa là interpreter không có
  // 1 điểm bắt đầu xác định để đi. Mirror `studio_engine.interpreter._find_start_node_id`, chuyển
  // lên đây để 1 recipe hỏng ở luật này không bao giờ chạm tới interpreter.
  const edgeTargets = new Set(edges.map((edge) => edge.to));
  const startIds = nodes.map((node) => node.id).filter((id) => !edgeTargets.has(id));
  if (startIds.length !== 1) {
    return {
      rule: "start-node",
      nodeId: startIds[0],
      message:
        `DAG phải có đúng 1 start node (không có incoming edge), tìm thấy ${startIds.length}` +
        `${startIds.length > 0 ? `: [${startIds.join(", ")}]` : ""}.`,
    };
  }
  const startId = startIds[0];

  // Luật 4 (kit#87, D12 — TẠM THỜI, gắn với tiến độ `ConditionExecutor` của AIE-1, Day-14/kit#97
  // là chính "seam" này) — mỗi node ≤ 1 outgoing edge. Interpreter CHƯA đánh giá được nhánh
  // `condition` (`Edge.when`), nên 1 node có >1 outgoing edge (rẽ nhánh condition thật) sẽ đưa 1
  // recipe có nhánh không đi được tới interpreter. Chặn MỌI recipe có rẽ nhánh condition thật —
  // kể cả recipe hợp lệ về cấu trúc — tới khi `ConditionExecutor` xong; AIE-1 là người quyết định
  // khi nào nới luật này ra, canvas không tự ý nới. `nextById` xây ở đây được luật 6 dùng lại.
  const nextById = new Map<string, string>();
  for (const edge of edges) {
    if (nextById.has(edge.from)) {
      return {
        rule: "outgoing-edge",
        nodeId: edge.from,
        message:
          `Node "${edge.from}" có >1 outgoing edge — rẽ nhánh condition chưa được interpreter ` +
          "đánh giá (ConditionExecutor chưa xong).",
      };
    }
    nextById.set(edge.from, edge.to);
  }

  // Luật 5 — không chu trình. DFS 3 màu, y hệt bản Python.
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

  // Luật 6 (kit#87, D12) — đi bộ từ `startId` theo đúng 1 outgoing edge mỗi bước (luật 3 đảm bảo
  // tồn tại và duy nhất điểm bắt đầu, luật 4 đảm bảo ≤1 bước kế tiếp mỗi node, luật 5 đảm bảo
  // không vòng lặp — nên đây là 1 chuỗi đơn, xác định, an toàn để đi bộ mà không cần đoán). Chuỗi
  // phải KẾT ở 1 node type `end`; hết cạnh trước khi chạm `end` bị chặn, không âm thầm cho qua.
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  let walkId = startId;
  while (nodesById.get(walkId)!.type !== ("end" satisfies NodeType)) {
    const next = nextById.get(walkId);
    if (next === undefined) {
      return {
        rule: "end-node",
        nodeId: walkId,
        message: `DAG đi tới node "${walkId}" (hết outgoing edge) mà chưa chạm node "end".`,
      };
    }
    walkId = next;
  }

  // Luật 7 — tool của mọi node `tool-call` phải nằm trong `agent_config.tool_whitelist`.
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
 * Cảnh báo NGOÀI 7 luật — những thứ `graph_lint()` Python KHÔNG chặn nhưng người dùng nên biết.
 *
 * Cố ý tách khỏi `graphLint()`: thêm 1 luật nữa vào bản mirror sẽ làm nó chặt hơn cổng Python,
 * nghĩa là canvas từ chối những recipe mà hệ thống thật vẫn nhận — mirror hết còn là mirror.
 * Những mục dưới đây hiện màu vàng (cảnh báo), không chặn export.
 */
export function advisories(recipe: WireRecipe): string[] {
  const notes: string[] = [];
  const { nodes, edges } = recipe.dag;

  if (nodes.length === 0) {
    // D14: không còn nói "graph_lint vẫn cho qua" — từ D12, canvas rỗng có 0 start-node candidate
    // nên `graphLint()` (luật 3) đã từ chối nó, y hệt Python. Câu cũ sai kể từ khi luật 3 tồn tại.
    notes.push("Canvas trống — recipe không có node nào.");
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

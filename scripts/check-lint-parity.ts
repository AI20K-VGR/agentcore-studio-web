/**
 * Kiểm tra bản lint TS có ra CÙNG phán quyết với `graph_lint()` Python hay không.
 *
 *     pnpm check-parity
 *
 * ## Vì sao cần
 * `src/recipe/graphLint.ts` là bản chép 7 luật sang TS. Hai bản viết 2 lần bằng 2 ngôn ngữ thì
 * lệch nhau lúc nào không biết. `packages/workbench/tests/test_wiring_d12.py` khoá được HÌNH DẠNG
 * output của canvas, nhưng KHÔNG khoá được việc bản TS có phán quyết giống bản Python —
 * nó không chạy code TS. Khoảng trống đó là chỗ script này đứng.
 *
 * ## Cách khoá
 * 9 case: 5 case gốc từ `test_wiring_d12.py` (1 happy + 4 luật D11), cộng D14 (kit#97) 4 case
 * mirror `packages/workbench/tests/test_graph_lint.py::test_lint_rejects_{zero,multiple}
 * _start_nodes / _more_than_one_outgoing_edge / _walk_not_ending_at_end_node` — 3 luật D12/kit#87
 * mà bản TS còn thiếu tới trước D14. Mỗi case sửa y hệt trên cùng 1 baseline (`sampleGraph()`),
 * cô lập đúng 1 luật, và đối chiếu: Python raise ở case nào thì TS phải trả vi phạm ở case đó,
 * đúng luật đó. Sửa 1 luật ở 1 bản mà quên bản kia = script này đỏ.
 *
 * Không dùng test framework: `apps/web` chưa có runner nào (không vitest, không jest), và kéo cả
 * 1 runner về chỉ cho vài chục assertion là cái giá không đáng — thêm runner là quyết định riêng,
 * không phải thứ nhét kèm vào issue canvas.
 */

import type { WireRecipe } from "../src/recipe/contract.ts";
import { buildRecipe } from "../src/recipe/fromCanvas.ts";
import { graphLint, type LintRule } from "../src/recipe/graphLint.ts";
import { DEFAULT_HEADER, sampleGraph } from "../src/recipe/sample.ts";

function baseline(): WireRecipe {
  const { nodes, edges } = sampleGraph();
  // Qua JSON để mỗi case có bản sao độc lập — case này sửa không được ảnh hưởng case kia.
  return JSON.parse(JSON.stringify(buildRecipe(DEFAULT_HEADER, nodes, edges))) as WireRecipe;
}

/** `expect === null` nghĩa là Python KHÔNG raise ở case đó. */
const CASES: Array<{
  name: string;
  pythonTest: string;
  mutate: (recipe: WireRecipe) => void;
  expect: LintRule | null;
}> = [
  {
    name: "happy — canvas export sạch",
    pythonTest: "test_canvas_export_passes_contract_and_lint",
    mutate: () => {},
    expect: null,
  },
  {
    name: "luật 1 — node ngoài 6 loại",
    pythonTest: "test_rule_1_node_outside_closed_six_is_rejected",
    mutate: (recipe) => {
      recipe.dag.nodes[0].type = "not-a-real-type" as WireRecipe["dag"]["nodes"][number]["type"];
    },
    expect: "node-type",
  },
  {
    name: "luật 2 — chu trình n4 -> n2",
    pythonTest: "test_rule_2_cycle_is_rejected",
    // D12 (kit#87): nối `n4 -> n1` sẽ khép TOÀN BỘ đồ thị vòng kín (0 start-node candidate) —
    // Python giờ có luật "đúng 1 start node" (graph_lint rule 3) nên sẽ báo "start node" trước
    // khi kịp chạy tới luật cycle. Nối về `n2` thay vì `n1` giữ n1 là start-node duy nhất, cô
    // lập case này đúng vào luật cycle như tên case mô tả. Xem test_wiring_d12.py cùng thay đổi.
    mutate: (recipe) => {
      recipe.dag.edges.push({ from: "n4", to: "n2", when: null });
    },
    expect: "cycle",
  },
  {
    name: "luật 3 — cạnh treo",
    pythonTest: "test_rule_3_dangling_edge_is_rejected",
    mutate: (recipe) => {
      recipe.dag.edges[recipe.dag.edges.length - 1].to = "node-khong-ton-tai";
    },
    expect: "edge-destination",
  },
  {
    name: "luật 4 — tool ngoài whitelist",
    pythonTest: "test_rule_4_tool_outside_whitelist_is_rejected",
    mutate: (recipe) => {
      recipe.dag.nodes.splice(1, 0, {
        id: "n3",
        type: "tool-call",
        params: { tool: "tool_ngoai_whitelist" },
      });
      recipe.dag.edges = [
        { from: "n1", to: "n3", when: null },
        { from: "n3", to: "n2", when: null },
        { from: "n2", to: "n4", when: null },
      ];
    },
    expect: "tool-whitelist",
  },
  {
    name: "D14/kit#97 — 0 start node (nối n4 -> n1, khép kín toàn bộ)",
    pythonTest: "test_lint_rejects_zero_start_nodes",
    // sampleGraph(): n1 -> n2 -> n3 -> n4. Nối thêm n4 -> n1 khiến CẢ 4 node đều có incoming edge
    // — 0 start-node candidate. Rule start-node (Python rule 3) chạy trước rule cycle (rule 5)
    // nên case này báo "start-node", không phải "cycle", dù đồ thị giờ cũng có vòng lặp.
    mutate: (recipe) => {
      recipe.dag.edges.push({ from: "n4", to: "n1", when: null });
    },
    expect: "start-node",
  },
  {
    name: "D14/kit#97 — 2 start node (thêm n5 cô lập, không cạnh nào nối tới)",
    pythonTest: "test_lint_rejects_multiple_start_nodes",
    // n1 (gốc, không incoming) + n5 mới (không nối cạnh nào) = 2 candidate không incoming edge.
    mutate: (recipe) => {
      recipe.dag.nodes.push({ id: "n5", type: "end", params: {} });
    },
    expect: "start-node",
  },
  {
    name: "D14/kit#97 — condition seam: node có >1 outgoing edge",
    pythonTest: "test_lint_rejects_more_than_one_outgoing_edge",
    // Thêm cạnh thứ 2 xuất phát từ n1 (đã có sẵn n1 -> n2). Đây CHÍNH LÀ luật mà seam
    // condition/tool-call của Day 14 xoay quanh: interpreter chưa đánh giá được `Edge.when`
    // nên 1 node rẽ >1 nhánh (kể cả node không phải type `condition` — rule 4 Python không xét
    // node.type, chỉ đếm outgoing edge) phải bị chặn ở graph-lint trước khi tới AIE-1's executor.
    mutate: (recipe) => {
      recipe.dag.edges.push({ from: "n1", to: "n4", when: null });
    },
    expect: "outgoing-edge",
  },
  {
    name: "D14/kit#97 — walk không kết ở node end",
    pythonTest: "test_lint_rejects_walk_not_ending_at_end_node",
    // Đổi type của n4 (node cuối chuỗi, vốn là "end") sang "llm-step". Chuỗi n1->n2->n3->n4 vẫn
    // đúng 1 start, ≤1 outgoing edge mỗi node, không vòng lặp — nhưng hết cạnh ở n4 mà n4 không
    // còn là `end`, nên rule 6 (walk phải kết ở end) là luật DUY NHẤT bắt được case này.
    mutate: (recipe) => {
      const n4 = recipe.dag.nodes.find((candidate) => candidate.id === "n4")!;
      n4.type = "llm-step" as WireRecipe["dag"]["nodes"][number]["type"];
    },
    expect: "end-node",
  },
];

let failed = 0;

for (const testCase of CASES) {
  const recipe = baseline();
  testCase.mutate(recipe);
  const actual = graphLint(recipe);
  const actualRule = actual?.rule ?? null;

  if (actualRule === testCase.expect) {
    console.log(`  ✓ ${testCase.name} → ${actualRule ?? "sạch"}`);
  } else {
    failed += 1;
    console.error(
      `  ✗ ${testCase.name}\n` +
        `      Python (${testCase.pythonTest}) mong đợi: ${testCase.expect ?? "sạch"}\n` +
        `      graphLint.ts trả về:                      ${actualRule ?? "sạch"}`,
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${CASES.length} case LỆCH giữa graphLint.ts và graph_lint() Python.`);
  process.exit(1);
}

console.log(`\n${CASES.length}/${CASES.length} case khớp với test_wiring_d12.py + test_graph_lint.py.`);

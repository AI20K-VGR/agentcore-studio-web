/**
 * Kiểm tra bản lint TS có ra CÙNG phán quyết với `graph_lint()` Python hay không.
 *
 *     pnpm check-parity
 *
 * ## Vì sao cần
 * `src/recipe/graphLint.ts` là bản chép 4 luật sang TS. Hai bản viết 2 lần bằng 2 ngôn ngữ thì
 * lệch nhau lúc nào không biết. `packages/workbench/tests/test_wiring_d12.py` khoá được HÌNH DẠNG
 * output của canvas, nhưng KHÔNG khoá được việc bản TS có phán quyết giống bản Python —
 * nó không chạy code TS. Khoảng trống đó là chỗ script này đứng.
 *
 * ## Cách khoá
 * Đúng 5 case trong `test_wiring_d12.py` (1 happy + 4 luật), sửa y hệt trên cùng 1 fixture, và
 * đối chiếu: Python raise ở case nào thì TS phải trả vi phạm ở case đó, đúng luật đó. Sửa 1 luật
 * ở 1 bản mà quên bản kia = script này đỏ.
 *
 * Không dùng test framework: `apps/web` chưa có runner nào (không vitest, không jest), và kéo cả
 * 1 runner về chỉ cho 5 assertion là cái giá không đáng — thêm runner là quyết định riêng, không
 * phải thứ nhét kèm vào issue canvas.
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
      const node = recipe.dag.nodes.find((candidate) => candidate.type === "tool-call")!;
      node.params.tool = "tool_ngoai_whitelist";
    },
    expect: "tool-whitelist",
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

console.log(`\n${CASES.length}/${CASES.length} case khớp với test_wiring_d12.py.`);

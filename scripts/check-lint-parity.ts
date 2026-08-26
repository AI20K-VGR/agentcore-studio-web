/**
 * Kiểm tra `agentShapeLint`/`agentTopologyLint` TS có ra CÙNG phán quyết với
 * `agent_shape_lint`/`agent_topology_lint` Python hay không (workbench#48, web#34).
 *
 *     pnpm check-parity
 *
 * ## Vì sao cần
 * `src/recipe/graphLint.ts` là bản chép 2 lint sang TS. Hai bản viết 2 lần bằng 2 ngôn ngữ thì lệch
 * nhau lúc nào không biết — không có test nào khác thực sự CHẠY code TS này (khác test hình dạng
 * output của canvas). Khoảng trống đó là chỗ script này đứng.
 *
 * ## Cách khoá
 * Mirror 1-1 MỌI test function của `packages/workbench/tests/test_agent_shape_lint.py` +
 * `test_agent_topology_lint.py` (đọc trực tiếp lúc viết script này, workbench@9b23520): mỗi case
 * TS build 1 `WireRecipe` fixture NGAY TẠI CHỖ (không qua `buildRecipe()`/`sampleGraph()` — tách
 * hẳn khỏi code canvas/UI, giống cách 2 file test Python tự dựng fixture bằng helper cục bộ
 * `_valid_recipe()`/`_recipe()`+`_star_dag()`), chạy đúng hàm lint TS tương ứng, đối chiếu:
 * - Case rule-FAIL: Python raise ở rule nào (`assert_finding_status(..., "FAIL")`) thì TS phải có
 *   đúng 1 finding `FAIL` ở rule đó (không quan tâm finding khác OK/FAIL thế nào — Python test cũng
 *   chỉ assert đúng 1 rule).
 * - Case happy: Python mọi finding `OK` thì TS cũng phải mọi finding `OK`.
 * - Case raise: Python `enforce_*` raise `ValueError` với message bắt đầu bằng 1 chuỗi cho trước
 *   thì `enforceAgentShape`/`enforceAgentTopology` TS phải throw với message bắt đầu ĐÚNG chuỗi đó.
 *
 * Không dùng test framework LÚC VIẾT SCRIPT NÀY (web#18 sau đó thêm Vitest cho mục đích khác) —
 * `apps/web` khi bản gốc D14/kit#97 viết script này chưa có runner nào; Vitest giờ có sẵn trong
 * repo nhưng script này CHƯA di dời sang đó — việc chuyển hẳn sang `*.test.ts` là dọn dẹp riêng,
 * chưa làm ở đây.
 */

import {
  agentShapeLint,
  agentTopologyLint,
  enforceAgentShape,
  enforceAgentTopology,
} from "../src/recipe/graphLint.ts";
import type { WireEdge, WireNode, WireRecipe } from "../src/recipe/contract.ts";
import { ANKOR_ID } from "../src/recipe/contract.ts";

// ---------------------------------------------------------------------------
// Fixtures — mirror `_valid_recipe()` (test_agent_shape_lint.py) và `_recipe()`/`_star_dag()`
// (test_agent_topology_lint.py).
// ---------------------------------------------------------------------------

function minimalDag(): WireRecipe["dag"] {
  return { nodes: [{ id: "llm-1", type: "llm-step", params: {} }], edges: [] };
}

function validShapeRecipe(overrides: Partial<WireRecipe> = {}): WireRecipe {
  return {
    agent_id: "agent-1",
    tenant_id: ANKOR_ID,
    agent_config: { system_prompt: "Answer from KB only.", model: "gpt-4o-mini", tool_whitelist: ["calculator"], temperature: 0.7 },
    dag: minimalDag(),
    kb_binding: { kb_id: "kb-1", scope: "ankor/public" },
    golden_set_ref: "golden-set-1",
    scorecard_threshold: { success: 0.9, citation_accuracy: 0.95 },
    ...overrides,
  };
}

function topologyRecipe(dag: { nodes: WireNode[]; edges: WireEdge[] }): WireRecipe {
  return {
    agent_id: "agent-1",
    tenant_id: ANKOR_ID,
    agent_config: {
      system_prompt: "hi",
      model: "m",
      tool_whitelist: ["calculator", "current_datetime"],
      temperature: 0.7,
    },
    dag,
    kb_binding: { kb_id: "kb-1", scope: "ankor/public" },
    golden_set_ref: "golden-set-1",
    scorecard_threshold: { success: 0.9, citation_accuracy: 0.95 },
  };
}

function starDag(): { nodes: WireNode[]; edges: WireEdge[] } {
  return {
    nodes: [
      { id: "llm-1", type: "llm-step", params: {} },
      { id: "kb-1", type: "kb-retrieve", params: {} },
      { id: "tool-1", type: "tool-call", params: { tool: "calculator" } },
      { id: "tool-2", type: "tool-call", params: { tool: "current_datetime" } },
    ],
    edges: [
      { from: "kb-1", to: "llm-1", when: null },
      { from: "tool-1", to: "llm-1", when: null },
      { from: "llm-1", to: "tool-2", when: null }, // cạnh chiều ngược lại vẫn hợp lệ (không ép chiều)
    ],
  };
}

// ---------------------------------------------------------------------------
// Case tables
// ---------------------------------------------------------------------------

type FindingsFn = (recipe: WireRecipe) => { rule: string; status: "OK" | "FAIL" }[];

interface RuleCase {
  name: string;
  pythonTest: string;
  lint: FindingsFn;
  recipe: WireRecipe;
  /** `null` = mọi finding phải OK (happy path). Chuỗi = rule đó phải FAIL. */
  expect: string | null;
}

const SHAPE_CASES: RuleCase[] = [
  { name: "happy — recipe hợp lệ", pythonTest: "test_valid_recipe_passes_every_rule", lint: agentShapeLint, recipe: validShapeRecipe(), expect: null },
  {
    name: "agent_id rỗng",
    pythonTest: "test_agent_id_blank_fails",
    lint: agentShapeLint,
    recipe: validShapeRecipe({ agent_id: "   " }),
    expect: "agent_id.non_blank",
  },
  // web#48 — case "system_prompt rỗng" (`test_system_prompt_blank_fails`) đã xoá cùng luật
  // `agent_config.system_prompt_non_blank` (mirror `agent_shape_lint` Python, workbench#55).
  {
    name: "model rỗng",
    pythonTest: "test_model_blank_fails",
    lint: agentShapeLint,
    recipe: validShapeRecipe({ agent_config: { system_prompt: "hi", model: "  ", tool_whitelist: ["calculator"], temperature: 0.7 } }),
    expect: "agent_config.model_non_blank",
  },
  {
    name: "tool_whitelist có vị trí rỗng",
    pythonTest: "test_tool_whitelist_blank_entry_fails",
    lint: agentShapeLint,
    recipe: validShapeRecipe({ agent_config: { system_prompt: "hi", model: "m", tool_whitelist: ["calculator", "  "], temperature: 0.7 } }),
    expect: "tool_whitelist.no_blank_entries",
  },
  {
    name: "tool_whitelist trùng",
    pythonTest: "test_tool_whitelist_duplicate_fails",
    lint: agentShapeLint,
    recipe: validShapeRecipe({
      agent_config: { system_prompt: "hi", model: "m", tool_whitelist: ["calculator", "calculator"], temperature: 0.7 },
    }),
    expect: "tool_whitelist.no_duplicates",
  },
  {
    name: "tool_whitelist chứa kb_search",
    pythonTest: "test_tool_whitelist_kb_search_fails",
    lint: agentShapeLint,
    recipe: validShapeRecipe({ agent_config: { system_prompt: "hi", model: "m", tool_whitelist: ["kb_search"], temperature: 0.7 } }),
    expect: "tool_whitelist.no_kb_search",
  },
  {
    name: "kb_binding.kb_id rỗng",
    pythonTest: "test_kb_id_blank_fails",
    lint: agentShapeLint,
    recipe: validShapeRecipe({ kb_binding: { kb_id: "  ", scope: "ankor/public" } }),
    expect: "kb_binding.kb_id_non_blank",
  },
  {
    name: "kb_binding.scope rỗng",
    pythonTest: "test_kb_scope_blank_fails",
    lint: agentShapeLint,
    recipe: validShapeRecipe({ kb_binding: { kb_id: "kb-1", scope: "  " } }),
    expect: "kb_binding.scope_non_blank",
  },
  {
    name: "golden_set_ref rỗng",
    pythonTest: "test_golden_set_ref_blank_fails",
    lint: agentShapeLint,
    recipe: validShapeRecipe({ golden_set_ref: "  " }),
    expect: "golden_set_ref.non_blank",
  },
];

const TOPOLOGY_CASES: RuleCase[] = [
  { name: "happy — dag hình sao hợp lệ", pythonTest: "test_valid_star_dag_passes_every_rule", lint: agentTopologyLint, recipe: topologyRecipe(starDag()), expect: null },
  {
    name: "node id trùng",
    pythonTest: "test_duplicate_node_id_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({
      nodes: [
        { id: "llm-1", type: "llm-step", params: {} },
        { id: "llm-1", type: "tool-call", params: { tool: "calculator" } },
      ],
      edges: [],
    }),
    expect: "dag.no_duplicate_node_ids",
  },
  {
    name: "node type không cho phép (end)",
    pythonTest: "test_disallowed_node_type_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({
      nodes: [
        { id: "llm-1", type: "llm-step", params: {} },
        { id: "end-1", type: "end", params: {} },
      ],
      edges: [{ from: "llm-1", to: "end-1", when: null }],
    }),
    expect: "dag.only_llm_kb_tool_node_types",
  },
  {
    name: "0 node llm-step",
    pythonTest: "test_zero_llm_nodes_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({ nodes: [{ id: "tool-1", type: "tool-call", params: { tool: "calculator" } }], edges: [] }),
    expect: "dag.exactly_one_llm_node",
  },
  {
    name: "2 node llm-step",
    pythonTest: "test_two_llm_nodes_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({
      nodes: [
        { id: "llm-1", type: "llm-step", params: {} },
        { id: "llm-2", type: "llm-step", params: {} },
      ],
      edges: [],
    }),
    expect: "dag.exactly_one_llm_node",
  },
  {
    name: "2 node kb-retrieve",
    pythonTest: "test_two_kb_retrieve_nodes_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({
      nodes: [
        { id: "llm-1", type: "llm-step", params: {} },
        { id: "kb-1", type: "kb-retrieve", params: {} },
        { id: "kb-2", type: "kb-retrieve", params: {} },
      ],
      edges: [
        { from: "kb-1", to: "llm-1", when: null },
        { from: "kb-2", to: "llm-1", when: null },
      ],
    }),
    expect: "dag.at_most_one_kb_retrieve_node",
  },
  {
    name: "kb-retrieve không nối tới llm",
    pythonTest: "test_kb_retrieve_not_connected_to_llm_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({
      nodes: [
        { id: "llm-1", type: "llm-step", params: {} },
        { id: "kb-1", type: "kb-retrieve", params: {} },
      ],
      edges: [],
    }),
    expect: "dag.kb_retrieve_connects_to_llm",
  },
  {
    name: "tool-call không nối tới llm",
    pythonTest: "test_tool_call_not_connected_to_llm_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({
      nodes: [
        { id: "llm-1", type: "llm-step", params: {} },
        { id: "tool-1", type: "tool-call", params: { tool: "calculator" } },
      ],
      edges: [],
    }),
    expect: "dag.tool_call_connects_to_llm",
  },
  {
    name: "tool-call thiếu params.tool",
    pythonTest: "test_tool_call_blank_tool_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({
      nodes: [
        { id: "llm-1", type: "llm-step", params: {} },
        { id: "tool-1", type: "tool-call", params: {} },
      ],
      edges: [{ from: "tool-1", to: "llm-1", when: null }],
    }),
    expect: "dag.tool_call_has_non_blank_tool",
  },
  {
    name: "tool-call trùng tên tool",
    pythonTest: "test_tool_call_duplicate_tool_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({
      nodes: [
        { id: "llm-1", type: "llm-step", params: {} },
        { id: "tool-1", type: "tool-call", params: { tool: "calculator" } },
        { id: "tool-2", type: "tool-call", params: { tool: "calculator" } },
      ],
      edges: [
        { from: "tool-1", to: "llm-1", when: null },
        { from: "tool-2", to: "llm-1", when: null },
      ],
    }),
    expect: "dag.tool_call_no_duplicate_tools",
  },
  {
    name: "cạnh giữa 2 node tool-call",
    pythonTest: "test_edge_between_two_tool_call_nodes_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({
      nodes: [
        { id: "llm-1", type: "llm-step", params: {} },
        { id: "tool-1", type: "tool-call", params: { tool: "calculator" } },
        { id: "tool-2", type: "tool-call", params: { tool: "current_datetime" } },
      ],
      edges: [
        { from: "tool-1", to: "llm-1", when: null },
        { from: "tool-2", to: "llm-1", when: null },
        { from: "tool-1", to: "tool-2", when: null },
      ],
    }),
    expect: "dag.edges_are_llm_hub_spokes_only",
  },
  {
    name: "cạnh trỏ tới node không tồn tại",
    pythonTest: "test_edge_to_nonexistent_node_fails",
    lint: agentTopologyLint,
    recipe: topologyRecipe({ nodes: [{ id: "llm-1", type: "llm-step", params: {} }], edges: [{ from: "llm-1", to: "ghost", when: null }] }),
    expect: "dag.edges_are_llm_hub_spokes_only",
  },
];

interface RaiseCase {
  name: string;
  pythonTest: string;
  enforce: () => void;
  expectMessagePrefix: string;
}

const RAISE_CASES: RaiseCase[] = [
  {
    name: "enforceAgentShape raise ở FAIL đầu tiên",
    pythonTest: "test_enforce_agent_shape_raises_on_first_failure",
    enforce: () => enforceAgentShape(validShapeRecipe({ agent_id: "" })),
    expectMessagePrefix: "agent_shape_lint: agent_id.non_blank",
  },
  {
    name: "enforceAgentTopology raise ở FAIL đầu tiên",
    pythonTest: "test_enforce_agent_topology_raises_on_first_failure",
    enforce: () => enforceAgentTopology(topologyRecipe({ nodes: [], edges: [] })),
    expectMessagePrefix: "agent_topology_lint: dag.exactly_one_llm_node",
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let failed = 0;
let total = 0;

function runRuleCases(label: string, cases: RuleCase[]): void {
  for (const testCase of cases) {
    total += 1;
    const findings = testCase.lint(testCase.recipe);
    const failing = findings.filter((f) => f.status === "FAIL").map((f) => f.rule);
    const ok =
      testCase.expect === null ? failing.length === 0 : failing.includes(testCase.expect);

    if (ok) {
      console.log(`  ✓ [${label}] ${testCase.name} → ${testCase.expect ?? "sạch"}`);
    } else {
      failed += 1;
      console.error(
        `  ✗ [${label}] ${testCase.name}\n` +
          `      Python (${testCase.pythonTest}) mong đợi: ${testCase.expect ?? "mọi finding OK"}\n` +
          `      TS trả FAIL ở:                             [${failing.join(", ")}]`,
      );
    }
  }
}

function runRaiseCases(): void {
  for (const testCase of RAISE_CASES) {
    total += 1;
    let message: string | null = null;
    try {
      testCase.enforce();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    if (message !== null && message.startsWith(testCase.expectMessagePrefix)) {
      console.log(`  ✓ [raise] ${testCase.name}`);
    } else {
      failed += 1;
      console.error(
        `  ✗ [raise] ${testCase.name}\n` +
          `      Python (${testCase.pythonTest}) mong đợi message bắt đầu: ${testCase.expectMessagePrefix}\n` +
          `      TS throw:                                                ${message ?? "(không throw)"}`,
      );
    }
  }
}

runRuleCases("shape", SHAPE_CASES);
runRuleCases("topology", TOPOLOGY_CASES);
runRaiseCases();

if (failed > 0) {
  console.error(`\n${failed}/${total} case LỆCH giữa graphLint.ts và validator.py (Python).`);
  process.exit(1);
}

console.log(`\n${total}/${total} case khớp với test_agent_shape_lint.py + test_agent_topology_lint.py.`);

/**
 * agent-lint phía client — BẢN SAO của `studio_workbench.validator.agent_shape_lint` +
 * `agent_topology_lint` (workbench#48, web#34).
 *
 * ## workbench#48 — `graph_lint()` bị xoá hẳn, thay bằng 2 lint độc lập
 * `graph_lint()` (7-luật `recipe.dag` cũ D11/D12) tồn tại để gate `interpreter.run()`'s DAG-walk —
 * gate đó không còn ý nghĩa (không route sản xuất nào còn gọi `interpreter.run()`, cả `/chat` lẫn
 * eval-gate harness đều đi qua `run_agent_loop()`, hàm không đọc `recipe.dag`). Thay bằng:
 *
 * 1. `agentShapeLint(recipe)` — shape `agent_config`/`kb_binding`/`golden_set_ref`/`agent_id`,
 *    KHÔNG đọc `recipe.dag`.
 * 2. `agentTopologyLint(recipe)` — hình sao MỚI cho `recipe.dag`: đúng 1 node `llm-step` làm tâm,
 *    0-1 `kb-retrieve` + 0..N `tool-call` làm cánh, mỗi cánh nối trực tiếp LLM. KHÔNG còn node
 *    `end`/`condition`/`hitl-pause` trong `dag` (kit#206 — không có "tool hub", không thêm
 *    `NodeType` thứ 7, `run_agent_loop()` chọn tool lúc chạy qua `tool_whitelist`, không đọc cạnh
 *    DAG). Không còn luật cycle (hình sao không thể có chu trình), không còn luật "walk phải kết ở
 *    `end`" (không còn node `end` để kết).
 *
 * Cả 2 hàm trả **MỌI** finding trong 1 lần (`Finding[]`, giữ nguyên shape phẳng
 * `{rule, status, detail}` mà Python dùng — không raise-on-first), khác hẳn `graphLint()` cũ (trả
 * đúng 1 vi phạm ĐẦU TIÊN hoặc `null`). `enforceAgentShape`/`enforceAgentTopology` là bản raise trên
 * FAIL đầu tiên, mirror `enforce_agent_shape`/`enforce_agent_topology` phía Python.
 *
 * ## Đây KHÔNG phải cổng chặn
 * Cổng thật vẫn là `agent_shape_lint`/`agent_topology_lint` Python, chạy server-side
 * (`canvas.py`/`publish.py`) trước khi recipe được lưu. Bản TS này chỉ để người dùng thấy lỗi NGAY
 * trên canvas thay vì sau 1 vòng round-trip. Client nói "hợp lệ" không cho phép bỏ qua cổng
 * Python; client nói "hỏng" thì UI chặn luôn nút export (fail-closed) — sai lệch giữa 2 bản, nếu
 * có, luôn nghiêng về phía chặn.
 *
 * ## Drift là rủi ro đã biết, và được kìm bằng test
 * 2 bản cùng luật viết 2 lần bằng 2 ngôn ngữ = có thể lệch nhau. Kìm bằng
 * `apps/web/scripts/check-lint-parity.ts` (`pnpm check-parity`) — chạy CHÍNH 2 hàm này trên cùng
 * các case mà `packages/workbench/tests/test_agent_shape_lint.py` +
 * `test_agent_topology_lint.py` dùng, đối chiếu phán quyết từng luật.
 */

import type { NodeType, WireRecipe } from "./contract";

/** Mirror `dict[str, str]` phía Python — mỗi luật trả đúng 1 finding, `detail` rỗng khi `OK`. */
export interface Finding {
  rule: string;
  status: "OK" | "FAIL";
  detail: string;
}

/** Subset `NodeType` được phép xuất hiện trong `recipe.dag` sau workbench#48 — mirror
 * `_ALLOWED_TOPOLOGY_TYPES` phía Python. Hẹp hơn `NODE_TYPES` (đóng 6 loại ở tầng contract):
 * `condition`/`hitl-pause`/`end` vẫn là `NodeType` hợp lệ ở tầng contract, chỉ không còn được phép
 * *trong DAG* nữa. */
const ALLOWED_TOPOLOGY_TYPES = new Set<NodeType>(["llm-step", "kb-retrieve", "tool-call"]);

function finding(rule: string, ok: boolean, detail: () => string): Finding {
  return { rule, status: ok ? "OK" : "FAIL", detail: ok ? "" : detail() };
}

/** First-seen-order các giá trị lặp lại trong `items` — dùng chung cho mọi luật "không trùng X",
 * mirror `_find_duplicates` phía Python. */
function findDuplicates(items: Iterable<string>): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const item of items) {
    if (seen.has(item) && !dupes.includes(item)) dupes.push(item);
    seen.add(item);
  }
  return dupes;
}

/**
 * Kiểm tra shape "1 LLM + N tool" — KHÔNG đọc `recipe.dag`. Mirror `agent_shape_lint` phía Python,
 * đúng thứ tự 9 luật, trả MỌI finding bất kể có bao nhiêu FAIL.
 */
export function agentShapeLint(recipe: WireRecipe): Finding[] {
  const findings: Finding[] = [];

  findings.push(finding("agent_id.non_blank", recipe.agent_id.trim().length > 0, () => "agent_id rỗng hoặc chỉ có khoảng trắng"));

  // web#48 — `system_prompt` không còn field cấu hình được ở frontend nữa, luôn gửi rỗng.
  // `packages/engine` đã coi rỗng là case hợp lệ, an toàn từ trước — bỏ luật "không được rỗng"
  // này thay vì nới lỏng tạm thời. Mirror: `packages/workbench/src/studio_workbench/validator.py`
  // (workbench#55).
  findings.push(
    finding("agent_config.model_non_blank", recipe.agent_config.model.trim().length > 0, () => "model rỗng hoặc chỉ có khoảng trắng"),
  );

  const whitelist = recipe.agent_config.tool_whitelist;

  const blanks = whitelist.map((tool, i) => [i, tool] as const).filter(([, tool]) => tool.trim().length === 0).map(([i]) => i);
  findings.push(finding("tool_whitelist.no_blank_entries", blanks.length === 0, () => `vị trí rỗng: [${blanks.join(", ")}]`));

  const toolDupes = findDuplicates(whitelist);
  findings.push(finding("tool_whitelist.no_duplicates", toolDupes.length === 0, () => `trùng: [${[...toolDupes].sort().join(", ")}]`));

  // engine#49 — đảo A4: `kb_search` giờ là 1 phần tử BÌNH THƯỜNG của `tool_whitelist`, cùng cấp
  // `calculator`/`current_datetime` (đúng `PROJECT-SCOPE-DEMO-DAY30.md`), không còn rule cấm khai
  // nó ở đây. Rule `tool_whitelist.no_kb_search` (mirror `validator.py`) đã bị XOÁ — `deriveToolWhitelist()`
  // (`fromCanvas.ts`) giờ đưa `kb_search` vào whitelist khi canvas có node `kb-retrieve`, giống hệt
  // cách nó suy `calculator`/`current_datetime` từ node `tool-call`.

  findings.push(
    finding("kb_binding.kb_id_non_blank", recipe.kb_binding.kb_id.trim().length > 0, () => "kb_binding.kb_id rỗng hoặc chỉ có khoảng trắng"),
  );
  findings.push(
    finding(
      "kb_binding.scope_non_blank",
      recipe.kb_binding.scope.trim().length > 0,
      () => "kb_binding.scope rỗng hoặc chỉ có khoảng trắng",
    ),
  );

  findings.push(
    finding("golden_set_ref.non_blank", recipe.golden_set_ref.trim().length > 0, () => "golden_set_ref rỗng hoặc chỉ có khoảng trắng"),
  );

  return findings;
}

function enforce(label: string, findings: Finding[]): void {
  for (const f of findings) {
    if (f.status === "FAIL") {
      throw new Error(`${label}: ${f.rule} — ${f.detail}`);
    }
  }
}

/** Hard gate: throw trên finding FAIL đầu tiên của `agentShapeLint(recipe)`. */
export function enforceAgentShape(recipe: WireRecipe): void {
  enforce("agent_shape_lint", agentShapeLint(recipe));
}

/**
 * Kiểm tra hình sao của `recipe.dag` — KHÔNG đọc `agent_config`/`kb_binding`/... Mirror
 * `agent_topology_lint` phía Python: đúng 1 node `llm-step` ở tâm; 0-1 `kb-retrieve` + 0..N
 * `tool-call` làm cánh, mỗi cánh nối trực tiếp node LLM; không loại node nào khác; không cạnh nào
 * khác hình cánh-tâm. Trả MỌI finding, không raise. Luật cần tham chiếu "node LLM"/"node
 * kb-retrieve" xuống cấp nhẹ nhàng khi node đó không tồn tại (0 hoặc >1 ứng viên) — báo lỗi với
 * `null`, không bao giờ throw runtime nội bộ, vì input hỏng chính là thứ hàm này tồn tại để mô tả.
 */
export function agentTopologyLint(recipe: WireRecipe): Finding[] {
  const findings: Finding[] = [];
  const { nodes, edges } = recipe.dag;
  const validIds = new Set(nodes.map((node) => node.id));

  const dupIds = findDuplicates(nodes.map((node) => node.id));
  findings.push(finding("dag.no_duplicate_node_ids", dupIds.length === 0, () => `trùng id: [${[...dupIds].sort().join(", ")}]`));

  const disallowed = nodes.filter((node) => !ALLOWED_TOPOLOGY_TYPES.has(node.type)).map((node) => node.id);
  findings.push(
    finding(
      "dag.only_llm_kb_tool_node_types",
      disallowed.length === 0,
      () => `node dùng type không cho phép (chỉ llm-step/kb-retrieve/tool-call): [${disallowed.join(", ")}]`,
    ),
  );

  const llmNodes = nodes.filter((node) => node.type === "llm-step");
  findings.push(
    finding(
      "dag.exactly_one_llm_node",
      llmNodes.length === 1,
      () => `cần đúng 1 node llm-step, tìm thấy ${llmNodes.length}: [${llmNodes.map((n) => n.id).join(", ")}]`,
    ),
  );
  const llmId = llmNodes.length === 1 ? llmNodes[0].id : null;

  const kbNodes = nodes.filter((node) => node.type === "kb-retrieve");
  findings.push(
    finding(
      "dag.at_most_one_kb_retrieve_node",
      kbNodes.length <= 1,
      () => `nhiều nhất 1 node kb-retrieve, tìm thấy ${kbNodes.length}: [${kbNodes.map((n) => n.id).join(", ")}]`,
    ),
  );
  const kbId = kbNodes.length === 1 ? kbNodes[0].id : null;

  const toolNodes = nodes.filter((node) => node.type === "tool-call");
  // Mọi node được phép làm "cánh" của hình sao (kb-retrieve + tool-call, KHÔNG gồm chính LLM).
  const spokeIds = new Set([kbId, ...toolNodes.map((n) => n.id)].filter((id): id is string => id !== null));

  // 1 lần duyệt `edges` DUY NHẤT, dùng chung cho cả luật 5/6 (spoke đã khai phải có cạnh tới hub)
  // lẫn luật 9 (mọi cạnh phải là cạnh hub-spoke hợp lệ) — mirror `validator.py` (`/simplify`
  // review Python: trước đó 2 luật tự tính lại "cạnh có chạm hub không" ở 2 nơi tách biệt). Không
  // ép chiều (`from`/`to` đều hợp lệ).
  const llmNeighborIds = new Set<string>();
  const badEdges: string[] = [];
  for (const edge of edges) {
    const resolvable = validIds.has(edge.from) && validIds.has(edge.to);
    const otherEnd = edge.from === llmId ? edge.to : edge.from;
    const touchesLlm = llmId !== null && (edge.from === llmId || edge.to === llmId);
    const isValidSpokeEdge = resolvable && touchesLlm && spokeIds.has(otherEnd);
    if (isValidSpokeEdge) {
      llmNeighborIds.add(otherEnd);
    } else {
      badEdges.push(`${edge.from}->${edge.to}`);
    }
  }

  findings.push(
    finding(
      "dag.kb_retrieve_connects_to_llm",
      kbId === null || llmNeighborIds.has(kbId),
      () => `node kb-retrieve ${JSON.stringify(kbId)} không có cạnh nối trực tiếp với node llm-step`,
    ),
  );

  const unconnectedTools = toolNodes.filter((node) => !llmNeighborIds.has(node.id)).map((node) => node.id);
  findings.push(
    finding(
      "dag.tool_call_connects_to_llm",
      unconnectedTools.length === 0,
      () => `node tool-call không có cạnh nối trực tiếp với node llm-step: [${unconnectedTools.join(", ")}]`,
    ),
  );

  const toolNameByNode = new Map(toolNodes.map((node) => [node.id, node.params["tool"]]));
  const blankToolNodes = [...toolNameByNode.entries()]
    .filter(([, tool]) => typeof tool !== "string" || tool.trim().length === 0)
    .map(([id]) => id);
  findings.push(
    finding(
      "dag.tool_call_has_non_blank_tool",
      blankToolNodes.length === 0,
      () => `node tool-call thiếu/rỗng params['tool']: [${blankToolNodes.join(", ")}]`,
    ),
  );

  const namedTools = [...toolNameByNode.values()].filter(
    (tool): tool is string => typeof tool === "string" && tool.trim().length > 0,
  );
  const dupTools = findDuplicates(namedTools);
  findings.push(finding("dag.tool_call_no_duplicate_tools", dupTools.length === 0, () => `tool trùng lặp: [${[...dupTools].sort().join(", ")}]`));

  findings.push(
    finding(
      "dag.edges_are_llm_hub_spokes_only",
      badEdges.length === 0,
      () => `cạnh không thuộc hình sao (llm-step <-> kb-retrieve/tool-call): [${badEdges.join(", ")}]`,
    ),
  );

  return findings;
}

/** Hard gate: throw trên finding FAIL đầu tiên của `agentTopologyLint(recipe)`. */
export function enforceAgentTopology(recipe: WireRecipe): void {
  enforce("agent_topology_lint", agentTopologyLint(recipe));
}

/**
 * Cảnh báo nhẹ, không chặn export — khác `agentShapeLint`/`agentTopologyLint` (2 lint đó mới là
 * thứ khoá Test/Publish). Giữ text ngắn, không dùng thuật ngữ nội bộ: đây là thứ hiện thẳng cho
 * người dùng cuối đọc trên canvas, không phải log kỹ thuật.
 *
 * Không còn note "tool bật trong whitelist nhưng không node nào gọi" — từ khi
 * `fromCanvas.ts::buildRecipe()` suy `tool_whitelist` TRỰC TIẾP từ node `tool-call` thật trên
 * canvas (`deriveToolWhitelist()`), whitelist = đúng tập tool các node đã khai, không hơn không
 * kém — "tool bật nhưng không node nào gọi" giờ không thể xảy ra được nữa (whitelist chỉ có tool
 * VÌ có node gọi nó), note đó chết theo cấu trúc, không phải bị bỏ vì nhiễu.
 */
export function advisories(recipe: WireRecipe): string[] {
  const notes: string[] = [];
  const { nodes, edges } = recipe.dag;

  if (nodes.length === 0) {
    notes.push("Canvas trống.");
    return notes;
  }

  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  const orphans = nodes.filter((node) => !connected.has(node.id)).map((node) => node.id);
  if (orphans.length > 0 && nodes.length > 1) {
    notes.push(`Node chưa nối cạnh: ${orphans.join(", ")}.`);
  }

  const toolWhitelist = new Set(recipe.agent_config.tool_whitelist);
  const toolCallsOutsideWhitelist = nodes
    .filter((node) => node.type === "tool-call")
    .filter((node) => {
      const tool = node.params["tool"];
      return typeof tool === "string" && tool.trim().length > 0 && !toolWhitelist.has(tool);
    })
    .map((node) => node.id);
  if (toolCallsOutsideWhitelist.length > 0) {
    notes.push(`Tool ngoài whitelist: ${toolCallsOutsideWhitelist.join(", ")}.`);
  }

  return notes;
}

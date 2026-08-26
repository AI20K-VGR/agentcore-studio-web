/**
 * TS mirror của `studio_contracts` — hình dạng DÂY (wire shape) của Recipe (R-SPEC A1#1).
 *
 * Web KHÔNG import contracts Python (README: "không import contracts Python"), nên chỗ này là
 * bản sao chép tay. Nguồn sự thật duy nhất vẫn là
 * `packages/contracts/src/studio_contracts/{nodes,recipe}.py` — file này chỉ được phép ĐI THEO,
 * không bao giờ đi trước. Thêm/bớt 1 NodeType ở đây mà contract Python chưa đổi = drift, và
 * `graph_lint()` phía Python sẽ chặn recipe đó ở cổng publish (fail-closed, đúng chủ đích).
 *
 * F12 — `Edge.from_` (Python) mang `Field(alias="from")`; trên dây field tên là `from`, nên TS
 * dùng thẳng `from` (JS không cấm `from` làm tên property).
 */

/** 6 loại node đóng — bản sao `studio_contracts.nodes.NodeType` (StrEnum). */
export const NODE_TYPES = [
  "kb-retrieve",
  "llm-step",
  "condition",
  "tool-call",
  "hitl-pause",
  "end",
] as const;

/** Bộ node chính cho giao diện Workbench rút gọn. Giữ nguyên `llm-step` ở đây (khác
 * `DRAGGABLE_NODE_TYPES` bên dưới) — `toCanvas.ts::fromRecipe()` dùng tập này để quyết định node
 * nào hiển thị được trên canvas khi NẠP LẠI 1 recipe đã publish; node `llm-step` của recipe cũ vẫn
 * phải hiển thị bình thường, chỉ không được KÉO THẢ THÊM node `llm-step` MỚI từ palette nữa. */
export const CORE_NODE_TYPES = ["kb-retrieve", "llm-step", "tool-call"] as const;

/** Loại node kéo-thả được từ Palette — bớt `llm-step` so với `CORE_NODE_TYPES`: node đó giờ CỐ
 * ĐỊNH, tự sinh đúng 1 lần lúc "Tạo agent" (`App.tsx::createFrame`), không kéo thêm được nữa (dù
 * palette rút gọn coi nó là 1 loại "chính"). */
export const DRAGGABLE_NODE_TYPES = ["kb-retrieve", "tool-call"] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type CoreNodeType = (typeof CORE_NODE_TYPES)[number];

export function isCoreNodeType(type: NodeType): type is CoreNodeType {
  return (CORE_NODE_TYPES as readonly string[]).includes(type);
}

/** Kiểu 1 field param mà Inspector biết render. `placeholder` (tuỳ chọn) là gợi ý cú pháp — chỉ
 * hiện trên field "text", không thay đổi giá trị mặc định. */
type ParamFieldSpec =
  | { key: string; label: string; kind: "text"; default: string; placeholder?: string }
  | { key: string; label: string; kind: "number"; default: number; min?: number; max?: number; step?: number }
  | { key: string; label: string; kind: "tool"; default: string }
  | { key: string; label: string; kind: "roles"; default: string[] };

/** Từ vựng đóng của `section_role` — bản sao `SECTION_VOCAB` (`studio_kb/doc_factory.py`).
 * Giá trị lạ ngoài 4 cái này sẽ bị `load_callisto()` raise phía Python khi ingest, nên Inspector
 * chỉ cho chọn trong đúng tập này, không phải ô nhập tay tự do. */
export const SECTION_ROLES = ["public", "hr", "finance", "engineering"] as const;

export interface NodeSpec {
  type: NodeType;
  /** Nhãn hiển thị trên palette + trên node ở canvas. */
  label: string;
  /** Quadrant sở hữu hành vi runtime của node này (umbrella §2) — chỉ để hiển thị. */
  owner: string;
  /** Màu CHỨC NĂNG (phân biệt 6 loại node), KHÔNG phải trang trí — cùng "họ" với token
   * `theme.css`; `kb-retrieve`/`end` CỐ Ý trùng `--tier-admin`/`--tier-employee` (retrieval là
   * năng lực lõi sản phẩm; end là node im lặng nhất), `condition` trùng `--accent` (rẽ nhánh =
   * "thẩm quyền quyết định"). Giá trị TĨNH (không đọc CSS var) vì đây là data TS thuần, không
   * phải style — mỗi màu tự đủ tương phản trên cả nền sáng/tối (dùng làm nền khối có chữ trắng ở
   * `RecipeNode`, không phụ thuộc theme trang). */
  color: string;
  /** Params mà node này khai báo; Inspector render đúng các field dưới đây. */
  fields: ParamFieldSpec[];
}

/**
 * Palette đóng — 6 spec, khớp 1-1 với `NODE_TYPES`.
 *
 * `fields` phản ánh params mà `builder.py` đang dựng cho từng loại (D3/D4/D6): `kb-retrieve`
 * lấy {query, top_k, section_roles}, `llm-step` lấy {temperature}, `tool-call` lấy {tool} —
 * chính là param mà luật 4 của graph-lint soi. `tenant_id` KHÔNG nằm trong params người dùng
 * gõ: server resolve từ session (INV-1), client khai tenant là lỗ hổng đã đóng ở D8/D10.
 *
 * `section_roles` (CẬP NHẬT D17, engine#21/#111 — sửa lại comment cũ ở đây nói NGƯỢC): từ D17
 * `interpreter.run()` ghi đè CẢ `tenant_id` LẪN `section_roles` của node `kb-retrieve` bằng
 * `session_context`, cùng cơ chế, không còn đọc thẳng từ `node.params` như trước D17 nữa —
 * `docs/backlog.yaml` FENCE-SEAM-1 đã đóng. Field này vẫn hiện trên canvas để tham khảo/hiển
 * thị "phạm vi khai báo lúc tạo" (khác `TraceEvent` thực tế lúc chạy), KHÔNG còn là hàng rào —
 * sửa giá trị ở đây không còn ảnh hưởng gì tới quyền truy xuất KB thật lúc chạy.
 */
export const NODE_SPECS: readonly NodeSpec[] = [
  {
    type: "kb-retrieve",
    label: "KB Retrieve",
    owner: "AIE-1 / DE",
    color: "#2F6659",
    // 0 field cấu hình — quyết định chốt cùng user: node này chỉ còn là 1 biểu tượng đánh dấu
    // "agent có tra cứu KB", không mở panel cấu hình gì nữa khi double-click. `query`/`top_k`/
    // `section_roles` từng có ở đây chưa từng được `run_agent_loop()` đọc từ `recipe.dag` (app#44
    // trở đi): `top_k` do chính LLM tự phát lúc gọi tool (`agent_loop.py`, `signal.params`), không
    // phải từ node params — xoá 3 field này không mất tác dụng thật nào, chỉ dọn UI trang trí.
    fields: [],
  },
  {
    type: "llm-step",
    label: "LLM Step",
    owner: "AIE-1",
    color: "#3D5A80",
    // Khớp `AgentConfig.temperature` backend (`ge=0.0, le=2.0`) — validate ở cả input (min/max
    // native) lẫn trước khi lưu (`App.tsx` panel cấu hình node llm-step).
    fields: [{ key: "temperature", label: "Temperature", kind: "number", default: 0.7, min: 0, max: 2, step: 0.1 }],
  },
  {
    type: "condition",
    label: "Condition",
    owner: "AIE-1 / SWE",
    color: "#A9762E",
    // KHÔNG còn field `when` ở node — bỏ có chủ đích (Kế hoạch 1). `interpreter.py` chỉ đọc
    // `node.params["when"]` khi nó CÓ mặt ("recipe declares it, recipe wins"); node không tự khai
    // thì LUÔN rơi về `when` của cạnh đi ra (`Edge.when`, sửa qua Inspector khi chọn 1 CẠNH, không
    // phải chọn node). Có 2 chỗ để gõ CÙNG 1 giá trị (node lẫn cạnh) là UI dư thừa, dễ gõ lệch
    // nhau — giữ đúng 1 nguồn (cạnh), đúng ngữ nghĩa "when là điều kiện của một NHÁNH đi ra", không
    // phải thuộc tính của bản thân node `condition`.
    fields: [],
  },
  {
    type: "tool-call",
    label: "Tool Call",
    owner: "AIE-1 / SWE",
    color: "#6B4FA0",
    // `default: "calculator"`, KHÔNG `"kb_search"` (bug đã sửa) — `kb_search` không bao giờ
    // dispatch được qua node `tool-call` (xem `AVAILABLE_TOOLS` dưới), 1 node mới thả ra phải có
    // tool hợp lệ ngay từ đầu.
    fields: [{ key: "tool", label: "Tool", kind: "tool", default: "calculator" }],
  },
  {
    type: "hitl-pause",
    label: "HITL Pause",
    owner: "SWE / AIE-1",
    color: "#8B5A3C",
    fields: [{ key: "reason", label: "Lý do chờ người", kind: "text", default: "" }],
  },
  {
    type: "end",
    label: "End",
    owner: "AIE-1",
    color: "#5C6B66",
    fields: [],
  },
];

const SPEC_BY_TYPE = new Map<NodeType, NodeSpec>(NODE_SPECS.map((spec) => [spec.type, spec]));

export function nodeSpec(type: NodeType): NodeSpec {
  const spec = SPEC_BY_TYPE.get(type);
  if (!spec) {
    // Không thể xảy ra với `NodeType` hợp lệ; ném thay vì trả undefined để một node
    // ngoài-6-loại lọt vào canvas là lỗi ồn ào ngay, không âm thầm render rỗng.
    throw new Error(`nodeSpec: ${type} không thuộc 6 loại node đóng`);
  }
  return spec;
}

/** Params mặc định khi thả 1 node mới từ palette. */
export function defaultParams(type: NodeType): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const field of nodeSpec(type).fields) {
    params[field.key] = field.default;
  }
  return params;
}

// ---------------------------------------------------------------------------
// Wire shape — khớp `studio_contracts.recipe`
// ---------------------------------------------------------------------------

export interface WireNode {
  id: string;
  type: NodeType;
  params: Record<string, unknown>;
}

export interface WireEdge {
  from: string;
  to: string;
  when: string | null;
}

export interface WireDag {
  nodes: WireNode[];
  edges: WireEdge[];
}

export interface WireAgentConfig {
  system_prompt: string;
  model: string;
  tool_whitelist: string[];
  /** Khớp `AgentConfig.temperature` backend (`ge=0.0, le=2.0`, default 0.7) — nguồn giá trị THẬT
   * là node `llm-step` duy nhất trên canvas (`params.temperature`), `buildRecipe()` đọc từ đó,
   * KHÔNG phải 1 field form riêng như `system_prompt`/`model`/`tool_whitelist`. */
  temperature: number;
}

export interface WireKbBinding {
  kb_id: string;
  scope: string;
}

export interface WireScorecardThreshold {
  success: number;
  citation_accuracy: number;
}

/** `studio_contracts.recipe.Recipe` — `tenant_id` là UUID (D-13), KHÔNG phải slug. */
export interface WireRecipe {
  agent_id: string;
  tenant_id: string;
  agent_config: WireAgentConfig;
  dag: WireDag;
  kb_binding: WireKbBinding;
  golden_set_ref: string;
  scorecard_threshold: WireScorecardThreshold;
}

/** Tenant id demo — trùng `studio_workbench.builder.ANKOR_ID`. */
export const ANKOR_ID = "a0000000-0000-0000-0000-000000000001";
export const BOREA_ID = "b0000000-0000-0000-0000-000000000001";

export const TENANTS = [
  { id: ANKOR_ID, slug: "ankor" },
  { id: BOREA_ID, slug: "borea" },
] as const;

/** Tool THẬT dispatch được qua node `tool-call` — khớp 1-1 `SUPPORTED_TOOLS` phía engine
 * (`apps/studio/src/studio_app/providers/tool_dispatch.py:98`). Nguồn DUY NHẤT cho 2 chỗ:
 * (1) dropdown chọn tool ở `NodeConfigModal.tsx`, (2) `agent_config.tool_whitelist` fix cứng gửi
 * lên trong `buildRecipe()` (`fromCanvas.ts`) — đổi giá trị ở đây là đổi cả 2 cùng lúc, không cần
 * đồng bộ tay.
 *
 * `kb_search` CỐ Ý không có mặt: nó có executor riêng (`KbRetrieveExecutor`), dùng node
 * `kb-retrieve` chuyên biệt, "luôn khả dụng" không qua whitelist (A4, `agent_loop.py`) — gọi
 * `kb_search` qua node `tool-call` sẽ lỗi `unsupported tool` ở dispatcher thật
 * (`tool_dispatch.py:139-146`). */
export const AVAILABLE_TOOLS = ["calculator", "current_datetime"] as const;


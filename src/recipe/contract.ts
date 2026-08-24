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

/** Bộ node chính cho giao diện Workbench rút gọn. */
export const CORE_NODE_TYPES = ["kb-retrieve", "llm-step", "tool-call"] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type CoreNodeType = (typeof CORE_NODE_TYPES)[number];

export function isCoreNodeType(type: NodeType): type is CoreNodeType {
  return (CORE_NODE_TYPES as readonly string[]).includes(type);
}

/** Kiểu 1 field param mà Inspector biết render. `placeholder` (tuỳ chọn) là gợi ý cú pháp — chỉ
 * hiện trên field "text", không thay đổi giá trị mặc định. */
type ParamFieldSpec =
  | { key: string; label: string; kind: "text"; default: string; placeholder?: string }
  | { key: string; label: string; kind: "number"; default: number }
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
    fields: [
      { key: "query", label: "Query", kind: "text", default: "" },
      { key: "top_k", label: "top_k", kind: "number", default: 3 },
      { key: "section_roles", label: "section_roles", kind: "roles", default: ["public"] },
    ],
  },
  {
    type: "llm-step",
    label: "LLM Step",
    owner: "AIE-1",
    color: "#3D5A80",
    fields: [{ key: "temperature", label: "Temperature", kind: "number", default: 0 }],
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
    fields: [{ key: "tool", label: "Tool", kind: "tool", default: "kb_search" }],
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

/** Tool có thể bật vào `agent_config.tool_whitelist` (nguồn cho luật 4 của graph-lint). */
export const AVAILABLE_TOOLS = ["kb_search", "calculator", "current_datetime"] as const;


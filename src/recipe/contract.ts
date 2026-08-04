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

export type NodeType = (typeof NODE_TYPES)[number];

/** Kiểu 1 field param mà Inspector biết render. */
type ParamFieldSpec =
  | { key: string; label: string; kind: "text"; default: string }
  | { key: string; label: string; kind: "number"; default: number }
  | { key: string; label: string; kind: "tool"; default: string };

export interface NodeSpec {
  type: NodeType;
  /** Nhãn hiển thị trên palette + trên node ở canvas. */
  label: string;
  /** Quadrant sở hữu hành vi runtime của node này (umbrella §2) — chỉ để hiển thị. */
  owner: string;
  color: string;
  /** Params mà node này khai báo; Inspector render đúng các field dưới đây. */
  fields: ParamFieldSpec[];
}

/**
 * Palette đóng — 6 spec, khớp 1-1 với `NODE_TYPES`.
 *
 * `fields` phản ánh params mà `builder.py` đang dựng cho từng loại (D3/D4/D6): `kb-retrieve`
 * lấy {query, top_k}, `llm-step` lấy {temperature}, `tool-call` lấy {tool} — chính là param mà
 * luật 4 của graph-lint soi. `tenant_id`/`section_roles` KHÔNG nằm trong params người dùng gõ:
 * tenant do server resolve (INV-1), client khai tenant là lỗ hổng đã đóng ở D8/D10.
 */
export const NODE_SPECS: readonly NodeSpec[] = [
  {
    type: "kb-retrieve",
    label: "KB Retrieve",
    owner: "AIE-1 / DE",
    color: "#0f766e",
    fields: [
      { key: "query", label: "Query", kind: "text", default: "" },
      { key: "top_k", label: "top_k", kind: "number", default: 3 },
    ],
  },
  {
    type: "llm-step",
    label: "LLM Step",
    owner: "AIE-1",
    color: "#1d4ed8",
    fields: [{ key: "temperature", label: "Temperature", kind: "number", default: 0 }],
  },
  {
    type: "condition",
    label: "Condition",
    owner: "AIE-1 / SWE",
    color: "#b45309",
    fields: [{ key: "expr", label: "Biểu thức", kind: "text", default: "" }],
  },
  {
    type: "tool-call",
    label: "Tool Call",
    owner: "AIE-1 / SWE",
    color: "#7c3aed",
    fields: [{ key: "tool", label: "Tool", kind: "tool", default: "kb_search" }],
  },
  {
    type: "hitl-pause",
    label: "HITL Pause",
    owner: "SWE / AIE-1",
    color: "#be123c",
    fields: [{ key: "reason", label: "Lý do chờ người", kind: "text", default: "" }],
  },
  {
    type: "end",
    label: "End",
    owner: "AIE-1",
    color: "#475569",
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
  instructions: string;
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
export const AVAILABLE_TOOLS = ["kb_search", "http_fetch", "calculator"] as const;

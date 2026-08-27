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
 * hiện trên field "text", không thay đổi giá trị mặc định.
 *
 * `"section"` (web#44 review, chọn lại hướng "cho kb-retrieve ý nghĩa thật" thay vì xoá hẳn) —
 * đơn giá trị, nguồn là `listSections(session)` (`admin/sectionsApi.ts`, phòng ban THẬT của tenant
 * đang đăng nhập), KHÔNG phải mảng tĩnh biên dịch sẵn như `"tool"`/`"roles"` — `NodeConfigModal.tsx`
 * tự fetch lúc render field này. Khác `"roles"` (multi-select tĩnh, vốn từ giả `SECTION_ROLES` cũ,
 * để nguyên không xoá vì vẫn còn 1 nhánh dead-code tham chiếu, ngoài phạm vi dọn ở đây) — `"section"`
 * là đơn-giá-trị, đúng 1 phòng ban/1 node `kb-retrieve`.
 *
 * `default` là `string[]` chứ không phải `string` dù UI chỉ cho chọn MỘT: giá trị nằm trong
 * `params` dưới khoá `section_roles` (mảng 1 phần tử) để khớp tên đã có ở `engine/fence.py`,
 * `apps/studio::_resolve_golden_set` và docstring `NODE_SPECS` bên dưới — xem `KB_SECTION_PARAM_KEY`.
 * Widget vẫn là đơn-giá-trị; chỉ HÌNH DẠNG lưu là mảng. */
type ParamFieldSpec =
  | { key: string; label: string; kind: "text"; default: string; placeholder?: string }
  | { key: string; label: string; kind: "number"; default: number; min?: number; max?: number; step?: number }
  | { key: string; label: string; kind: "tool"; default: string }
  | { key: string; label: string; kind: "roles"; default: string[] }
  | { key: string; label: string; kind: "section"; default: string[] };

/** Từ vựng đóng của `section_role` — bản sao `SECTION_VOCAB` (`studio_kb/doc_factory.py`).
 * Giá trị lạ ngoài 4 cái này sẽ bị `load_callisto()` raise phía Python khi ingest, nên Inspector
 * chỉ cho chọn trong đúng tập này, không phải ô nhập tay tự do.
 *
 * KHÔNG dùng hằng số này cho field `kind: "section"` mới (`kb-retrieve`, xem trên) — đã xác nhận
 * (review web#44) đây là vốn từ CỐ ĐỊNH/demo cũ (`SECTION_VOCAB`, dùng cho fixture Callisto), không
 * khớp phòng ban THẬT của tenant (vd tenant Ankor thật có `engineer/finance/hr`, không có
 * `"public"`/`"engineering"`). Nguồn thật là `listSections()`, per-tenant, động. */
export const SECTION_ROLES = ["public", "hr", "finance", "engineering"] as const;

/** Khoá `params` của phòng ban trên node `kb-retrieve`, và cách đọc nó ra một chuỗi.
 *
 * Tên là **`section_roles` (số nhiều, mảng)** chứ không phải `section_role` — cùng khái niệm này đã
 * mang tên đó ở ba nơi khác: `packages/engine/src/studio_engine/fence.py` (docstring + coerce),
 * `apps/studio` `_resolve_golden_set` nấc 1, và chính docstring `NODE_SPECS` bên dưới. Hai tên cho
 * một khái niệm, trải trên bốn repo, là đúng loại trôi mà `check-parity` không bắt được (nó so lint,
 * không so tên param) — và phép giao ở `fence.py` (kit#239 việc 3) đọc `section_roles`, nên một
 * recipe ghi `section_role` sẽ không bao giờ được tầng runtime nhìn thấy.
 *
 * Lưu mảng 1 phần tử thay vì chuỗi cũng là để mở multi-KB sau này **không phải di trú dòng nào**:
 * `Node.params` là JSONB tự do, nhưng recipe ĐÃ PUBLISH thì mang hình dạng lúc ghi mãi mãi.
 *
 * `sectionRoleOf` trả `""` cho mọi hình dạng không đọc được (thiếu khoá, không phải mảng, phần tử
 * đầu không phải chuỗi, chuỗi rỗng/toàn khoảng trắng) — caller chỉ cần phân biệt "có chọn phòng ban"
 * với "không", không cần biết hỏng theo kiểu nào. */
/** Tên công cụ tra KB ở engine (`studio_engine.agent_loop.KB_SEARCH_TOOL`). Chuỗi này là hợp đồng
 * chéo repo, không phải nhãn hiển thị. */
export const KB_SEARCH_TOOL = "kb_search";

/** `tool_whitelist` của recipe, suy từ những gì canvas THẬT SỰ khai.
 *
 * ## Vì sao phải suy, thay vì để người dùng gõ
 *
 * Canvas là bề mặt soạn thảo duy nhất, mà nó **không có ô nào** để khai whitelist: `toolWhitelist`
 * khởi tạo `[]` lúc tạo agent và không chỗ nào từng thêm vào. Chuyện đó vô hại cho tới khi engine
 * đảo A4 (engine#50): từ đó `kb_search` chỉ dùng được khi có tên trong `tool_whitelist`.
 *
 * Hậu quả đo được trên hệ thật: agent có node KB trên canvas trả **"Không có thông tin."** cho mọi
 * câu hỏi, bảng điểm ra `success_rate=0.00 · citation_accuracy=0.00`. Nhìn từ giao diện thì giống
 * hệt "agent kém" hoặc "bộ câu hỏi sai" — không có gì trỏ về nguyên nhân thật là một field rỗng.
 *
 * ## Hợp nhất, KHÔNG ghi đè
 *
 * Recipe nạp lại từ bản đã publish mang whitelist của chính nó (`toCanvas`). Thay nó bằng thứ suy
 * từ canvas sẽ âm thầm **thu hẹp quyền** của một agent đang chạy — đúng loại thay đổi mà không ai
 * chủ ý làm và cũng không ai thấy. Nên `declared` đi trước, phần suy ra chỉ bồi thêm.
 *
 * Thứ tự tất định (khai trước, rồi theo thứ tự node) vì `recipe_hash` băm nguyên recipe: thứ tự đổi
 * giữa hai lần render là hash đổi, và cổng publish coi cùng một agent là hai bản khác nhau.
 */
export function deriveToolWhitelist(
  declared: readonly string[],
  nodes: readonly { type: NodeType; params: Record<string, unknown> }[],
): string[] {
  const whitelist = [...declared];
  const add = (tool: string) => {
    if (tool && !whitelist.includes(tool)) whitelist.push(tool);
  };
  for (const node of nodes) {
    if (node.type === "kb-retrieve") {
      add(KB_SEARCH_TOOL);
      continue;
    }
    if (node.type === "tool-call") {
      const tool = node.params["tool"];
      // `params.tool` rỗng là node vừa thả ra chưa cấu hình. Đẩy chuỗi rỗng vào whitelist là dữ liệu
      // hỏng nằm im cho tới tận tầng engine.
      if (typeof tool === "string") add(tool.trim());
    }
  }
  return whitelist;
}

export const KB_SECTION_PARAM_KEY = "section_roles";

export function sectionRoleOf(params: Record<string, unknown>): string {
  const raw = params[KB_SECTION_PARAM_KEY];
  if (!Array.isArray(raw)) return "";
  const first: unknown = raw[0];
  return typeof first === "string" ? first.trim() : "";
}

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
 * `fields` phản ánh params mà node khai trên canvas: `kb-retrieve` lấy {section_roles} (web#44),
 * `llm-step` lấy {temperature}, `tool-call` lấy {tool}. `tenant_id` KHÔNG nằm trong params người
 * dùng gõ: server resolve từ session (INV-1), client khai tenant là lỗ hổng đã đóng ở D8/D10.
 *
 * Lịch sử `section_roles`: field CŨ cùng tên (bộ `{query, top_k, section_roles}`) từng bị
 * `interpreter.run()` ghi đè bằng `session_context` (D17, engine#21/#111, `docs/backlog.yaml`
 * FENCE-SEAM-1) nên chỉ còn ý nghĩa hiển thị, không phải hàng rào thật. Field MỚI dùng lại đúng tên
 * đó (`KB_SECTION_PARAM_KEY`) và thừa hưởng nguyên tắc ấy: nó KHÔNG điều khiển phạm vi truy xuất KB
 * lúc chạy — chỉ lái `golden_set_ref`. Khác biệt duy nhất so với field cũ là UI cho chọn đúng MỘT
 * phòng ban, và nguồn là phòng ban THẬT của tenant chứ không phải vốn từ tĩnh.
 */
export const NODE_SPECS: readonly NodeSpec[] = [
  {
    type: "kb-retrieve",
    // Nhãn hiển thị thuần UI (palette/canvas/modal header) — theo yêu cầu người dùng, ngắn gọn hơn
    // "KB Retrieve". Không đổi `type: "kb-retrieve"` (khớp `NodeType`/wire shape, `studio_contracts`)
    // hay nhãn field "Phòng ban" bên trong — chỉ đổi đúng chữ hiển thị trên chính node này.
    label: "KB",
    owner: "AIE-1 / DE",
    color: "#2F6659",
    // web#44 review — 1 field DUY NHẤT: chọn phòng ban (`section_roles`, mảng 1 phần tử — xem
    // `KB_SECTION_PARAM_KEY`), nguồn `listSections()` (per-tenant thật, KHÔNG phải `SECTION_ROLES`
    // giả ở trên). `query`/`top_k` cũ đã xoá thật từ trước, không quay lại — `run_agent_loop()`
    // không đọc chúng từ `recipe.dag`, `top_k` do chính LLM tự phát lúc gọi tool. Field này KHÔNG điều
    // khiển phạm vi truy xuất KB lúc chạy (đó vẫn là `session_context.system_roles` phía server,
    // không đổi) — nó điều khiển `golden_set_ref` gửi lên (`App.tsx::frameHeader()`), tức là bộ
    // dùng để Chấm điểm/Publish. Không chọn phòng ban nào → hành vi y hệt trước đây (fallback
    // `DEFAULT_HEADER.golden_set_ref`, bản demo).
    fields: [{ key: KB_SECTION_PARAM_KEY, label: "Phòng ban", kind: "section", default: [] }],
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

/** Params mặc định khi thả 1 node mới từ palette.
 *
 * `default` mảng được COPY chứ không gán thẳng: `NODE_SPECS` là hằng số cấp module, nên gán thẳng
 * khiến mọi node cùng loại thả ra dùng CHUNG một mảng — sửa params của node này là sửa cả node kia,
 * và sửa luôn cả `default` cho những node thả sau. Hôm nay chưa nổ vì hai chỗ ghi (`kind: "roles"`,
 * `kind: "section"`) đều thay bằng mảng mới thay vì `push`, nhưng đó là một bất biến không ai khai ở
 * đâu cả. */
export function defaultParams(type: NodeType): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const field of nodeSpec(type).fields) {
    params[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
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


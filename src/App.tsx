/**
 * AgentCore Studio — Workbench canvas (D12, issue kit#87).
 *
 * Luồng: form (header) + canvas (DAG) → `buildRecipe()` → `graphLint()` → export.
 *
 * ## Fail-closed
 * Nút export bị `disabled` khi `graphLint()` trả về vi phạm. Không có đường vòng nào lấy được
 * JSON khi đang đỏ — kể cả tab JSON cũng dán nhãn "CHƯA QUA LINT" thay vì hiện recipe như thể
 * nó dùng được. Đây là bản sao UX của luật R-SPEC A1#1: *recipe không qua validator = không
 * interpret*.
 *
 * ## Cái gì đổi so với bản D4
 * Bản cũ có canvas RỖNG (`nodes={[]}`) và 1 form xuất DAG **hardcode 4 node** — DAG không liên
 * quan gì tới thứ người dùng thấy. Recipe nó xuất ra còn sai contract 2 chỗ (`tenant` slug thay
 * vì `tenant_id` UUID; thiếu `golden_set_ref` + `scorecard_threshold`), nghĩa là chưa từng đi
 * lọt qua `Recipe.model_validate()` lần nào. D12: DAG đến từ canvas thật, và cả 7 field của
 * contract đều có mặt.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactFlow, {
  addEdge,
  Background,
  MarkerType,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from "reactflow";
import "reactflow/dist/style.css";

import Inspector from "./canvas/Inspector";
import Palette, { DND_MIME } from "./canvas/Palette";
import RecipeNode from "./canvas/RecipeNode";
import {
  AVAILABLE_TOOLS,
  defaultParams,
  nodeSpec,
  NODE_TYPES,
  type NodeType,
  type WireRecipe,
} from "./recipe/contract";
import {
  buildRecipe,
  type CanvasEdgeData,
  type CanvasNodeData,
  type RecipeHeader,
} from "./recipe/fromCanvas";
import { advisories, graphLint } from "./recipe/graphLint";
import { DEFAULT_HEADER, sampleGraph } from "./recipe/sample";
import TraceViewer from "./playground/TraceViewer";
import LoginForm from "./auth/LoginForm";
import { SessionProvider, useSession, type Session } from "./auth/session";
import { ThemeProvider, ThemeToggleButton } from "./theme";
import ChatPage from "./chat/ChatPage";
import CreateCompanyForm from "./admin/CreateCompanyForm";
import CreateUserForm from "./admin/CreateUserForm";
import { LogoBadge, UserMenu } from "./components/UserMenu";
import {
  evaluateAgent,
  fetchTrace,
  publishAgent,
  runRecipe,
  type PublishResult,
  type Scorecard,
  type StudioRunResponse,
} from "./studio/api";
import { StudioApiError } from "./auth/api";

// Định nghĩa ngoài component: React Flow so sánh `nodeTypes` theo tham chiếu và cảnh báo
// (kèm remount toàn bộ node) nếu object mới được tạo lại mỗi lần render.
const NODE_TYPES_MAP = { recipeNode: RecipeNode };

const DEFAULT_EDGE_OPTIONS = {
  markerEnd: { type: MarkerType.ArrowClosed },
};

// Giới hạn kéo-giãn panel trái/phải: dưới `PANEL_MIN_WIDTH` nội dung bên trong (nhãn tab, label
// form, ô input) bắt đầu bị bể dòng/che mất — đã kiểm chứng bằng ảnh chụp thật (Playwright) chứ
// không đoán. Trên `PANEL_MAX_WIDTH` thì canvas — nơi thao tác chính — bị bóp quá nhiều.
const PANEL_MIN_WIDTH = 240;
const PANEL_MAX_WIDTH = 520;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 9px",
  fontSize: 12,
  fontFamily: "var(--font-body)",
  color: "var(--ink)",
  borderRadius: 6,
  border: "1px solid var(--line)",
  boxSizing: "border-box",
  outline: "none",
};

const sectionStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "16px 0 8px",
  paddingBottom: 4,
  borderBottom: "1px solid var(--line)",
};

const btnToolbarAction: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: "var(--font-body)",
  color: "#fff",
  border: "none",
  borderRadius: 7,
  flexShrink: 0,
  transition: "opacity 0.12s ease",
};

const btnSecondary: React.CSSProperties = {
  padding: "9px 16px",
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: "var(--font-body)",
  color: "var(--muted)",
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: 7,
  flexShrink: 0,
  cursor: "pointer",
};

/** Icon "toggle sidebar" (16×16, nét mảnh) — hình chữ nhật viền ngoài + 1 vạch dọc lệch về
 * `side`, quen thuộc kiểu VS Code/Figma. Thay 2 nút ▶/◀ nổi ở mép panel trước đây — đặt trong
 * toolbar canvas, không còn chiếm chỗ trên chính panel nó điều khiển. */
function SidebarToggleIcon({ side, active }: { side: "left" | "right"; active: boolean }) {
  const barX = side === "left" ? 6 : 12;
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="15" height="13" rx="2.5" stroke={active ? "var(--accent)" : "var(--muted)"} strokeWidth="1.4" />
      <line x1={barX} y1="2.5" x2={barX} y2="15.5" stroke={active ? "var(--accent)" : "var(--muted)"} strokeWidth="1.4" />
    </svg>
  );
}

function SidebarToggleButton({
  side,
  collapsed,
  onClick,
}: {
  side: "left" | "right";
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${collapsed ? "Mở" : "Thu gọn"} panel ${side === "left" ? "Cấu hình" : "Chi tiết"}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        flexShrink: 0,
        padding: 0,
        border: "1px solid var(--line)",
        borderRadius: 7,
        background: collapsed ? "transparent" : "var(--bg)",
        cursor: "pointer",
      }}
    >
      <SidebarToggleIcon side={side} active={!collapsed} />
    </button>
  );
}

/** Nút gạt bật/tắt kiểu "công tắc vật lý" — thay `<input type="checkbox">` trần vì checkbox hệ
    điều hành không khớp chủ đề workbench và không có chuyển động trượt. */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 34,
        height: 19,
        padding: 0,
        flexShrink: 0,
        borderRadius: 999,
        border: "1px solid var(--line)",
        background: checked ? "var(--accent)" : "var(--bg)",
        cursor: "pointer",
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          left: checked ? 16 : 1,
          width: 15,
          height: 15,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(20,24,26,0.35)",
          transition: "left 0.15s ease",
        }}
      />
    </button>
  );
}

function Studio({
  session,
  showMiniMap,
  toolbarSlot,
}: {
  session: Session;
  showMiniMap: boolean;
  toolbarSlot: HTMLDivElement | null;
}) {
  const tenantId = session.tenantId;
  const roles = session.roles;
  const initial = useMemo(sampleGraph, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdgeData>(initial.edges);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // D15 (issue kit#102) — Playground: bấm Test → interpreter chạy → trace viewer hiện.
  const [testState, setTestState] = useState<"idle" | "running" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [trace, setTrace] = useState<StudioRunResponse | null>(null);

  // Chấm điểm (POST /api/agents/{id}/evaluate) — TÁCH khỏi Publish: cho biết verdict trước khi
  // ghi DB, để nút Publish có căn cứ bật/tắt thay vì "bấm thử xem có được không". `evaluatedFor`
  // giữ đúng `recipeJson` lúc chấm — nếu người dùng sửa canvas SAU khi chấm, verdict cũ không còn
  // tính (Publish sẽ tự disable lại), tránh publish nhầm 1 recipe chưa từng được chấm điểm.
  const [evaluateState, setEvaluateState] = useState<"idle" | "running" | "error">("idle");
  const [evaluateError, setEvaluateError] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [evaluatedFor, setEvaluatedFor] = useState<string | null>(null);

  // Publish (Kế hoạch 2, A4 backend + phần UI còn thiếu tới giờ) — tách state riêng khỏi
  // testState: Test và Publish là 2 hành động độc lập, có thể chạy lệch pha nhau. Route
  // `/publish` LUÔN tự chấm lại từ đầu ở server (không tin `scorecard` state phía dưới) — nút chỉ
  // dùng verdict đã chấm để BẬT/TẮT hiển thị, không thay cho việc server tự verify.
  const [publishState, setPublishState] = useState<"idle" | "running" | "error">("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  // Chia sidebar cấu hình thành tab (Kế hoạch B) — thay vì 1 cột dài cuộn hết section 1-6.
  const [configTab, setConfigTab] = useState<"agent" | "kb" | "eval" | "tools" | "node">("agent");

  // Thu gọn 2 cột 2 bên (trái: Recipe, phải: lint/Inspector/Export) để nhường chỗ cho canvas
  // kéo thả ở giữa — độc lập nhau, thu gọn 1 bên không ảnh hưởng bên kia.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(340);
  // Tắt transition `grid-template-columns` (dùng cho lúc thu/mở panel) trong lúc đang kéo —
  // để nguyên thì mỗi mousemove phải "đuổi theo" transition 0.15s, tay kéo bị trễ/ì.
  const [isResizing, setIsResizing] = useState(false);

  // Kéo thanh chia để đổi bề rộng panel — dùng `movementX` (delta từ frame trước) thay vì tính
  // lại từ toạ độ bắt đầu, nên không cần ref giữ "width lúc bắt đầu kéo" (tránh closure cũ).
  const resizePanel = useCallback((side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.movementX;
      if (side === "left") {
        setLeftWidth((w) => Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, w + delta)));
      } else {
        setRightWidth((w) => Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, w - delta)));
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setIsResizing(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  // Giá trị khởi tạo lấy từ `DEFAULT_HEADER` — cùng nguồn mà `scripts/emit-fixture.ts` dùng để
  // sinh fixture Python, nên fixture đó luôn là đúng thứ người dùng thấy khi mở app lần đầu.
  const [agentId, setAgentId] = useState(DEFAULT_HEADER.agent_id);
  // `tenantId` KHÔNG còn là state cục bộ — nó đến từ session đăng nhập (prop, xem `AppShell`
  // bên dưới), không thể tự sửa trên canvas nữa (Kế hoạch 1, B2).
  const [instructions, setInstructions] = useState(DEFAULT_HEADER.instructions);
  const [model, setModel] = useState(DEFAULT_HEADER.model);
  const [toolWhitelist, setToolWhitelist] = useState<string[]>(DEFAULT_HEADER.tool_whitelist);
  const [kbId, setKbId] = useState(DEFAULT_HEADER.kb_id);
  // `scope` KHÔNG còn là input tự do — tự suy từ `roles` của session (đúng mẫu
  // `apps/studio/src/studio_app/eval_adapter.py::EngineAgentRunner.run_case` đã dùng: slug "t"
  // (placeholder, không cross-check với tenant thật — xem `_parse_kb_scope` docstring) + roles
  // nối dấu phẩy). `interpreter.run()` ghi đè `section_roles` bằng session dù sao đi nữa (đã học
  // D17/#111), nên giá trị này chỉ còn ý nghĩa "khai báo lúc tạo", không phải hàng rào — không có
  // lý do để người dùng tự gõ.
  const scope = roles.length > 0 ? `t/${roles.join(",")}` : "t/";
  const [goldenSetRef, setGoldenSetRef] = useState(DEFAULT_HEADER.golden_set_ref);
  const [successThreshold, setSuccessThreshold] = useState(
    DEFAULT_HEADER.scorecard_threshold.success,
  );
  const [citationThreshold, setCitationThreshold] = useState(
    DEFAULT_HEADER.scorecard_threshold.citation_accuracy,
  );

  const { screenToFlowPosition, fitView } = useReactFlow();
  const idCounter = useRef(initial.nodes.length);

  const nextNodeId = useCallback(() => {
    // Id phải duy nhất kể cả sau khi import 1 recipe đã có sẵn `n1..n9` — tăng counter tới khi
    // chạm id chưa dùng, thay vì tin rằng counter luôn đi trước.
    const taken = new Set(nodes.map((node) => node.id));
    let candidate: string;
    do {
      idCounter.current += 1;
      candidate = `n${idCounter.current}`;
    } while (taken.has(candidate));
    return candidate;
  }, [nodes]);

  const addNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }) => {
      const id = nextNodeId();
      setNodes((current) => [
        ...current,
        {
          id,
          type: "recipeNode",
          position: position ?? { x: 260 + current.length * 12, y: 40 + current.length * 12 },
          data: { type, params: defaultParams(type) },
        },
      ]);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
    },
    [nextNodeId, setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      // `addEdge` của reactflow v11 không generic (trả `Edge<any>[]`); nó tự sinh `id` cho cạnh
      // mới và bỏ qua cạnh trùng. `data.when` khởi tạo `null` = cạnh vô điều kiện.
      setEdges((current) => addEdge({ ...connection, data: { when: null } }, current)),
    [setEdges],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData(DND_MIME);
      // Chỉ nhận payload do palette đặt vào. Kéo 1 thứ khác (file, text từ tab khác) rơi vào
      // canvas thì bỏ qua, không cố đoán ra node type từ chuỗi lạ.
      if (!NODE_TYPES.includes(raw as NodeType)) return;
      addNode(raw as NodeType, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNode, screenToFlowPosition],
  );

  const onParamChange = useCallback(
    (nodeId: string, key: string, value: unknown) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, params: { ...node.data.params, [key]: value } } }
            : node,
        ),
      );
    },
    [setNodes],
  );

  const onWhenChange = useCallback(
    (edgeId: string, when: string | null) => {
      setEdges((current) =>
        current.map((edge) =>
          edge.id === edgeId
            ? { ...edge, label: when ?? undefined, data: { ...edge.data, when } }
            : edge,
        ),
      );
    },
    [setEdges],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      // Xoá luôn cạnh dính node đó. Nếu để lại, chúng thành cạnh treo và graph-lint sẽ báo lỗi
      // "edge-destination" — đúng luật, nhưng đổ lỗi cho người dùng vì một việc UI tự gây ra.
      setEdges((current) =>
        current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
      setSelectedNodeId(null);
    },
    [setEdges, setNodes],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      setSelectedEdgeId(null);
    },
    [setEdges],
  );

  const header: RecipeHeader = {
    agent_id: agentId,
    tenant_id: tenantId,
    instructions,
    model,
    tool_whitelist: toolWhitelist,
    kb_id: kbId,
    scope,
    golden_set_ref: goldenSetRef,
    scorecard_threshold: { success: successThreshold, citation_accuracy: citationThreshold },
  };

  const recipe: WireRecipe = useMemo(
    () => buildRecipe(header, nodes, edges),
    // `header` được dựng mới mỗi render nên không đưa thẳng vào deps — liệt kê từng field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      agentId,
      tenantId,
      instructions,
      model,
      toolWhitelist,
      kbId,
      scope,
      goldenSetRef,
      successThreshold,
      citationThreshold,
      nodes,
      edges,
    ],
  );

  const violation = useMemo(() => graphLint(recipe), [recipe]);
  const notes = useMemo(() => advisories(recipe), [recipe]);
  const recipeJson = useMemo(() => JSON.stringify(recipe, null, 2), [recipe]);

  const handleTest = useCallback(async () => {
    setTestState("running");
    setTestError(null);
    try {
      const runResult = await runRecipe(recipe, session);
      // Đọc lại bằng 1 request GET TÁCH RIÊNG (không tin thẳng response của POST) — đây
      // mới là phép thử thật cho "run_id/agent_id khớp giữa recipe và trace" (DoD D15):
      // nếu wiring lệch, GET sẽ về rỗng thay vì âm thầm hiện lại đúng dữ liệu vừa POST.
      const fetched = await fetchTrace(runResult.run_id, session);
      setTrace(fetched);
      setTestState("idle");
    } catch (error) {
      setTestError(error instanceof StudioApiError ? error.message : String(error));
      setTestState("error");
    }
  }, [recipe, session]);

  const handleEvaluate = useCallback(async () => {
    setEvaluateState("running");
    setEvaluateError(null);
    try {
      const result = await evaluateAgent(recipe, session);
      setScorecard(result);
      setEvaluatedFor(recipeJson);
      setEvaluateState("idle");
    } catch (error) {
      setEvaluateError(error instanceof StudioApiError ? error.message : String(error));
      setEvaluateState("error");
    }
  }, [recipe, recipeJson, session]);

  // Publish chỉ bật khi: đã chấm điểm ĐÚNG recipe hiện tại (không lệch do sửa canvas sau khi
  // chấm) và verdict đó là PASS. Server (`routes/publish.py`) vẫn tự chấm lại từ đầu — điều kiện
  // này chỉ quyết định nút có sáng hay không, không thay cho việc server tự verify.
  const canPublish = scorecard !== null && evaluatedFor === recipeJson && scorecard.gate.verdict === "PASS";

  const handlePublish = useCallback(async () => {
    setPublishState("running");
    setPublishError(null);
    try {
      const result = await publishAgent(recipe, session);
      setPublishResult(result);
      setPublishState("idle");
    } catch (error) {
      setPublishError(error instanceof StudioApiError ? error.message : String(error));
      setPublishState("error");
    }
  }, [recipe, session]);

  // Node bị lint chỉ mặt được tô đỏ. Tính lúc render thay vì ghi cờ `invalid` vào state: cờ
  // trong state sẽ phải đồng bộ tay mỗi lần lint đổi, và lệch state là loại lỗi mà một thứ
  // "hiển thị recipe có hợp lệ không" tuyệt đối không được có.
  const displayNodes = useMemo(
    () =>
      nodes.map((node) =>
        node.id === violation?.nodeId
          ? { ...node, data: { ...node.data, invalid: true } }
          : node,
      ),
    [nodes, violation],
  );

  const selectedNode = displayNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${leftCollapsed ? "0px" : `${leftWidth}px`} ${leftCollapsed ? "0px" : "6px"} 1fr ${rightCollapsed ? "0px" : "6px"} ${rightCollapsed ? "0px" : `${rightWidth}px`}`,
        transition: isResizing ? "none" : "grid-template-columns 0.15s ease",
        height: "100vh",
        width: "100vw",
        overflowX: "hidden",
        fontFamily: "var(--font-body)",
        color: "var(--ink)",
      }}
    >
      {/* ---------------- CỘT TRÁI: header của recipe, chia tab (Kế hoạch B) ---------------- */}
      <aside
        style={{
          boxSizing: "border-box",
          borderRight: leftCollapsed ? "none" : "1px solid var(--line)",
          padding: leftCollapsed ? 0 : 14,
          overflow: leftCollapsed ? "hidden" : "auto",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, margin: 0 }}>Cấu hình</h2>
          <SidebarToggleButton side="left" collapsed={leftCollapsed} onClick={() => setLeftCollapsed((v) => !v)} />
        </div>

        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--line)", marginBottom: 10 }}>
          {(
            [
              ["agent", "Agent"],
              ["kb", "KB Binding"],
              ["eval", "Eval Gate"],
              ["tools", "Tools"],
              ["node", `Node${selectedNode || selectedEdge ? " ●" : ""}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setConfigTab(key)}
              style={{
                flex: 1,
                padding: "7px 3px",
                fontSize: 10.5,
                fontWeight: configTab === key ? 700 : 500,
                border: "none",
                borderBottom: "2px solid " + (configTab === key ? "var(--accent)" : "transparent"),
                background: "transparent",
                color: configTab === key ? "var(--accent)" : "var(--muted)",
                cursor: "pointer",
                transition: "color 0.15s ease, border-color 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {configTab === "agent" && (
          <>
            <div style={sectionStyle}>Định danh</div>
            <label style={{ fontSize: 11, fontWeight: 600 }}>agent_id</label>
            <input value={agentId} onChange={(e) => setAgentId(e.target.value)} style={inputStyle} />
            {/* `tenant_id` KHÔNG hiển thị trên UI — tự suy từ session (prop `tenantId`), vẫn có
                mặt trong `recipe` gửi đi (buildRecipe() bên dưới vẫn đọc `tenantId`), chỉ không
                cho người dùng THẤY trên form, theo đúng yêu cầu. */}

            <div style={sectionStyle}>agent_config</div>
            <label style={{ fontSize: 11, fontWeight: 600 }}>instructions</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              style={{ ...inputStyle, fontFamily: "inherit" }}
            />
            <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginTop: 6 }}>
              model
            </label>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle}>
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
            </select>
            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6 }}>tool_whitelist</div>
            {AVAILABLE_TOOLS.map((tool) => (
              <label
                key={tool}
                style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginTop: 3 }}
              >
                <input
                  type="checkbox"
                  checked={toolWhitelist.includes(tool)}
                  onChange={(e) =>
                    setToolWhitelist((current) =>
                      e.target.checked ? [...current, tool] : current.filter((t) => t !== tool),
                    )
                  }
                />
                <code>{tool}</code>
              </label>
            ))}
          </>
        )}

        {configTab === "kb" && (
          <>
            <div style={sectionStyle}>kb_binding</div>
            <label style={{ fontSize: 11, fontWeight: 600 }}>kb_id</label>
            <input value={kbId} onChange={(e) => setKbId(e.target.value)} style={inputStyle} />
            {/* `scope` KHÔNG hiển thị trên UI — tự suy từ `roles` của session (biến `scope` ở
                trên), vẫn có mặt trong `recipe` gửi đi, chỉ không cho người dùng THẤY trên form. */}
          </>
        )}

        {configTab === "eval" && (
          <>
            <div style={sectionStyle}>Eval gate</div>
            <label style={{ fontSize: 11, fontWeight: 600 }}>golden_set_ref</label>
            <input
              value={goldenSetRef}
              onChange={(e) => setGoldenSetRef(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600 }}>success</label>
                <input
                  type="number"
                  step="0.01"
                  value={successThreshold}
                  onChange={(e) => setSuccessThreshold(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600 }}>citation_accuracy</label>
                <input
                  type="number"
                  step="0.01"
                  value={citationThreshold}
                  onChange={(e) => setCitationThreshold(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>
          </>
        )}

        {configTab === "tools" && (
          <>
            <div style={sectionStyle}>Palette (6 loại đóng)</div>
            <Palette onAdd={(type) => addNode(type)} />
          </>
        )}

        {configTab === "node" && (
          <>
            <div style={sectionStyle}>Sửa node/cạnh đang chọn</div>
            {/* Đây vẫn là CẤU HÌNH (đổi params của 1 node/cạnh) — chuyển từ panel phải sang đây
                cho đúng nhóm việc: panel trái = cấu hình (chỉnh), panel phải = chỉ hiển thị kết
                quả (không chỉnh gì cả). Bấm node/cạnh trên canvas tự chuyển sang tab này. */}
            <Inspector
              node={selectedNode}
              edge={selectedEdge}
              toolWhitelist={toolWhitelist}
              onParamChange={onParamChange}
              onWhenChange={onWhenChange}
              onDeleteNode={deleteNode}
              onDeleteEdge={deleteEdge}
            />
          </>
        )}
      </aside>

      {/* Thanh kéo-giãn panel trái — LUÔN render (không unmount theo `leftCollapsed`): grid có
          đúng 5 cột cố định, tháo 1 item sẽ làm auto-placement lệch hết các cột sau. Panel thu
          gọn thì cột grid tương ứng tự co về 0px (xem `gridTemplateColumns` ở trên), thanh này
          co theo, không cần ẩn tay. */}
      <div
        onMouseDown={leftCollapsed ? undefined : resizePanel("left")}
        title={leftCollapsed ? undefined : "Kéo để đổi bề rộng panel Cấu hình"}
        className="panel-resizer"
      />

      {/* ---------------- CỘT GIỮA: canvas ---------------- */}
      <main style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Nhóm nút hành động (Nạp DAG mẫu/Xoá hết/Focus/Test/Chấm điểm/Publish) KHÔNG còn nằm ở
            toolbar riêng của canvas nữa — canvas là cột co giãn theo kéo panel trái/phải, hàng nút
            ở đây từng bị bóp/tràn đè lên panel bên cạnh khi panel kéo quá rộng. Portal cả nhóm lên
            thanh trên cùng (`toolbarSlot`, AppShell) — thanh đó span TRỌN chiều ngang trang, không
            phụ thuộc panel nào nên không thể bị bóp theo cách đó nữa; đồng thời gom mọi nút bấm
            chính về 1 hàng duy nhất, đúng đề xuất bố trí lại của người dùng. */}
        {toolbarSlot &&
          createPortal(
            <>
              <button
                type="button"
                onClick={() => {
                  const graph = sampleGraph();
                  setNodes(graph.nodes);
                  setEdges(graph.edges);
                  idCounter.current = graph.nodes.length;
                }}
                style={btnSecondary}
              >
                Nạp DAG mẫu
              </button>
              <button
                type="button"
                onClick={() => {
                  setNodes([]);
                  setEdges([]);
                }}
                style={btnSecondary}
              >
                Xoá hết
              </button>
              <button
                type="button"
                onClick={() => fitView({ padding: 0.2, duration: 300 })}
                title="Đưa toàn bộ DAG vào giữa khung nhìn — dùng khi kéo/zoom bị lạc"
                style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 5 }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M1 5V2a1 1 0 0 1 1-1h3M15 5V2a1 1 0 0 0-1-1h-3M1 11v3a1 1 0 0 0 1 1h3M15 11v3a1 1 0 0 1-1 1h-3"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                Focus
              </button>

              <div style={{ width: 10 }} />

              <button
                type="button"
                disabled={violation !== null || testState === "running"}
                onClick={handleTest}
                title={violation ? "graph-lint đang từ chối recipe này" : "Chạy interpreter thật, xem trace/cost"}
                style={{
                  ...btnToolbarAction,
                  cursor: violation || testState === "running" ? "not-allowed" : "pointer",
                  background: violation ? "var(--muted)" : testState === "running" ? "#78716c" : "#15803d",
                  opacity: violation ? 0.4 : 1,
                }}
              >
                {testState === "running" ? "Đang chạy…" : "▶ Test"}
              </button>
              <button
                type="button"
                disabled={violation !== null || evaluateState === "running"}
                onClick={handleEvaluate}
                title={
                  violation
                    ? "graph-lint đang từ chối recipe này"
                    : "Chạy nguyên golden_set_ref qua EvalHarness thật, chỉ xem điểm — KHÔNG ghi DB"
                }
                style={{
                  ...btnToolbarAction,
                  cursor: violation || evaluateState === "running" ? "not-allowed" : "pointer",
                  background: violation ? "var(--muted)" : evaluateState === "running" ? "#78716c" : "#7c3aed",
                  opacity: violation ? 0.4 : 1,
                }}
              >
                {evaluateState === "running" ? "Đang chấm…" : "📊 Chấm điểm"}
              </button>
              <button
                type="button"
                disabled={!canPublish || publishState === "running"}
                onClick={handlePublish}
                title={
                  !canPublish
                    ? "Cần Chấm điểm trước, verdict PASS, và chưa sửa canvas sau khi chấm"
                    : "Chạy lại nguyên golden_set_ref qua EvalHarness thật rồi gate qua publish() thật"
                }
                className={canPublish && publishState !== "running" ? "btn-switch" : undefined}
                style={{
                  ...btnToolbarAction,
                  cursor: !canPublish || publishState === "running" ? "not-allowed" : "pointer",
                  background: publishState === "running" ? "#78716c" : "var(--accent)",
                  opacity: !canPublish ? 0.4 : 1,
                  filter: !canPublish ? "saturate(0.5)" : "none",
                }}
              >
                {publishState === "running" ? "Đang publish…" : "🚀 Publish"}
              </button>
            </>,
            toolbarSlot,
          )}

        <div style={{ flexGrow: 1, minHeight: 0, position: "relative" }}>
          {/* Nút mở lại panel — hiện khi panel TƯƠNG ỨNG đang thu gọn (nút trong panel biến mất
              theo panel, taskbar trên cùng cũng có 1 cặp nút tương tự — 3 lối vào cùng lúc, giữ
              theo đúng yêu cầu, không phải dư thừa nhầm). Nổi ĐÈ lên canvas, không chiếm hàng
              riêng, tự ẩn ngay khi panel mở lại. */}
          {leftCollapsed && (
            <button
              type="button"
              onClick={() => setLeftCollapsed(false)}
              title="Mở panel Cấu hình"
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                padding: 0,
                border: "1px solid var(--line)",
                borderRadius: 7,
                background: "var(--surface)",
                boxShadow: "0 2px 8px rgba(20,24,26,0.12)",
                cursor: "pointer",
              }}
            >
              <SidebarToggleIcon side="left" active={false} />
            </button>
          )}
          {rightCollapsed && (
            <button
              type="button"
              onClick={() => setRightCollapsed(false)}
              title="Mở panel Chi tiết"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                padding: 0,
                border: "1px solid var(--line)",
                borderRadius: 7,
                background: "var(--surface)",
                boxShadow: "0 2px 8px rgba(20,24,26,0.12)",
                cursor: "pointer",
              }}
            >
              <SidebarToggleIcon side="right" active={false} />
            </button>
          )}
          <div style={{ height: "100%" }} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
            <ReactFlow
              nodes={displayNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={NODE_TYPES_MAP}
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
                setLeftCollapsed(false);
                setConfigTab("node");
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
                setLeftCollapsed(false);
                setConfigTab("node");
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              fitView
            >
              <Background />
              {/* Kiểu "minimap game" (LoL, góc dưới phải) — nền tối RIÊNG, cố định, không đổi
                  theo theme trang (giống minimap game luôn có màu địa hình riêng bất kể giao
                  diện client): chấm màu theo ĐÚNG 6 màu loại node trên canvas thật (không phải
                  xám đồng nhất mặc định — mới thật sự "biết đang nhìn cái gì"), khung viền +
                  bóng đổ để nổi hẳn thành 1 khối HUD, che mờ phần NGOÀI khung nhìn hiện tại
                  (giữ nguyên rõ phần đang xem — chính là "khung camera" kiểu LoL). */}
              {showMiniMap && (
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(node) => nodeSpec((node.data as CanvasNodeData).type).color}
                  nodeStrokeColor="rgba(255,255,255,0.75)"
                  nodeStrokeWidth={2}
                  nodeBorderRadius={3}
                  maskColor="rgba(10,12,15,0.72)"
                  style={{
                    backgroundColor: "#12161a",
                    border: "2px solid var(--line)",
                    borderRadius: 10,
                    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                  }}
                />
              )}
            </ReactFlow>
          </div>
        </div>
      </main>

      {/* Thanh kéo-giãn panel phải — cùng lý do LUÔN render như thanh bên trái ở trên. */}
      <div
        onMouseDown={rightCollapsed ? undefined : resizePanel("right")}
        title={rightCollapsed ? undefined : "Kéo để đổi bề rộng panel Chi tiết"}
        className="panel-resizer"
      />

      {/* ---------------- CỘT PHẢI: kết quả + Inspector ---------------- */}
      <aside
        style={{
          boxSizing: "border-box",
          borderLeft: rightCollapsed ? "none" : "1px solid var(--line)",
          padding: rightCollapsed ? 0 : 14,
          overflow: rightCollapsed ? "hidden" : "auto",
          background: "var(--bg)",
        }}
      >
        {/* Panel này nằm bên PHẢI màn hình — đảo thứ tự so với panel trái: nút thu gọn kề CẠNH
            TRONG (giáp canvas) còn tiêu đề kề cạnh ngoài, đối xứng gương với panel "Cấu hình". */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <SidebarToggleButton side="right" collapsed={rightCollapsed} onClick={() => setRightCollapsed((v) => !v)} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, margin: 0 }}>Chi tiết</h2>
        </div>

        <div
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid " + (violation ? "var(--danger-border)" : "var(--success-border)"),
            background: violation ? "var(--danger-bg)" : "var(--success-bg)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 12, color: violation ? "var(--danger-text)" : "var(--success-text)" }}>
            {violation ? "✗ graph-lint: TỪ CHỐI" : "✓ graph-lint: 7/7 luật sạch"}
          </div>
          {violation ? (
            <div style={{ fontSize: 12, marginTop: 5 }}>
              <code style={{ fontSize: 11, color: "var(--danger-text)" }}>[{violation.rule}]</code>{" "}
              {violation.message}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--success-text)", marginTop: 5 }}>
              node ∈ 6 · edge có đích · 1 start node · ≤1 outgoing edge · không chu trình · kết ở
              end · tool ∈ whitelist
            </div>
          )}
        </div>

        {notes.length > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 6,
              border: "1px solid var(--warning-border)",
              background: "var(--warning-bg)",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--warning-text)" }}>Cảnh báo (ngoài 7 luật)</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div style={{ marginTop: 4, color: "var(--warning-text)" }}>
              Những mục này graph_lint KHÔNG chặn — không khoá export.
            </div>
          </div>
        )}

        {testError && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 6,
              border: "1px solid var(--danger-border)",
              background: "var(--danger-bg)",
              color: "var(--danger-text)",
              fontSize: 11,
            }}
          >
            {testError}
          </div>
        )}
        {trace && (
          <div style={{ marginTop: 8 }}>
            <TraceViewer
              expectedRunId={trace.run_id}
              expectedAgentId={agentId}
              tenantId={tenantId}
              events={trace.events}
              timelineText={trace.timeline_text}
              // `score` không truyền — route `/api/runs` mới (apps/studio) không trả field này
              // (đó là việc của evalhub lúc Publish, không phải lúc Test); prop optional nên bỏ
              // qua an toàn, không hiện gì thay vì hiện số giả.
            />
          </div>
        )}

        {evaluateError && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 6,
              border: "1px solid var(--danger-border)",
              background: "var(--danger-bg)",
              color: "var(--danger-text)",
              fontSize: 11,
            }}
          >
            {evaluateError}
          </div>
        )}
        {scorecard && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${scorecard.gate.verdict === "PASS" ? "var(--success-border)" : "var(--danger-border)"}`,
              background: scorecard.gate.verdict === "PASS" ? "var(--success-bg)" : "var(--danger-bg)",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {scorecard.gate.verdict === "PASS" ? "✅ verdict PASS" : "❌ verdict FAIL"}
              {evaluatedFor !== recipeJson && " — đã sửa canvas sau khi chấm, chấm lại trước khi Publish"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)" }}>
              success_rate={scorecard.aggregate.success_rate.toFixed(2)} · citation_accuracy=
              {scorecard.aggregate.citation_accuracy?.toFixed(2) ?? "n/a (chưa đo)"}
            </div>
          </div>
        )}

        {publishError && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 6,
              border: "1px solid var(--danger-border)",
              background: "var(--danger-bg)",
              color: "var(--danger-text)",
              fontSize: 11,
            }}
          >
            {publishError}
          </div>
        )}
        {publishResult && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${publishResult.status === "published" ? "var(--success-border)" : "var(--warning-border)"}`,
              background: publishResult.status === "published" ? "var(--success-bg)" : "var(--warning-bg)",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {publishResult.status === "published" ? "✅ Đã publish thành công" : "⏸ Bị chặn — chưa publish"}
            </div>
            {publishResult.status === "blocked" && (
              <div style={{ marginBottom: 4, color: "var(--warning-text)" }}>{publishResult.message}</div>
            )}
            {publishResult.scorecard && (
              <div style={{ fontFamily: "var(--font-mono)" }}>
                verdict={publishResult.scorecard.gate.verdict} · success_rate=
                {publishResult.scorecard.aggregate.success_rate.toFixed(2)} · citation_accuracy=
                {publishResult.scorecard.aggregate.citation_accuracy?.toFixed(2) ?? "n/a (chưa đo)"}
              </div>
            )}
          </div>
        )}

        {!violation && !notes.length && !testError && !trace && !evaluateError && !scorecard && !publishError && !publishResult && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--muted)" }}>
            Chưa có gì để hiện — bấm <strong>Test</strong>/<strong>Chấm điểm</strong>/
            <strong>Publish</strong> ở toolbar trên, hoặc chọn 1 node để sửa ở tab{" "}
            <strong>Node</strong> (panel trái).
          </div>
        )}
      </aside>
    </div>
  );
}

function CanvasView({
  session,
  showMiniMap,
  toolbarSlot,
}: {
  session: Session;
  showMiniMap: boolean;
  toolbarSlot: HTMLDivElement | null;
}) {
  // `useReactFlow()` (dùng trong `Studio` cho `screenToFlowPosition`) đòi provider ở trên nó.
  return (
    <ReactFlowProvider>
      <Studio session={session} showMiniMap={showMiniMap} toolbarSlot={toolbarSlot} />
    </ReactFlowProvider>
  );
}

/**
 * AppShell (Kế hoạch 1, B3) — cổng đăng nhập + chuyển màn hình "canvas"/"chat", không dùng thư
 * viện router nào (`apps/web` hiện không có `react-router` trong deps) — state đơn giản, cùng
 * kiểu 2 nút "canvas/mermaid" đã có sẵn trong `Studio`.
 *
 * Chưa đăng nhập (`session === null`) → CHỈ render `<LoginForm/>`, không render `Studio`/`ChatPage`
 * — đây là lý do `tenantId`/`roles` truyền xuống `CanvasView` luôn là string thật, không cần
 * optional-chaining rải khắp `Studio`.
 */
/** `"admin"` là 1 role như mọi role khác trong `session.roles` (không phải cờ riêng) — admin của
 * tenant X là user có role `"admin"` TRONG PHẠM VI đăng nhập của tenant X (đúng ranh giới "admin
 * công ty A không có quyền ở công ty B" — tenant fence vẫn áp dụng y hệt, chỉ thêm 1 lớp role
 * BÊN TRONG tenant đó). Role được gán lúc tạo tài khoản thật (`POST /api/admin/users`), không
 * phải thứ người đăng nhập tự chọn mỗi lần. */
function isAdmin(session: Session): boolean {
  return session.roles.includes("admin");
}

/** Superadmin (Kế hoạch 3) — role hệ thống, KHÔNG thuộc `SECTION_VOCAB ∪ {"admin"}`, tách biệt
 * hoàn toàn với `isAdmin` ở trên (admin công ty). Session này đến từ `POST /api/auth/login` +
 * `core.users` (`roles=["superadmin"]`, tenant `__system__`). */
function isSuperadmin(session: Session): boolean {
  return session.roles.includes("superadmin");
}

function AppShell() {
  const { session, logout } = useSession();
  const [screen, setScreen] = useState<"canvas" | "chat" | "admin">("canvas");
  const [showMiniMap, setShowMiniMap] = useState(true);
  // Nơi portal nhóm nút hành động của canvas (Nạp DAG mẫu/Xoá hết/Focus/Test/Chấm điểm/Publish)
  // lên GIỮA thanh trên cùng — thanh này span trọn chiều ngang trang (không nằm trong grid
  // panel trái/phải có thể co giãn), nên nhóm nút không còn bị bóp/tràn khi kéo panel nữa, đồng
  // thời đúng bố trí người dùng yêu cầu: mọi nút chính gom về 1 hàng cùng icon tài khoản.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

  if (session === null) {
    return <LoginForm />;
  }

  // Superadmin không thuộc công ty nào (tenant `__system__`) — không có canvas/chat nào để dùng,
  // toàn bộ phiên đăng nhập chỉ để tạo công ty mới. Kiểm TRƯỚC `isAdmin` vì 1 session không bao
  // giờ vừa "admin" vừa "superadmin" cùng lúc (`_USER_ROLE_VOCAB` không cho company-admin tự phong
  // superadmin, và `seed_superadmin.py` chỉ gán đúng `["superadmin"]`).
  if (isSuperadmin(session)) {
    return <CreateCompanyForm />;
  }

  // User thường: KHÔNG có thanh điều hướng/tab nào cả — chỉ 1 khung chat toàn màn hình, không
  // có gợi ý nào là "đang ở 1 tab trong nhiều tab" (nút đăng xuất nằm gọn trong ChatPage).
  if (!isAdmin(session)) {
    return <ChatPage onLogout={logout} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "var(--font-body)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: "13px 20px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LogoBadge />
          <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
            {(["canvas", "chat", "admin"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScreen(s)}
                disabled={screen === s}
                style={{
                  padding: "7px 15px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  borderRadius: 7,
                  border: "1px solid " + (screen === s ? "var(--accent)" : "var(--line)"),
                  background: screen === s ? "var(--accent)" : "transparent",
                  color: screen === s ? "#fff" : "var(--muted)",
                  cursor: screen === s ? "default" : "pointer",
                }}
              >
                {s === "canvas" ? "Canvas" : s === "chat" ? "Chat" : "Quản trị"}
              </button>
            ))}
          </div>
        </div>

        {/* Cột giữa (`1fr`) — nhóm nút hành động của canvas được portal vào đây (xem `Studio`),
            chỉ có nội dung khi đang ở tab Canvas. `minWidth: 0` + `overflowX: auto` là lưới an
            toàn giống hàng nút cũ trong `<main>` — phòng màn hình quá hẹp, KHÔNG để nó tự phình
            rộng hơn cột rồi tràn đè lên cột logo/avatar 2 bên. */}
        <div
          ref={setToolbarSlot}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minWidth: 0,
            overflowX: "auto",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeToggleButton />
          <UserMenu session={session} onLogout={logout} roleLabel="admin">
            {screen === "canvas" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px solid var(--line)",
                  fontSize: 12,
                  color: "var(--ink)",
                }}
              >
                Hiện minimap
                <ToggleSwitch checked={showMiniMap} onChange={setShowMiniMap} />
              </div>
            )}
          </UserMenu>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: screen === "admin" ? "auto" : undefined }}>
        {screen === "canvas" ? (
          <CanvasView session={session} showMiniMap={showMiniMap} toolbarSlot={toolbarSlot} />
        ) : screen === "chat" ? (
          <ChatPage embedded />
        ) : (
          <CreateUserForm />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <AppShell />
      </SessionProvider>
    </ThemeProvider>
  );
}

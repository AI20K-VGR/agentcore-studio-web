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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from "reactflow";
import "reactflow/dist/style.css";

import AgentFrameNode, { AGENT_FRAME_DRAG_HANDLE } from "./canvas/AgentFrameNode";
import EdgeConfigModal from "./canvas/EdgeConfigModal";
import NodeConfigModal from "./canvas/NodeConfigModal";
import Palette, { DND_MIME } from "./canvas/Palette";
import RecipeNode from "./canvas/RecipeNode";
import { useMinimapVisible } from "./canvas/minimapPref";
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
  edgesForFrame,
  nodesForFrame,
  type AgentFrameData,
  type CanvasEdgeData,
  type CanvasNodeData,
  type RecipeHeader,
} from "./recipe/fromCanvas";
import { advisories, graphLint } from "./recipe/graphLint";
import { DEFAULT_HEADER, sampleGraph } from "./recipe/sample";
import TraceViewer from "./playground/TraceViewer";
import Login from "./auth/Login";
import { SessionProvider, useSession, type Session } from "./auth/session";
import ChatPage from "./chat/ChatPage";
import { fetchTrace, publishAgent, runRecipe, type PublishResult, type StudioRunResponse } from "./studio/api";
import { StudioApiError } from "./httpUtil";
import SuperadminConsole from "./superadmin/SuperadminConsole";
import EmployeesTab from "./admin/EmployeesTab";
import SectionsTab from "./admin/SectionsTab";
import AgentsRollbackTab from "./admin/AgentsRollbackTab";
import DocumentsTab from "./admin/DocumentsPlaceholderTab";
import {
  BotIcon,
  BroadcastIcon,
  CheckCircleIcon,
  ChatBubbleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DocumentIcon,
  GridIcon,
  PauseCircleIcon,
  PeopleIcon,
  PlayIcon,
  WarningTriangleIcon,
  XCircleIcon,
} from "./icons";
import { BrandBar } from "./components/BrandBar";
import { Card } from "./components/Card";

// Định nghĩa ngoài component: React Flow so sánh `nodeTypes` theo tham chiếu và cảnh báo
// (kèm remount toàn bộ node) nếu object mới được tạo lại mỗi lần render.
const NODE_TYPES_MAP = { recipeNode: RecipeNode, agentFrame: AgentFrameNode };

// Kích thước khung agent — CỐ ĐỊNH (không resize được ở bản này, xem plan "cắt phạm vi") — đủ
// rộng cho vài node xếp dọc, khung mới luôn trống nên kích thước cố định không phải vấn đề tới
// khi cần resize thật (đợt sau). `HEADER` chừa chỗ cho thanh tiêu đề khung, node con đầu tiên bắt
// đầu dưới nó, không đè lên.
const FRAME_WIDTH = 900;
const FRAME_HEIGHT = 560;
const FRAME_HEADER = 40;
const FRAME_GAP = 60;

const DEFAULT_EDGE_OPTIONS = {
  markerEnd: { type: MarkerType.ArrowClosed },
  // Vùng bắt chuột rộng hơn hẳn NÉT VẼ (mặc định react-flow chỉ ~cỡ nét vẽ, rất khó bấm trúng
  // 1 đường cong mảnh) — bấm đúp để mở modal giờ cần trúng đích dễ hơn, không phải rê chuột dò
  // từng pixel dọc theo cạnh.
  interactionWidth: 28,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "5px 7px",
  fontSize: 12,
  borderRadius: 4,
  border: "1px solid var(--line-strong)",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
};

const sectionStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--ink-soft)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  margin: "14px 0 6px",
  paddingBottom: 3,
  borderBottom: "1px solid var(--line)",
};

const PANEL_MIN = 200;
const PANEL_MAX = 480;
// Thu gọn = đóng HẲN về 0, không còn dải 44px mờ mờ nữa (phản hồi: "thu gọn phải đóng toàn bộ về
// 2 bên") — nút mở lại giờ nổi độc lập trên canvas (`PanelCollapseButton`), không còn sống bên
// trong `aside` nên không cần chừa chỗ cho nó qua bề rộng cột.
const PANEL_COLLAPSED = 0;

/** Vạch kéo-resize, nằm đè lên cạnh trong của 1 aside — `onMouseDown` bắt đầu 1 drag session bằng
 * `window` listener (mousemove/mouseup), KHÔNG dùng thư viện resize nào (`apps/web` không có
 * dependency đó) — cùng tinh thần "không thêm dependency" như DND_MIME của Palette.
 *
 * Cơ chế kéo-thả TỰ nó đã đúng ngay từ đầu (xác nhận bằng test thật: mousedown → mousemove →
 * mouseup qua `dispatchEvent`, có đợi 1 nhịp cho React flush thì width đổi đúng) — cái THIẾU là
 * người dùng không TÌM RA nó: bản trước chỉ rộng 6px và HOÀN TOÀN vô hình (chỉ đổi con trỏ chuột
 * khi rê trúng), không có gợi ý thị giác nào. Bản này: vùng bắt chuột rộng hơn (10px) + có 1 vạch
 * MẢNH luôn hiện (mờ) và SÁNG RÕ hẳn lên khi hover/đang kéo — đúng quy ước resizer quen thuộc
 * (VSCode, Figma...), không còn phải đoán mò. */
function ResizeHandle({ side, onResize }: { side: "left" | "right"; onResize: (deltaPx: number) => void }) {
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const active = hover || dragging;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(startEvent) => {
        startEvent.preventDefault();
        setDragging(true);
        let lastX = startEvent.clientX;
        const onMove = (moveEvent: MouseEvent) => {
          const deltaX = moveEvent.clientX - lastX;
          lastX = moveEvent.clientX;
          // Kéo sang phải: panel trái NỚI RỘNG (delta dương), panel phải THU HẸP (delta âm) —
          // đảo dấu cho panel phải để "kéo" luôn nới rộng panel đang cầm, không phụ thuộc hướng.
          onResize(side === "left" ? deltaX : -deltaX);
        };
        const onUp = () => {
          setDragging(false);
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      title="Kéo để đổi chiều rộng panel"
      style={{
        // KHÔNG lệch âm ra ngoài biên (từng thử `-3`) — 1 phần tử tràn ra ngoài box của 1 aside
        // có `overflow-x: hidden` bị chính trình duyệt tính vào vùng scrollable-overflow rồi che/
        // chặn pointer event của chính nó (bug thật gặp phải, không phải giả thuyết) dù mắt vẫn
        // thấy nó "nổi" lên trên viền. Đặt hẳn vào TRONG biên (0, không âm) để tránh cả lớp lỗi
        // này — vẫn nằm sát viền vì aside chỉ có border 1px.
        position: "absolute",
        top: 0,
        bottom: 0,
        [side === "left" ? "right" : "left"]: 0,
        width: 10,
        cursor: "col-resize",
        zIndex: 6,
        display: "flex",
        justifyContent: side === "left" ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          width: active ? 3 : 1,
          height: "100%",
          background: active ? "var(--tier-admin)" : "var(--line-strong)",
          opacity: active ? 1 : 0.6,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/** Nút tròn mở/thu panel — nổi ĐỘC LẬP trên canvas (con trực tiếp của lưới 3 cột, không còn sống
 * bên trong `aside`), vì thu gọn giờ đóng `aside` về hẳn 0px (`PANEL_COLLAPSED`) — nếu nút còn nằm
 * trong `aside` nó sẽ mất theo (`overflow: hidden` cắt luôn thứ rộng 26px trong 1 box rộng 0px).
 * `panelWidth` (bề rộng panel LÚC ĐANG MỞ) dùng để tính toạ độ nổi: mở → bám sát biên trong của
 * panel (đúng vị trí cũ); thu gọn → chỉ còn cách mép màn hình 8px.
 *
 * Đặt tách khỏi `ResizeHandle` (khác hành vi: bấm = toggle, kéo = resize).
 *
 * 3 lần sửa sau các báo cáo thật:
 * (1) Ghim `top` CỐ ĐỊNH gần đỉnh thay vì `top:"50%"` — canh giữa theo chiều cao render ra 1 vị
 *     trí PHỤ THUỘC nội dung bên dưới nó dài hay ngắn, từng trùng đúng lên nút Publish (ảnh chụp
 *     thật xác nhận: nút tròn nổi đè lên giữa nút Publish màu cam).
 * (2) Màu accent rõ ràng (viền + nền tier-admin) thay vì viền/nền xám nhạt gần như cùng tông với
 *     nền `--paper`/`--surface` xung quanh — bản cũ đúng nghĩa "vô hình" khi panel đang thu gọn
 *     (khớp đúng report: nút vẫn ở đó, chỉ là không ai nhìn ra).
 * (3) Lúc thu gọn, nút "mờ mờ" (opacity thấp) cho đỡ chiếm mắt trên canvas, rõ hẳn lên khi hover —
 *     KHÔNG mờ khi đang mở (panel còn hiện, nút là 1 phần rõ ràng của panel, không cần mờ). */
function PanelCollapseButton({
  side,
  collapsed,
  panelWidth,
  onToggle,
}: {
  side: "left" | "right";
  collapsed: boolean;
  panelWidth: number;
  onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  // Panel trái: collapsed → mũi tên chỉ phải (mở ra); mở → mũi tên chỉ trái (thu vào). Panel
  // phải thì ngược lại.
  const pointsRight = side === "left" ? collapsed : !collapsed;
  const edgeOffset = collapsed ? 8 : panelWidth - 34;
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={collapsed ? "Mở rộng panel" : "Thu gọn panel"}
      style={{
        position: "absolute",
        top: 12,
        [side]: edgeOffset,
        zIndex: 20,
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        border: "1.5px solid var(--tier-admin)",
        background: "var(--tier-admin-soft)",
        color: "var(--tier-admin)",
        boxShadow: "var(--shadow-md)",
        cursor: "pointer",
        padding: 0,
        opacity: collapsed && !hover ? 0.55 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      {pointsRight ? <ChevronRightIcon size={14} /> : <ChevronLeftIcon size={14} />}
    </button>
  );
}

function Studio({ session }: { session: Session }) {
  const tenantId = session.tenantId;
  const roles = session.roles;
  const reactFlowInstance = useReactFlow();
  // `scope` suy từ session — dùng chung cho MỌI khung agent trên canvas, không phải field riêng
  // từng khung (giữ đúng lý do cũ: `interpreter.run()` ghi đè `section_roles` theo session dù sao
  // đi nữa, xem comment gốc từng ở đây trước khi canvas hỗ trợ nhiều agent).
  const scope = roles.length > 0 ? `t/${roles.join(",")}` : "t/";

  // Khung agent mặc định bọc sẵn DAG mẫu — CHỈ dựng ở state khởi tạo của component này, KHÔNG đụng
  // `sampleGraph()`/`DEFAULT_HEADER` hay hình dạng nó trả về: `scripts/emit-fixture.ts` và
  // `scripts/check-lint-parity.ts` gọi THẲNG `buildRecipe(DEFAULT_HEADER, ...sampleGraph())` trên
  // đúng hình dạng DAG PHẲNG (không khung) để sinh `packages/workbench/tests/fixtures/
  // canvas_export_d12.json` — đổi hình dạng `sampleGraph()` sẽ làm gãy fixture đó âm thầm.
  const initial = useMemo(() => {
    const { nodes: dagNodes, edges: dagEdges } = sampleGraph();
    const frameId = "frame-1";
    const frameData: AgentFrameData = {
      agentId: DEFAULT_HEADER.agent_id,
      instructions: DEFAULT_HEADER.instructions,
      model: DEFAULT_HEADER.model,
      toolWhitelist: DEFAULT_HEADER.tool_whitelist,
      kbId: DEFAULT_HEADER.kb_id,
      goldenSetRef: DEFAULT_HEADER.golden_set_ref,
      successThreshold: DEFAULT_HEADER.scorecard_threshold.success,
      citationThreshold: DEFAULT_HEADER.scorecard_threshold.citation_accuracy,
    };
    // Node khung PHẢI đứng TRƯỚC node con của nó trong mảng `nodes` (react-flow đòi vậy khi dùng
    // `parentId`) — đặt đầu mảng, node mẫu nối sau. `data` của node khung không khớp
    // `CanvasNodeData` (nó là `AgentFrameData`) — ép kiểu qua `unknown`, cùng cách file này đã ép
    // `MiniMap`'s `nodeColor` đọc `n.data as CanvasNodeData`: react-flow tự dispatch theo `type`
    // sang đúng component render (`AgentFrameNode` cho khung, `RecipeNode` cho node DAG), nên
    // "nói dối" kiểu ở tầng TS không bao giờ chạm runtime thật.
    const frameNode = {
      id: frameId,
      type: "agentFrame",
      position: { x: 0, y: 0 },
      style: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      dragHandle: `.${AGENT_FRAME_DRAG_HANDLE}`,
      data: frameData as unknown as CanvasNodeData,
    };
    // Toạ độ node mẫu chuyển sang HỆ TOẠ ĐỘ TƯƠNG ĐỐI của khung (react-flow tự hiểu `position` là
    // tương đối tới parent khi có `parentId`) — cộng thêm chỗ chừa cho thanh tiêu đề khung.
    const framedNodes = dagNodes.map((node) => ({
      ...node,
      parentId: frameId,
      // `[[minX,minY],[maxX,maxY]]` tương đối tới khung cha (vì có `parentId`) — chặn `minY` ở
      // `FRAME_HEADER` để không kéo node đè lên thanh tiêu đề khung (trước dùng `"parent"`, cho
      // phép kéo tới tận y=0, đè mất tên agent ở góc trái trên).
      extent: [
        [0, FRAME_HEADER],
        [FRAME_WIDTH, FRAME_HEIGHT],
      ] as [[number, number], [number, number]],
      position: { x: node.position.x, y: node.position.y + FRAME_HEADER },
    }));
    return { nodes: [frameNode, ...framedNodes], edges: dagEdges };
  }, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdgeData>(initial.edges);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // Khung agent ĐANG SỬA — quyết định: node Palette mới vào khung nào, sidebar phải (graph-lint/
  // Test/Publish) tính recipe của khung nào, "Cấu hình Agent" sửa khung nào. Bấm 1 khung HOẶC 1
  // node DAG bên trong khung đó đều cập nhật biến này (đồng bộ ngữ cảnh, không bắt phải bấm đúng
  // thanh tiêu đề mới đổi được agent đang thao tác).
  const [activeFrameId, setActiveFrameId] = useState<string | null>("frame-1");
  // Bấm 1 node/cạnh trên canvas mở thẳng cửa sổ cấu hình tương ứng (cùng mẫu `configOpen`/"Cấu
  // hình Agent" bên dưới) — cột phải không còn "Inspector" nữa, cả 2 loại đều qua modal.
  const [nodeConfigOpen, setNodeConfigOpen] = useState(false);
  const [edgeConfigOpen, setEdgeConfigOpen] = useState(false);
  const minimapVisible = useMinimapVisible();

  // Panel trái/phải tự thu gọn/resize (phản hồi redesign) — độ rộng + trạng thái collapse sống
  // riêng cho từng bên, không ảnh hưởng `1fr` ở giữa (canvas luôn ăn hết phần còn lại).
  const [leftWidth, setLeftWidth] = useState(236);
  const [rightWidth, setRightWidth] = useState(256);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // D15 (issue kit#102) — Playground: bấm Test → interpreter chạy → trace viewer hiện.
  const [testState, setTestState] = useState<"idle" | "running" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [trace, setTrace] = useState<StudioRunResponse | null>(null);

  // Publish (Kế hoạch 2, A4 backend + phần UI còn thiếu tới giờ) — tách state riêng khỏi
  // testState: Test và Publish là 2 hành động độc lập, có thể chạy lệch pha nhau.
  const [publishState, setPublishState] = useState<"idle" | "running" | "error">("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  // Cấu hình agent (identity/agent_config/kb_binding/eval gate) không còn nhồi trong cột trái
  // 236px — 10 field (textarea, dropdown, checkbox, số) bị bóp vào cột đó đọc rất rối. Chuyển
  // thành 1 modal rộng (`AgentConfigModal` bên dưới), mở bằng nút "Cấu hình Agent" — cột trái
  // chỉ còn giữ đúng 1 việc: Palette để kéo/thả node vào canvas.
  const [configOpen, setConfigOpen] = useState(false);

  // Header (identity/agent_config/kb_binding/eval gate) KHÔNG còn là state phẳng của `Studio` —
  // mỗi khung agent tự giữ đúng phần đó trong `data` của node khung (`AgentFrameData`). Đọc/ghi
  // qua khung `activeFrameId` — `onHeaderChange` bên dưới cập nhật `data` của ĐÚNG node khung đó.
  const activeFrame = nodes.find((node) => node.id === activeFrameId);
  const activeFrameData = activeFrame ? (activeFrame.data as unknown as AgentFrameData) : null;

  const onHeaderChange = useCallback(
    (patch: Partial<AgentFrameData>) => {
      if (!activeFrameId) return;
      setNodes((current) =>
        current.map((node) =>
          node.id === activeFrameId
            ? { ...node, data: { ...(node.data as unknown as AgentFrameData), ...patch } as unknown as CanvasNodeData }
            : node,
        ),
      );
    },
    [activeFrameId, setNodes],
  );

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
    (type: NodeType) => {
      // Không có khung active thì không thêm được node nào — sidebar bên trái hiện gợi ý "Chọn
      // hoặc tạo 1 agent trước" thay vì im lặng bỏ qua click (xem cột trái bên dưới).
      if (!activeFrameId) return;
      const id = nextNodeId();
      setNodes((current) => {
        const siblingCount = current.filter(
          (node) => node.type !== "agentFrame" && node.parentId === activeFrameId,
        ).length;
        return [
          ...current,
          {
            id,
            type: "recipeNode",
            parentId: activeFrameId,
            // Chặn `minY` ở `FRAME_HEADER` — không cho kéo node đè lên thanh tiêu đề khung (xem
            // giải thích ở `initial` useMemo phía trên).
            extent: [
              [0, FRAME_HEADER],
              [FRAME_WIDTH, FRAME_HEIGHT],
            ] as [[number, number], [number, number]],
            // Toạ độ TƯƠNG ĐỐI trong khung (react-flow tự hiểu vậy khi có `parentId`) — xếp chồng
            // dọc theo thứ tự thêm vào, đủ dùng cho khung kích thước cố định (`FRAME_WIDTH`/
            // `FRAME_HEIGHT`). Vị trí con trỏ chuột lúc thả KHÔNG quyết định khung nào nhận node
            // (đã chốt thiết kế: chọn khung active trước, kéo/thả hay bấm Palette đều vào đúng
            // khung đó, không cần tính giao nhau hình học).
            position: { x: 40, y: FRAME_HEADER + 30 + siblingCount * 110 },
            data: { type, params: defaultParams(type) },
          },
        ];
      });
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
    },
    [activeFrameId, nextNodeId, setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      // `addEdge` của reactflow v11 không generic (trả `Edge<any>[]`); nó tự sinh `id` cho cạnh
      // mới và bỏ qua cạnh trùng. `data.when` khởi tạo `null` = cạnh vô điều kiện. Không cần tự
      // chặn cạnh nối 2 khung khác nhau ở đây — `edgesForFrame` lúc build recipe đã lọc bỏ mọi
      // cạnh không có ĐỦ 2 đầu cùng 1 khung, nên 1 cạnh bắc sai khung chỉ đơn giản KHÔNG được tính
      // vào recipe nào cả (không crash, không cần validate lúc kéo).
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
      // Vị trí thả chuột KHÔNG quyết định khung nào nhận node (đã chốt thiết kế) — luôn vào khung
      // active, cùng đường `addNode` gọi từ Palette.
      addNode(raw as NodeType);
    },
    [addNode],
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
      const target = nodes.find((node) => node.id === nodeId);
      const isFrame = target?.type === "agentFrame";
      // Xoá khung = xoá CẢ khung lẫn mọi node DAG con của nó (cascade) — 1 node DAG "mồ côi"
      // (parentId trỏ tới khung không còn tồn tại) là trạng thái react-flow không định nghĩa rõ,
      // và về logic cũng vô nghĩa: không khung nào sở hữu thì node đó không thuộc agent nào cả.
      const removedIds = new Set(
        isFrame
          ? [nodeId, ...nodes.filter((node) => node.parentId === nodeId).map((node) => node.id)]
          : [nodeId],
      );
      setNodes((current) => current.filter((node) => !removedIds.has(node.id)));
      // Xoá luôn cạnh dính bất kỳ node nào vừa xoá. Nếu để lại, chúng thành cạnh treo và
      // graph-lint sẽ báo lỗi "edge-destination" — đúng luật, nhưng đổ lỗi cho người dùng vì việc
      // UI tự gây ra.
      setEdges((current) =>
        current.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target)),
      );
      setSelectedNodeId(null);
      setActiveFrameId((current) => (current === nodeId ? null : current));
    },
    [nodes, setEdges, setNodes],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      setSelectedEdgeId(null);
    },
    [setEdges],
  );

  // Tạo 1 khung agent mới — hỏi tên qua `window.prompt` (đơn giản, cùng mức "hộp thoại trình
  // duyệt trần" đã dùng cho "Xoá agent đang chọn" bên dưới, không cần modal riêng cho việc gõ
  // đúng 1 chuỗi). Khung mới LUÔN trống (chưa có node con nào) nên thêm vào CUỐI mảng `nodes`
  // luôn hợp lệ — ràng buộc "khung phải đứng trước con của nó" của react-flow chỉ có ý nghĩa khi
  // đã có con, và node con thêm sau này (`addNode`) cũng luôn nối vào cuối mảng.
  const frameIdCounter = useRef(1);
  // Khung mới thường tạo ở x = frameCount * (FRAME_WIDTH + FRAME_GAP) — ngoài khung nhìn hiện tại
  // nếu đã có ≥1 khung từ trước, và `fitView` của `<ReactFlow>` CHỈ chạy đúng 1 lần lúc mount, nên
  // tạo khung xong không tự lia camera tới. Ghi id khung vừa tạo vào đây, `useEffect` bên dưới đợi
  // nó xuất hiện trong `nodes` (sau khi `setNodes` render xong) rồi mới `fitView` tới đúng khung đó.
  const pendingFocusFrameId = useRef<string | null>(null);
  const createFrame = useCallback(() => {
    const name = window.prompt("Tên agent (agent_id):", "");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const taken = new Set(nodes.map((node) => node.id));
    let id: string;
    do {
      frameIdCounter.current += 1;
      id = `frame-${frameIdCounter.current}`;
    } while (taken.has(id));
    const frameCount = nodes.filter((node) => node.type === "agentFrame").length;
    const frameData: AgentFrameData = {
      agentId: trimmed,
      instructions: "",
      model: DEFAULT_HEADER.model,
      toolWhitelist: [],
      kbId: "",
      goldenSetRef: DEFAULT_HEADER.golden_set_ref,
      successThreshold: DEFAULT_HEADER.scorecard_threshold.success,
      citationThreshold: DEFAULT_HEADER.scorecard_threshold.citation_accuracy,
    };
    setNodes((current) => [
      ...current,
      {
        id,
        type: "agentFrame",
        // Khung mới tự xếp cạnh khung cuối cùng (trái→phải) — không cần thuật toán layout, chỉ
        // cần không đè lên khung đã có.
        position: { x: frameCount * (FRAME_WIDTH + FRAME_GAP), y: 0 },
        style: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
        dragHandle: `.${AGENT_FRAME_DRAG_HANDLE}`,
        data: frameData as unknown as CanvasNodeData,
      },
    ]);
    setActiveFrameId(id);
    pendingFocusFrameId.current = id;
  }, [nodes, setNodes]);

  // Lia camera tới khung vừa tạo (xem lý do ở khai báo `pendingFocusFrameId` phía trên) — chỉ chạy
  // khi có yêu cầu đang chờ VÀ node đó đã thật sự có trong `nodes` (tránh gọi `fitView` với id
  // chưa tồn tại, `getNodes()` bên trong nó sẽ trả rỗng và không làm gì cả).
  useEffect(() => {
    const targetId = pendingFocusFrameId.current;
    if (!targetId) return;
    if (!nodes.some((node) => node.id === targetId)) return;
    pendingFocusFrameId.current = null;
    reactFlowInstance.fitView({ nodes: [{ id: targetId }], duration: 400, padding: 0.5, maxZoom: 1 });
  }, [nodes, reactFlowInstance]);

  // Backspace/Delete xoá node/cạnh ĐANG CHỌN — dùng đúng `deleteNode`/`deleteEdge` (cùng logic
  // dọn cạnh treo/xoá chọn với nút "Xoá node"/"Xoá cạnh" trong modal), không dựa vào cơ chế xoá
  // mặc định của react-flow (nó chỉ biết xoá đúng phần tử, không tự dọn cạnh treo theo node).
  // Bỏ qua khi đang gõ trong 1 field (input/textarea/select) — Backspace ở đó phải xoá KÝ TỰ, và
  // bỏ qua khi 1 trong 2 modal cấu hình đang mở (đã có nút "Xoá node"/"Xoá cạnh" riêng ở đó rồi).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (nodeConfigOpen || edgeConfigOpen) return;
      if (selectedNodeId) {
        event.preventDefault();
        deleteNode(selectedNodeId);
      } else if (selectedEdgeId) {
        event.preventDefault();
        deleteEdge(selectedEdgeId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId, selectedEdgeId, nodeConfigOpen, edgeConfigOpen, deleteNode, deleteEdge]);

  // Recipe của ĐÚNG khung đang active — lọc theo `parentId` (xem `nodesForFrame`/`edgesForFrame`),
  // KHÔNG phải toàn bộ canvas nữa (canvas giờ có thể chứa nhiều agent cùng lúc). Không có khung
  // nào active thì không có recipe nào để Test/Publish/graph-lint — `null`, JSX bên dưới tự hiện
  // trạng thái tương ứng thay vì giả vờ có 1 recipe rỗng.
  const activeFrameNodes = useMemo(
    () => (activeFrameId ? nodesForFrame(activeFrameId, nodes) : []),
    [activeFrameId, nodes],
  );
  const activeFrameEdges = useMemo(
    () => (activeFrameId ? edgesForFrame(activeFrameId, nodes, edges) : []),
    [activeFrameId, nodes, edges],
  );

  const header: RecipeHeader | null = activeFrameData
    ? {
        agent_id: activeFrameData.agentId,
        tenant_id: tenantId,
        instructions: activeFrameData.instructions,
        model: activeFrameData.model,
        tool_whitelist: activeFrameData.toolWhitelist,
        kb_id: activeFrameData.kbId,
        scope,
        golden_set_ref: activeFrameData.goldenSetRef,
        scorecard_threshold: {
          success: activeFrameData.successThreshold,
          citation_accuracy: activeFrameData.citationThreshold,
        },
      }
    : null;

  const recipe: WireRecipe | null = useMemo(
    () => (header ? buildRecipe(header, activeFrameNodes, activeFrameEdges) : null),
    // `header` được dựng mới mỗi render nên không đưa thẳng vào deps — liệt kê qua object gốc
    // (`activeFrameData`) + phần lọc theo khung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFrameData, tenantId, scope, activeFrameNodes, activeFrameEdges],
  );

  const violation = useMemo(() => (recipe ? graphLint(recipe) : null), [recipe]);
  const notes = useMemo(() => (recipe ? advisories(recipe) : []), [recipe]);

  const handleTest = useCallback(async () => {
    if (!recipe) return;
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

  const handlePublish = useCallback(async () => {
    if (!recipe) return;
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
    <>
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `${leftCollapsed ? PANEL_COLLAPSED : leftWidth}px 1fr ${rightCollapsed ? PANEL_COLLAPSED : rightWidth}px`,
        // `100%` của cha (`AdminConsole`'s `flex:1` bên dưới BrandBar+tab row), KHÔNG phải
        // `100vh/100vw` — Studio giờ luôn nằm LỒNG trong AdminConsole (không còn là màn gốc như
        // bản D12 cũ). `100vh/100vw` ở đây cao/rộng HƠN khoảng trống thật còn lại (dư đúng bằng
        // chiều cao BrandBar+tab row), đẩy trang phải cuộn dọc — và trên Windows, thanh cuộn dọc
        // ăn vào bề rộng viewport thật, khiến `100vw` tràn ngang theo, cắt mất panel phải (đúng
        // bug người dùng báo: "mất bên phải").
        height: "100%",
        width: "100%",
        fontFamily: "var(--font-body)",
        color: "var(--ink)",
        background: "var(--paper)",
      }}
    >
      {/* ---------------- CỘT TRÁI: CHỈ palette — cấu hình agent chuyển sang modal riêng ---------------- */}
      <aside
        style={{
          position: "relative",
          // `minWidth: 0` đè `min-width: auto` mặc định của grid item — thiếu dòng này, aside
          // KHÔNG chịu co về 0 thật (padding/border vẫn ép ra 1 kích thước tối thiểu > 0 dù cột
          // lưới đã đặt 0px), đẩy tổng bề rộng 3 cột tràn quá 100% và cả trang phải cuộn ngang
          // (đúng bug người dùng báo: "tràn sang 2 bên, phải dùng thanh scroll ngang").
          minWidth: 0,
          borderRight: leftCollapsed ? "none" : "1px solid var(--line)",
          padding: leftCollapsed ? 0 : 14,
          overflowY: leftCollapsed ? "hidden" : "auto",
          overflowX: "hidden",
          background: "var(--surface-2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!leftCollapsed && (
          <>
            <h2 style={{ fontSize: 15, margin: 0, marginBottom: 10, fontFamily: "var(--font-display)", fontWeight: 600 }}>
              Workbench
            </h2>

            <button
              type="button"
              onClick={createFrame}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                marginBottom: 10,
                padding: "9px 10px",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 7,
                border: "1px dashed var(--tier-admin)",
                background: "var(--surface)",
                color: "var(--tier-admin)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              <BotIcon size={15} /> Tạo agent
            </button>

            <Palette onAdd={(type) => addNode(type)} />
            {!activeFrameId && (
              <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 6 }}>
                Chọn hoặc tạo 1 agent trước khi thêm node — bấm vào thanh tiêu đề 1 khung trên
                canvas, hoặc bấm "Tạo agent" ở trên.
              </div>
            )}

            <div style={sectionStyle}>Agent đang sửa</div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: activeFrameData ? "var(--ink)" : "var(--ink-faint)",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "6px 8px",
                wordBreak: "break-all",
              }}
            >
              {activeFrameData ? activeFrameData.agentId || "(chưa đặt tên)" : "Chưa chọn agent nào"}
            </div>
            {/* Không còn nút "Cấu hình Agent"/"Xoá agent đang chọn" riêng — bấm ĐÚP vào thanh
                tiêu đề khung trên canvas mở thẳng `AgentConfigModal` (đã có nút Xoá node/khung
                trong chính modal đó cho node DAG; xoá cả khung agent thì chọn khung rồi bấm
                Backspace/Delete, cùng cơ chế đã dùng cho node DAG). Gợi ý ở đây để KHÔNG lặp lại
                bài học "hành động có thật nhưng không ai tìm ra" đã gặp với nút thu gọn panel. */}
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 6 }}>
              Bấm đúp vào tiêu đề khung trên canvas để sửa agent; chọn khung rồi bấm Backspace để
              xoá cả agent đó.
            </div>

            <div style={{ flexGrow: 1 }} />
          </>
        )}
        {!leftCollapsed && (
          <ResizeHandle
            side="left"
            onResize={(deltaPx) =>
              setLeftWidth((current) => Math.min(PANEL_MAX, Math.max(PANEL_MIN, current + deltaPx)))
            }
          />
        )}
      </aside>

      {/* Nổi trên canvas, KHÔNG còn sống trong aside — thu gọn giờ đóng aside về 0px thật, nút
          sống trong đó sẽ biến mất theo (xem comment `PanelCollapseButton`). */}
      <PanelCollapseButton
        side="left"
        collapsed={leftCollapsed}
        panelWidth={leftWidth}
        onToggle={() => setLeftCollapsed((c) => !c)}
      />

      {/* ---------------- CỘT GIỮA: canvas — full chiều cao, không còn thanh công cụ riêng che
          mất chỗ (nút "Xoá hết" chuyển sang cột trái, xem `sectionStyle` "Dọn canvas") ---------------- */}
      <main style={{ display: "flex", flexDirection: "column", minWidth: 0, background: "var(--paper)" }}>
        <div style={{ flexGrow: 1, minHeight: 0 }} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={NODE_TYPES_MAP}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            proOptions={{ hideAttribution: true }}
            // Tắt hẳn cơ chế Backspace/Delete MẶC ĐỊNH của react-flow — nó chỉ biết xoá đúng
            // phần tử được chọn theo MODEL SELECTION riêng của nó (`node.selected`), khác hẳn
            // `selectedNodeId`/`selectedEdgeId` app tự quản, và quan trọng hơn: listener của nó
            // nuốt mất sự kiện phím trước khi tới được `window` (xem `useEffect` Backspace bên
            // trên `Studio`) — 2 cơ chế đụng nhau, chỉ giữ đúng 1.
            deleteKeyCode={null}
            onNodeClick={(_, node) => {
              if (node.type === "agentFrame") {
                // Bấm thanh tiêu đề khung = chọn khung đó làm "agent đang sửa" — không mở
                // `NodeConfigModal` (sai hình dạng, đó là modal cho param của 1 node DAG).
                setActiveFrameId(node.id);
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
                return;
              }
              // Bấm 1 lần CHỈ chọn (viền sáng lên) — mở cửa sổ cấu hình cần bấm ĐÚP
              // (`onNodeDoubleClick`), tránh mở nhầm cửa sổ chỉ vì đang muốn chọn/ngắm node. Bấm
              // 1 node DAG cũng đồng bộ luôn "agent đang sửa" theo khung sở hữu nó (`parentId`) —
              // sidebar/Test/Publish luôn khớp đúng agent đang thao tác, không bắt phải bấm riêng
              // vào thanh tiêu đề khung mới đổi được ngữ cảnh.
              if (node.parentId) setActiveFrameId(node.parentId);
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onNodeDoubleClick={(_, node) => {
              if (node.type === "agentFrame") {
                setActiveFrameId(node.id);
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
                setConfigOpen(true);
                return;
              }
              if (node.parentId) setActiveFrameId(node.parentId);
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
              setNodeConfigOpen(true);
            }}
            onEdgeClick={(_, edge) => {
              const ownerFrameId = nodes.find((n) => n.id === edge.source)?.parentId;
              if (ownerFrameId) setActiveFrameId(ownerFrameId);
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onEdgeDoubleClick={(_, edge) => {
              const ownerFrameId = nodes.find((n) => n.id === edge.source)?.parentId;
              if (ownerFrameId) setActiveFrameId(ownerFrameId);
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
              setEdgeConfigOpen(true);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            fitView
          >
            <Background />
            <Controls />
            {minimapVisible && (
              <MiniMap
                pannable
                zoomable
                className="lol-minimap"
                // Node khung không có `type` thuộc 6 loại đóng (`nodeSpec` sẽ raise nếu tra thẳng)
                // — VÀ khung luôn to hơn hẳn node DAG bên trong nó, tô ĐẶC màu (như 6 node DAG)
                // sẽ che kín các blip con bên trong (đã gặp thật: cả minimap thành 1 khối vàng
                // đặc). Để trong suốt — chỉ còn viền mảnh (`nodeStrokeColor` chung bên dưới) đọc
                // được "đây là biên 1 agent" mà không đè lên node con.
                nodeColor={(n) => (n.type === "agentFrame" ? "transparent" : nodeSpec((n.data as CanvasNodeData).type).color)}
                nodeStrokeColor="rgba(255,255,255,0.45)"
                nodeStrokeWidth={1.5}
                nodeBorderRadius={6}
                maskColor="rgba(8,14,24,0.6)"
                maskStrokeColor="#C8AA6E"
                maskStrokeWidth={1.5}
                ariaLabel="Minimap kiểu Hextech"
              />
            )}
          </ReactFlow>
        </div>
      </main>

      {/* ---------------- CỘT PHẢI: lint + inspector + export ---------------- */}
      <aside
        style={{
          position: "relative",
          // `minWidth: 0` — cùng lý do đã ghi ở aside trái, đè `min-width: auto` mặc định của
          // grid item để thu gọn thật sự co về 0px, không tràn ngang.
          minWidth: 0,
          borderLeft: rightCollapsed ? "none" : "1px solid var(--line)",
          // Nút thu gọn/mở giờ nổi độc lập trên canvas (không còn sống trong aside này), nên
          // không cần chừa `paddingTop` riêng để né nó nữa — về lại padding đều 4 cạnh như cột
          // trái (bản cũ từng phải chừa 40px chỉ vì nút còn nằm trong chính aside).
          padding: rightCollapsed ? 0 : 14,
          overflowY: rightCollapsed ? "hidden" : "auto",
          overflowX: "hidden",
          background: "var(--surface-2)",
        }}
      >
      {/* Nội dung ẩn qua `display:none` thay vì unmount khi thu gọn — giữ nguyên state Trace/Test/
          Publish bên trong, mở lại là thấy đúng chỗ cũ, không mất gì. */}
      <div style={{ display: rightCollapsed ? "none" : "block" }}>
      {recipe ? (
        <>
        <div
          style={{
            padding: 10,
            borderRadius: 6,
            border: "1px solid " + (violation ? "var(--bad)" : "var(--good)"),
            background: violation ? "var(--bad-soft)" : "var(--good-soft)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 700,
              fontSize: 12,
              color: violation ? "var(--bad)" : "var(--good)",
            }}
          >
            {violation ? <XCircleIcon size={14} /> : <CheckCircleIcon size={14} />}
            {violation ? "graph-lint: TỪ CHỐI" : "graph-lint: 7/7 luật sạch"}
          </div>
          {violation ? (
            <div style={{ fontSize: 12, marginTop: 5 }}>
              <code style={{ fontSize: 11, color: "var(--bad)" }}>[{violation.rule}]</code>{" "}
              {violation.message}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 5 }}>
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
              border: "1px solid var(--warn)",
              background: "var(--warn-soft)",
              fontSize: 11,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, color: "var(--warn)" }}>
              <WarningTriangleIcon size={13} />
              Cảnh báo (ngoài 7 luật)
            </div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "var(--ink-soft)" }}>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div style={{ marginTop: 4, color: "var(--warn)" }}>
              Những mục này graph_lint KHÔNG chặn — không khoá Test/Publish.
            </div>
          </div>
        )}

        <div style={sectionStyle}>Playground</div>
        <button
          type="button"
          disabled={violation !== null || testState === "running"}
          onClick={handleTest}
          title={violation ? "graph-lint đang từ chối recipe này" : undefined}
          style={{
            ...inputStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            cursor: violation || testState === "running" ? "not-allowed" : "pointer",
            fontWeight: 700,
            color: "#fff",
            background: violation ? "var(--ink-faint)" : testState === "running" ? "var(--ink-soft)" : "var(--good)",
            border: "none",
            padding: 9,
          }}
        >
          {violation ? (
            "Bị chặn — recipe chưa qua lint"
          ) : testState === "running" ? (
            "Đang chạy…"
          ) : (
            <>
              <PlayIcon size={14} /> Test
            </>
          )}
        </button>
        {testError && (
          <div
            style={{
              marginTop: 6,
              padding: 8,
              borderRadius: 6,
              border: "1px solid var(--bad)",
              background: "var(--bad-soft)",
              color: "var(--bad)",
              fontSize: 11,
            }}
          >
            {testError}
          </div>
        )}
        {trace && (
          <TraceViewer
            expectedRunId={trace.run_id}
            expectedAgentId={activeFrameData?.agentId ?? ""}
            tenantId={tenantId}
            events={trace.events}
            timelineText={trace.timeline_text}
            // `score` không truyền — route `/api/runs` mới (apps/studio) không trả field này
            // (đó là việc của evalhub lúc Publish, không phải lúc Test); prop optional nên bỏ
            // qua an toàn, không hiện gì thay vì hiện số giả.
          />
        )}

        <div style={{ ...sectionStyle, marginTop: 12 }}>Publish</div>
        <button
          type="button"
          disabled={violation !== null || publishState === "running"}
          onClick={handlePublish}
          title={
            violation
              ? "graph-lint đang từ chối recipe này — cùng luật fail-closed với Test"
              : "Chạy nguyên golden_set_ref qua EvalHarness thật rồi gate qua publish() thật"
          }
          style={{
            ...inputStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            cursor: violation || publishState === "running" ? "not-allowed" : "pointer",
            fontWeight: 700,
            color: "#fff",
            background: violation ? "var(--ink-faint)" : publishState === "running" ? "var(--ink-soft)" : "var(--accent)",
            border: "none",
            padding: 9,
          }}
        >
          {violation ? (
            "Bị chặn — recipe chưa qua lint"
          ) : publishState === "running" ? (
            "Đang chấm điểm + publish…"
          ) : (
            <>
              <BroadcastIcon size={14} /> Publish
            </>
          )}
        </button>
        {publishError && (
          <div
            style={{
              marginTop: 6,
              padding: 8,
              borderRadius: 6,
              border: "1px solid var(--bad)",
              background: "var(--bad-soft)",
              color: "var(--bad)",
              fontSize: 11,
            }}
          >
            {publishError}
          </div>
        )}
        {publishResult && (
          <div
            style={{
              marginTop: 6,
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${publishResult.status === "published" ? "var(--good)" : "var(--warn)"}`,
              background: publishResult.status === "published" ? "var(--good-soft)" : "var(--warn-soft)",
              fontSize: 11,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontWeight: 700,
                marginBottom: 4,
                color: publishResult.status === "published" ? "var(--good)" : "var(--warn)",
              }}
            >
              {publishResult.status === "published" ? (
                <CheckCircleIcon size={13} />
              ) : (
                <PauseCircleIcon size={13} />
              )}
              {publishResult.status === "published" ? "Đã publish thành công" : "Bị chặn — chưa publish"}
            </div>
            {publishResult.status === "blocked" && (
              <div style={{ marginBottom: 4, color: "var(--ink-soft)" }}>{publishResult.message}</div>
            )}
            {publishResult.scorecard && (
              <div style={{ fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>
                verdict={publishResult.scorecard.gate.verdict} · success_rate=
                {publishResult.scorecard.aggregate.success_rate.toFixed(2)} · citation_accuracy=
                {publishResult.scorecard.aggregate.citation_accuracy?.toFixed(2) ?? "n/a (chưa đo)"}
              </div>
            )}
          </div>
        )}
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--ink-faint)", textAlign: "center", padding: "20px 10px" }}>
          Chọn 1 agent trên canvas (bấm vào thanh tiêu đề khung) để xem graph-lint, Test và
          Publish cho đúng agent đó.
        </div>
      )}
      </div>
      {!rightCollapsed && (
        <ResizeHandle
          side="right"
          onResize={(deltaPx) =>
            setRightWidth((current) => Math.min(PANEL_MAX, Math.max(PANEL_MIN, current + deltaPx)))
          }
        />
      )}
      </aside>

      <PanelCollapseButton
        side="right"
        collapsed={rightCollapsed}
        panelWidth={rightWidth}
        onToggle={() => setRightCollapsed((c) => !c)}
      />
    </div>

    {configOpen && activeFrameData && (
      <AgentConfigModal
        agentId={activeFrameData.agentId}
        onAgentIdChange={(value) => onHeaderChange({ agentId: value })}
        instructions={activeFrameData.instructions}
        onInstructionsChange={(value) => onHeaderChange({ instructions: value })}
        model={activeFrameData.model}
        onModelChange={(value) => onHeaderChange({ model: value })}
        toolWhitelist={activeFrameData.toolWhitelist}
        onToolWhitelistChange={(updater) =>
          onHeaderChange({ toolWhitelist: updater(activeFrameData.toolWhitelist) })
        }
        kbId={activeFrameData.kbId}
        onKbIdChange={(value) => onHeaderChange({ kbId: value })}
        goldenSetRef={activeFrameData.goldenSetRef}
        onGoldenSetRefChange={(value) => onHeaderChange({ goldenSetRef: value })}
        successThreshold={activeFrameData.successThreshold}
        onSuccessThresholdChange={(value) => onHeaderChange({ successThreshold: value })}
        citationThreshold={activeFrameData.citationThreshold}
        onCitationThresholdChange={(value) => onHeaderChange({ citationThreshold: value })}
        onClose={() => setConfigOpen(false)}
      />
    )}

    {nodeConfigOpen && selectedNode && (
      <NodeConfigModal
        node={selectedNode}
        toolWhitelist={activeFrameData?.toolWhitelist ?? []}
        onParamChange={onParamChange}
        onDeleteNode={deleteNode}
        onClose={() => setNodeConfigOpen(false)}
      />
    )}

    {edgeConfigOpen && selectedEdge && (
      <EdgeConfigModal
        edge={selectedEdge}
        onWhenChange={onWhenChange}
        onDeleteEdge={deleteEdge}
        onClose={() => setEdgeConfigOpen(false)}
      />
    )}
    </>
  );
}

/**
 * Modal cấu hình agent — TÁCH RIÊNG khỏi cột trái 236px (Kế hoạch redesign, phản hồi "bé tí rối
 * quá") vì 10 field (text/textarea/dropdown/checkbox/số) không đủ chỗ thở trong 1 cột hẹp luôn
 * hiện. Rộng ~880px, chia 2 cột theo đúng 4 field-group của `RecipeHeader`: Định danh + agent_config
 * (agent LÀ GÌ) bên trái, KB Binding + Eval Gate (agent ĐƯỢC PHÉP DÙNG GÌ + được chấm điểm ra sao)
 * bên phải — không dùng tab để khỏi giấu bớt field, cả 4 khối hiện cùng lúc, cuộn dọc nếu cần.
 *
 * State vẫn sống ở `Studio` (props xuống đây) — modal chỉ là 1 cách TRÌNH BÀY khác của cùng state,
 * đóng/mở không mất dữ liệu đang gõ dở, không có nút "Lưu" riêng (đổi là áp dụng ngay, khớp hành
 * vi cột trái cũ).
 */
interface AgentConfigModalProps {
  agentId: string;
  onAgentIdChange: (value: string) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  toolWhitelist: string[];
  onToolWhitelistChange: (updater: (current: string[]) => string[]) => void;
  kbId: string;
  onKbIdChange: (value: string) => void;
  goldenSetRef: string;
  onGoldenSetRefChange: (value: string) => void;
  successThreshold: number;
  onSuccessThresholdChange: (value: number) => void;
  citationThreshold: number;
  onCitationThresholdChange: (value: number) => void;
  onClose: () => void;
}

const modalLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--ink-soft)",
  marginBottom: 4,
};

const modalInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13.5,
  borderRadius: 6,
  border: "1px solid var(--line-strong)",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
};

function AgentConfigModal({
  agentId,
  onAgentIdChange,
  instructions,
  onInstructionsChange,
  model,
  onModelChange,
  toolWhitelist,
  onToolWhitelistChange,
  kbId,
  onKbIdChange,
  goldenSetRef,
  onGoldenSetRefChange,
  successThreshold,
  onSuccessThresholdChange,
  citationThreshold,
  onCitationThresholdChange,
  onClose,
}: AgentConfigModalProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,36,34,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(880px, 96vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--paper)",
          borderRadius: 12,
          boxShadow: "var(--shadow-md)",
          padding: "22px 26px 26px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19, fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--ink)" }}>
              Cấu hình Agent
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 2 }}>
              Áp dụng ngay cho canvas — đóng bảng này không mất thay đổi.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink-soft)",
              cursor: "pointer",
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <Card title="Định danh">
              <label style={modalLabelStyle}>agent_id</label>
              <input value={agentId} onChange={(e) => onAgentIdChange(e.target.value)} style={modalInputStyle} />
              {/* `tenant_id` KHÔNG hiển thị — tự suy từ session đăng nhập (xem `header` ở
                  `Studio`), người dùng không cần và không được tự gõ. */}
            </Card>

            <Card title="Agent config">
              <label style={modalLabelStyle}>instructions</label>
              <textarea
                value={instructions}
                onChange={(e) => onInstructionsChange(e.target.value)}
                rows={5}
                style={{ ...modalInputStyle, fontFamily: "inherit", resize: "vertical" }}
              />
              <label style={{ ...modalLabelStyle, marginTop: 12 }}>model</label>
              <select value={model} onChange={(e) => onModelChange(e.target.value)} style={modalInputStyle}>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
              </select>
              <div style={{ ...modalLabelStyle, marginTop: 12, marginBottom: 6 }}>tool_whitelist</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {AVAILABLE_TOOLS.map((tool) => (
                  <label key={tool} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink)" }}>
                    <input
                      type="checkbox"
                      checked={toolWhitelist.includes(tool)}
                      onChange={(e) =>
                        onToolWhitelistChange((current) =>
                          e.target.checked ? [...current, tool] : current.filter((t) => t !== tool),
                        )
                      }
                    />
                    <code style={{ fontFamily: "var(--font-mono)" }}>{tool}</code>
                  </label>
                ))}
              </div>
            </Card>
          </div>

          <div>
            <Card title="KB Binding">
              <label style={modalLabelStyle}>kb_id</label>
              <input value={kbId} onChange={(e) => onKbIdChange(e.target.value)} style={modalInputStyle} />
              {/* `scope` KHÔNG hiển thị — tự suy từ `roles` của session, xem comment ở `Studio`. */}
            </Card>

            <Card title="Eval gate">
              <label style={modalLabelStyle}>golden_set_ref</label>
              <input
                value={goldenSetRef}
                onChange={(e) => onGoldenSetRefChange(e.target.value)}
                style={modalInputStyle}
              />
              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={modalLabelStyle}>success</label>
                  <input
                    type="number"
                    step="0.01"
                    value={successThreshold}
                    onChange={(e) => onSuccessThresholdChange(Number(e.target.value))}
                    style={modalInputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={modalLabelStyle}>citation_accuracy</label>
                  <input
                    type="number"
                    step="0.01"
                    value={citationThreshold}
                    onChange={(e) => onCitationThresholdChange(Number(e.target.value))}
                    style={modalInputStyle}
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 22px",
              fontSize: 13.5,
              fontWeight: 700,
              borderRadius: 7,
              border: "none",
              background: "var(--tier-admin)",
              color: "#fff",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}

function CanvasView({ session }: { session: Session }) {
  // Bọc `ReactFlowProvider` quanh `Studio` — quy ước an toàn của react-flow khi component render
  // `<ReactFlow>` cũng là nơi mọi state/logic canvas sống (kể cả khi hiện tại không gọi thẳng
  // `useReactFlow()` nào ở tầng này nữa).
  return (
    <ReactFlowProvider>
      <Studio session={session} />
    </ReactFlowProvider>
  );
}

/**
 * AppShell (Kế hoạch RBAC 3 tầng) — cổng đăng nhập + rẽ 3 nhánh theo role thật (tra từ
 * `core.users` lúc login, không phải client tự gõ) — không dùng thư viện router nào (`apps/web`
 * hiện không có `react-router` trong deps) — state đơn giản, cùng kiểu chuyển màn bằng
 * `useState` đã dùng trong `Studio`.
 *
 * Chưa đăng nhập (`session === null`) → CHỈ render `<Login/>`, không render `Studio`/`ChatPage`/
 * `SuperadminConsole` — đây là lý do `tenantId`/`roles` truyền xuống `CanvasView` luôn là string
 * thật, không cần optional-chaining rải khắp `Studio`.
 */

type Role = "superadmin" | "admin" | "employee";

/** `roles` đến từ `login()` response — server tra từ `core.users` sau khi xác thực mật khẩu thật,
 * KHÔNG phải client tự khai (khác giai đoạn demo-login cũ, khi role chỉ là 1 field UI tự gõ). */
function resolveRole(session: Session): Role {
  if (session.roles.includes("superadmin")) return "superadmin";
  if (session.roles.includes("admin")) return "admin";
  return "employee";
}

// 2 nhóm rõ rệt: "Agent" (xây/quản lý/dùng thử) và "Công ty" (nhân viên + tài liệu) — tách bằng
// 1 vạch đứng khi render (xem `GROUP_BREAK_AFTER`), để hàng tab không còn là 1 dải phẳng 6 nút
// như nhau — admin cần biết "Canvas"/"Agent đã publish"/"Dùng thử" là 3 góc nhìn của CÙNG 1 việc
// (xây agent), khác hẳn "Nhân viên"/"Tài liệu" (vận hành công ty). "Phòng ban" không còn là tab
// riêng — nó chỉ là danh sách tham chiếu CHỈ ĐỌC dùng lúc tạo/sửa nhân viên (xem `SectionsTab`
// docstring), nên gộp làm khối trên cùng của tab "Nhân viên" thay vì chiếm 1 tab riêng.
const ADMIN_TABS = [
  ["canvas", "Canvas", GridIcon],
  ["agents", "Agent đã publish", BotIcon],
  ["chat", "Dùng thử", ChatBubbleIcon],
  ["employees", "Nhân viên", PeopleIcon],
  ["documents", "Tài liệu", DocumentIcon],
] as const;

const GROUP_BREAK_AFTER: AdminTab = "chat";

type AdminTab = (typeof ADMIN_TABS)[number][0];

function AdminConsole({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [screen, setScreen] = useState<AdminTab>("canvas");

  return (
    <div className="full-viewport-height" style={{ display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <BrandBar session={session} roleLabel="Admin" roleTone="var(--tier-admin)" onLogout={onLogout} />
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "6px 16px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface-2)",
        }}
      >
        {ADMIN_TABS.map(([key, label, Icon]) => {
          const active = screen === key;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setScreen(key)}
                disabled={active}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  borderRadius: 999,
                  border: "1px solid " + (active ? "var(--tier-admin)" : "transparent"),
                  background: active ? "var(--tier-admin-soft)" : "transparent",
                  color: active ? "var(--tier-admin)" : "var(--ink-soft)",
                  cursor: active ? "default" : "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                <Icon size={14} />
                {label}
              </button>
              {key === GROUP_BREAK_AFTER && (
                <div style={{ width: 1, height: 20, background: "var(--line-strong)", margin: "0 8px" }} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: screen === "canvas" ? "hidden" : "auto" }}>
        {screen === "canvas" && <CanvasView session={session} />}
        {screen === "agents" && <AgentsRollbackTab session={session} />}
        {screen === "chat" && <ChatPage />}
        {screen === "employees" && (
          <>
            {/* "Phòng ban" gộp lên đầu tab "Nhân viên" — CHỈ ĐỌC, dùng để tham chiếu lúc chọn role
                cho nhân viên bên dưới, không còn là 1 tab riêng (xem comment `ADMIN_TABS`). */}
            <SectionsTab session={session} />
            <EmployeesTab session={session} />
          </>
        )}
        {screen === "documents" && <DocumentsTab session={session} />}
      </div>
    </div>
  );
}

function AppShell() {
  const { session, logout } = useSession();

  if (session === null) {
    return <Login />;
  }

  const role = resolveRole(session);

  if (role === "superadmin") {
    return <SuperadminConsole session={session} onLogout={logout} />;
  }

  // Employee: KHÔNG có thanh điều hướng/tab nào cả — chỉ 1 khung chat toàn màn hình, không có
  // gợi ý nào là "đang ở 1 tab trong nhiều tab" (nút đăng xuất nằm gọn trong ChatPage).
  if (role === "employee") {
    return <ChatPage onLogout={logout} />;
  }

  return <AdminConsole session={session} onLogout={logout} />;
}

export default function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}

/**
 * AgentCore Studio — Workbench canvas (D12, issue kit#87).
 *
 * Luồng: form (header) + canvas (DAG) → `buildRecipe()` → `agentShapeLint()`+`agentTopologyLint()`
 * (workbench#48, web#34 — thay `graphLint()` cũ) → export.
 *
 * ## Fail-closed
 * Nút export bị `disabled` khi 1 trong 2 lint trả về finding FAIL. Không có đường vòng nào lấy
 * được JSON khi đang đỏ — kể cả tab JSON cũng dán nhãn "CHƯA QUA LINT" thay vì hiện recipe như thể
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
  type Edge as FlowEdge,
  MarkerType,
  MiniMap,
  type Node as FlowNode,
  type NodeChange,
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
import LlmStepConfigModal from "./canvas/LlmStepConfigModal";
import Palette, { DND_MIME } from "./canvas/Palette";
import RecipeNode from "./canvas/RecipeNode";
import { setMinimapVisible, useMinimapVisible } from "./canvas/minimapPref";
import { TestQueryNode, TestResponseNode } from "./canvas/TestModeNodes";
import {
  buildNodeEventIndex,
  findLlmHubId,
  highlightForNode,
  TEST_QUERY_NODE_ID,
  TEST_RESPONSE_NODE_ID,
  useTestReplay,
} from "./canvas/testMode";
import TestTraceDetail, { type TestTraceDetailContent } from "./canvas/TestTraceDetail";
import {
  DRAGGABLE_NODE_TYPES,
  defaultParams,
  nodeSpec,
  sectionRoleOf,
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
import { advisories, agentShapeLint, agentTopologyLint, type Finding } from "./recipe/graphLint";
import { DEFAULT_HEADER } from "./recipe/sample";
import { fromRecipe } from "./recipe/toCanvas";
import { getAgentRecipe, listAgentVersions, rollbackAgent, type VersionSummary } from "./agents/api";
import { sendTestChatMessage } from "./playground/testChatApi";
import type { WireTraceEvent } from "./playground/api";
import Login from "./auth/Login";
import { SessionProvider, useSession, type Session } from "./auth/session";
import ChatPage from "./chat/ChatPage";
import { evaluateAgent, fetchTrace, publishAgent, type PublishResult, type Scorecard } from "./studio/api";
import { StudioApiError } from "./httpUtil";
import SuperadminConsole from "./superadmin/SuperadminConsole";
import ForcedPasswordChange from "./auth/ForcedPasswordChange";
import EmployeesTab from "./admin/EmployeesTab";
import DocumentsTab from "./admin/DocumentsTab";
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
const NODE_TYPES_MAP = {
  recipeNode: RecipeNode,
  agentFrame: AgentFrameNode,
  testQuery: TestQueryNode,
  testResponse: TestResponseNode,
};

// Kích thước khung agent — SÀN tối thiểu cho khung mới/trống. Khung luôn tự khớp đúng bounding-box
// thật của TOÀN BỘ node con (effect cạnh `useNodesState` bên dưới, không phải chỉ riêng node vừa
// kéo) — không còn cố định như bản trước (phản hồi: khung phải bao lấy tất cả node bên trong khi
// kéo node thay đổi). `HEADER` chừa chỗ cho thanh tiêu đề khung, node con đầu tiên bắt đầu dưới nó.
const FRAME_WIDTH = 900;
const FRAME_HEIGHT = 560;
const FRAME_HEADER = 40;
const FRAME_GAP = 60;
// Khoảng đệm quanh node khi tính lại kích thước khung cần "phình" tới — đủ để không đụng viền.
const FRAME_GROW_PADDING = 40;

const EDGE_COLOR = "var(--ink-soft)";

const DEFAULT_EDGE_OPTIONS = {
  // Mặc định react-flow: nét 1px màu xám nhạt gần như biến mất trên nền `--paper` — không phải
  // trang trí, cạnh là DỮ LIỆU (thứ tự chạy thật của DAG), mờ tới mức khó thấy là lỗi đọc-được,
  // không phải gu thẩm mỹ (phản hồi: "cạnh nối mỏng và mờ quá"). Đậm hẳn lên + đổi màu ăn theo
  // token `--ink-soft` (tối, tương phản cao với `--paper`/`--surface`) thay vì màu xám mặc định.
  style: { strokeWidth: 2, stroke: EDGE_COLOR },
  // web#45 — KHÔNG còn `markerEnd` mặc định ở đây: đồ thị DAG thật giờ vô hướng (`RecipeNode.tsx`,
  // mỗi node 1 cổng, không còn phân biệt vào/ra), mũi tên chỉ hướng chỉ còn đúng cho 2 cạnh giả
  // Test Mode (có hướng thật) — set riêng `markerEnd` cho 2 cạnh đó ở `edgesForCanvas` bên dưới.
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

/** web#44 review — bản sao CHÍNH XÁC quy ước đặt tên bộ golden tự sinh phía server
 * (`apps/studio/src/studio_app/core/golden_autogen.py::auto_golden_set_ref`, literal
 * `f"kb-{section_role}-auto-v1"`, xác nhận bằng test thật `test_golden_autogen_on_upload.py`).
 * Đây là bản sao QUY ƯỚC, không phải gọi API — bộ golden ở tên này có thể CHƯA TỒN TẠI thật (phòng
 * ban mới/ít tài liệu, `regenerate_for_section` chưa từng chạy thành công) — không chặn UI ở đây,
 * để lỗi 400 lộ ra tự nhiên lúc Chấm điểm/Publish như hành vi hiện tại với `golden_set_ref` sai tên
 * bất kỳ. */
function autoGoldenSetRef(sectionRole: string): string {
  return `kb-${sectionRole}-auto-v1`;
}

/** `AgentFrameData` (state của 1 khung) → `RecipeHeader` (đầu vào `buildRecipe()`) — tách hàm
 * thuần riêng vì cần dựng header cho NHIỀU khung khác nhau tại các thời điểm khác nhau (khung
 * active để hiện Test/Publish, khung vừa nạp/đổi version để tính `loadedSnapshot`), không chỉ 1
 * chỗ duy nhất như trước.
 *
 * web#44 review — `childNodes` (tham số mới): nếu khung có 1 node `kb-retrieve` với
 * `params.section_roles` không rỗng, `golden_set_ref` được LÁI theo phòng ban đó
 * (`autoGoldenSetRef`) thay vì hằng số demo — đây là field DUY NHẤT thật sự đổi hành vi (Chấm
 * điểm/Publish đọc `golden_set_ref`, xem `routes/publish.py::_load_golden_set`). KHÔNG đổi
 * `kb_id`/`scope` theo phòng ban — `packages/workbench::create_recipe()` hardcode lại 2 field đó
 * bất kể client gửi gì (quyết định cố ý từ workbench#41), nên sửa chúng ở đây chỉ là trang trí vô
 * tác dụng, dễ gây hiểu lầm "đã điều khiển được KB" trong khi chưa (cần đổi `packages/contracts`/
 * `packages/workbench`, ngoài phạm vi — xem mini-RFC kit#239 Q2, chưa đủ chữ ký). Không có node
 * `kb-retrieve`/field rỗng → giữ nguyên hành vi cũ hệt trước đây. */
function frameHeader(
  frameData: AgentFrameData,
  tenantId: string,
  scope: string,
  childNodes: FlowNode<CanvasNodeData>[] = [],
): RecipeHeader {
  const kbNode = childNodes.find((node) => node.data.type === "kb-retrieve");
  const sectionRole = kbNode ? sectionRoleOf(kbNode.data.params) : "";
  return {
    agent_id: frameData.agentId,
    tenant_id: tenantId,
    // web#48 — không còn field cấu hình được ở frontend, luôn rỗng. `packages/engine` đã coi rỗng
    // là case hợp lệ từ trước (`executors.py::build_prompt()`).
    system_prompt: "",
    model: frameData.model || DEFAULT_HEADER.model,
    tool_whitelist: frameData.toolWhitelist,
    kb_id: frameData.kbId.trim() || DEFAULT_HEADER.kb_id,
    scope: scope.trim() || DEFAULT_HEADER.scope,
    golden_set_ref: sectionRole ? autoGoldenSetRef(sectionRole) : frameData.goldenSetRef || DEFAULT_HEADER.golden_set_ref,
    scorecard_threshold: {
      success: frameData.successThreshold,
      citation_accuracy: frameData.citationThreshold,
    },
  };
}

/** 1 finding FAIL, đã gắn nhãn lint nào sinh ra nó — cho panel Test/Publish hiện `[label] [rule]
 * message`, cùng cách `enforce_agent_shape`/`enforce_agent_topology` tự đặt tên trong message
 * raise phía Python. KHÔNG có `nodeId` — khác `LintViolation` cũ, `agentShapeLint`/
 * `agentTopologyLint` (workbench#48) không còn trả thông tin gắn với 1 node cụ thể, nên canvas
 * cũng không còn tô đỏ được đúng node gây lỗi nữa (thoái hoá trung thực theo đúng thứ API mới cho
 * biết, không phải bug ở đây).
 */
interface BlockingFinding {
  label: "agent_shape_lint" | "agent_topology_lint";
  rule: string;
  message: string;
}

/** Chạy `agentShapeLint` rồi `agentTopologyLint` (đúng thứ tự `canvas.py`/`publish.py` gọi
 * `enforce_agent_shape` trước `enforce_agent_topology`), trả finding FAIL ĐẦU TIÊN tìm thấy hoặc
 * `null` nếu cả 2 lint sạch. */
function firstBlockingFinding(recipe: WireRecipe): BlockingFinding | null {
  const shapeFail = agentShapeLint(recipe).find((f: Finding) => f.status === "FAIL");
  if (shapeFail) return { label: "agent_shape_lint", rule: shapeFail.rule, message: shapeFail.detail };
  const topologyFail = agentTopologyLint(recipe).find((f: Finding) => f.status === "FAIL");
  if (topologyFail) return { label: "agent_topology_lint", rule: topologyFail.rule, message: topologyFail.detail };
  return null;
}

function Studio({
  session,
  onNavigate,
}: {
  session: Session;
  onNavigate?: (tab: AdminTab) => void;
}) {
  const tenantId = session.tenantId;
  const roles = session.systemRoles;
  const reactFlowInstance = useReactFlow();
  // `scope` suy từ session — dùng chung cho MỌI khung agent trên canvas, không phải field riêng
  // từng khung (giữ đúng lý do cũ: `interpreter.run()` ghi đè `section_roles` theo session dù sao
  // đi nữa, xem comment gốc từng ở đây trước khi canvas hỗ trợ nhiều agent).
  const scope = roles.length > 0 ? `t/${roles.join(",")}` : "t/";

  // Mặc định canvas trống hoàn toàn: không có agent mẫu, không có node/edge demo.
  // Người dùng bắt đầu bằng cách bấm "Tạo agent" rồi kéo-thả node từ palette.
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdgeData>([]);

  // Khung agent luôn bao trọn TOÀN BỘ node con của nó — tính lại bounding-box thật (không phải chỉ
  // riêng node vừa kéo) mỗi khi `nodes` đổi, nên bất kể do kéo tay, `addNode` xếp chồng, hay nạp
  // nguyên 1 recipe vào (`fromRecipe`), khung luôn khớp đúng nội dung thật bên trong, không có node
  // nào bị hở ra ngoài viền (phản hồi: "khung agent phải bao lấy tất cả các node trong khung khi
  // kéo node thay đổi" — bản trước chỉ lớn ra theo ĐÚNG node đang kéo, `width`/`height` node đó lúc
  // MỚI thêm còn chưa đo thật (dùng số ước lượng 240×120), nên khung có thể hụt so với node cao/
  // rộng hơn ước lượng). `node.width`/`node.height` do chính react-flow đo qua `ResizeObserver` rồi
  // tự ghi ngược vào state qua `onNodesChange` (`type: "dimensions"`) — hiệu ứng này CHỈ đọc lại,
  // không tự đo tay. Chỉ set lại state khi số thật đổi (so `style.width`/`height` cũ) để không tạo
  // vòng lặp effect → setNodes → effect.
  useEffect(() => {
    const frameIds = new Set(nodes.filter((n) => n.type === "agentFrame").map((n) => n.id));
    if (frameIds.size === 0) return;
    let changed = false;
    const next = nodes.map((node) => {
      if (!frameIds.has(node.id)) return node;
      const children = nodes.filter((c) => c.type !== "agentFrame" && c.parentId === node.id);
      let neededWidth = FRAME_WIDTH;
      let neededHeight = FRAME_HEIGHT;
      for (const child of children) {
        const width = child.width ?? 240;
        const height = child.height ?? 120;
        neededWidth = Math.max(neededWidth, child.position.x + width + FRAME_GROW_PADDING);
        neededHeight = Math.max(neededHeight, child.position.y + height + FRAME_GROW_PADDING);
      }
      const style = (node.style ?? {}) as { width?: number; height?: number };
      if (style.width === neededWidth && style.height === neededHeight) return node;
      changed = true;
      return { ...node, style: { ...style, width: neededWidth, height: neededHeight } };
    });
    if (changed) setNodes(next);
  }, [nodes, setNodes]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // Khung agent ĐANG SỬA — quyết định: node Palette mới vào khung nào, sidebar phải (lint/
  // Test/Publish) tính recipe của khung nào, "Cấu hình Agent" sửa khung nào. Bấm 1 khung HOẶC 1
  // node DAG bên trong khung đó đều cập nhật biến này (đồng bộ ngữ cảnh, không bắt phải bấm đúng
  // thanh tiêu đề mới đổi được agent đang thao tác).
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  // Bấm 1 node/cạnh trên canvas mở thẳng cửa sổ cấu hình tương ứng (cùng mẫu `configOpen`/"Cấu
  // hình Agent" bên dưới) — cột phải không còn "Inspector" nữa, cả 2 loại đều qua modal.
  const [nodeConfigOpen, setNodeConfigOpen] = useState(false);
  // Node `llm-step` (cố định, duy nhất mỗi agent) dùng modal RIÊNG (`LlmStepConfigModal`) — chỉ
  // còn cấu hình `temperature` (node params), có validate. web#48 — không còn `system_prompt`.
  const [llmStepConfigOpen, setLlmStepConfigOpen] = useState(false);
  const [edgeConfigOpen, setEdgeConfigOpen] = useState(false);
  const minimapVisible = useMinimapVisible();

  // Panel trái/phải tự thu gọn/resize (phản hồi redesign) — độ rộng + trạng thái collapse sống
  // riêng cho từng bên, không ảnh hưởng `1fr` ở giữa (canvas luôn ăn hết phần còn lại).
  const [leftWidth, setLeftWidth] = useState(236);
  const [rightWidth, setRightWidth] = useState(256);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Test Mode (web#35) — thay hẳn modal chat full-screen cũ (`TestAgentModal`, che mất canvas)
  // bằng 1 chế độ của chính canvas: 2 node giả `user_query`/`response` (`canvas/TestModeNodes.tsx`)
  // bọc quanh chuỗi node thật, phát lại (`canvas/testMode.ts::useTestReplay`) đúng trace của 1 lượt
  // `sendTestChatMessage()` + `fetchTrace()` đã chạy XONG (không streaming — xem docstring
  // `testMode.ts`). Một lượt hỏi mới THAY nội dung, không cộng dồn lịch sử (test-chat vốn không
  // nhớ giữa các lượt).
  const [testMode, setTestMode] = useState(false);
  const [testQuery, setTestQuery] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testAnswer, setTestAnswer] = useState<string | null>(null);
  const [testCitations, setTestCitations] = useState<string[]>([]);
  const [testEvents, setTestEvents] = useState<WireTraceEvent[] | null>(null);
  const [testDetailEdge, setTestDetailEdge] = useState<{ source: string; target: string } | null>(null);
  const testReplay = useTestReplay(testEvents);
  // 2 node giả không nằm trong `nodes` (state canvas thật `useNodesState` quản) — react-flow bản
  // controlled-nodes CHỈ tự đo xong kích thước rồi hiện ra khi change "dimensions" nó tự bắn ra
  // được vòng lại đúng mảng `nodes` mà mình truyền cho `<ReactFlow>` (không thì kẹt mãi ở
  // `visibility: hidden` — đã gặp thật lúc build tính năng này). Vì `onNodesChange` thật chỉ biết
  // vá vào state `nodes` thật, đo xong của 2 node giả phải rẽ sang state riêng này thay vì rơi mất.
  const [pseudoNodeDims, setPseudoNodeDims] = useState<Record<string, { width: number; height: number }>>({});
  const handleCanvasNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const pseudoChanges = changes.filter(
        (change): change is NodeChange & { id: string } => "id" in change && (change.id === TEST_QUERY_NODE_ID || change.id === TEST_RESPONSE_NODE_ID),
      );
      if (pseudoChanges.length > 0) {
        setPseudoNodeDims((current) => {
          let next = current;
          for (const change of pseudoChanges) {
            if (change.type === "dimensions" && change.dimensions) {
              next = { ...next, [change.id]: change.dimensions };
            }
          }
          return next;
        });
      }
      const realChanges = changes.filter((change) => !("id" in change) || (change.id !== TEST_QUERY_NODE_ID && change.id !== TEST_RESPONSE_NODE_ID));
      if (realChanges.length > 0) onNodesChange(realChanges);
    },
    [onNodesChange],
  );

  const resetTestRun = useCallback(() => {
    setTestQuery("");
    setTestSending(false);
    setTestError(null);
    setTestAnswer(null);
    setTestCitations([]);
    setTestEvents(null);
    setTestDetailEdge(null);
    testReplay.reset(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Test Mode (web#35) — nhường hẳn sân cho canvas: tự thu gọn 2 panel + tắt minimap lúc vào, tự
  // khôi phục ĐÚNG trạng thái trước đó lúc thoát (không phải luôn bật lại — người dùng có thể đã
  // tắt minimap từ trước khi vào Test Mode). `prevUiState` chỉ ghi 1 lần lúc `testMode` chuyển
  // false→true, đọc lại đúng lần đó lúc true→false, không ghi đè linh tinh ở các render giữa chừng.
  const prevUiStateRef = useRef<{ left: boolean; right: boolean; minimap: boolean } | null>(null);
  useEffect(() => {
    if (testMode) {
      prevUiStateRef.current = { left: leftCollapsed, right: rightCollapsed, minimap: minimapVisible };
      setLeftCollapsed(true);
      setRightCollapsed(true);
      setMinimapVisible(false);
    } else if (prevUiStateRef.current) {
      setLeftCollapsed(prevUiStateRef.current.left);
      setRightCollapsed(prevUiStateRef.current.right);
      setMinimapVisible(prevUiStateRef.current.minimap);
      prevUiStateRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testMode]);

  // Vào/thoát Test Mode phải luôn lấy nét lại đúng khung agent đang sửa (+ 2 node giả nếu đang
  // testMode) — phản hồi: lúc thoát test mode, khung nhìn bị lệch khỏi agent đang sửa, không tự
  // hết. CHỈ bám theo `testMode` (không bám `activeFrameId` nói chung) — người dùng tự bấm/kéo
  // trên canvas để chọn 1 khung khác thì KHÔNG được tự động lấy nét đè lên thao tác đó; đây là
  // fit duy nhất, chỉ chạy đúng lúc chuyển chế độ, không fight thao tác pan/click tay.
  useEffect(() => {
    if (!activeFrameId) return;
    const targetIds = testMode ? [activeFrameId, TEST_QUERY_NODE_ID, TEST_RESPONSE_NODE_ID] : [activeFrameId];
    // 100ms, không phải 1 rAF — lúc vào testMode, 2 node giả vừa được thêm còn CHƯA qua vòng đo
    // kích thước thật của react-flow (ResizeObserver, xem `pseudoNodeDims`/`handleCanvasNodesChange`
    // phía trên) — `fitView` chạy ngay 1 frame sau đó tính theo toạ độ NHƯNG kích thước = 0, khung
    // nhìn hụt mất phần bên trái/phải. 100ms THƯỜNG đủ, nhưng không phải LUÔN (gặp thật lúc verify:
    // node `user_query` vẫn ở ngoài khung nhìn) — effect dưới bù thêm 1 lần CHẮC CHẮN đúng, chạy
    // đúng khi 2 node giả đã đo xong thật, không đoán bằng thời gian nữa.
    const timer = setTimeout(() => {
      reactFlowInstance.fitView({ nodes: targetIds.map((id) => ({ id })), padding: 0.25, duration: 300 });
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testMode]);

  // Bù cho effect trên: fit LẠI đúng 1 lần, ngay khi 2 node giả đã có kích thước đo thật (không
  // còn đoán bằng 100ms) — chỉ chạy 1 lần mỗi lượt vào Test Mode (`settledFitDoneRef`), không
  // fight thao tác pan tay sau đó.
  const settledFitDoneRef = useRef(false);
  useEffect(() => {
    if (!testMode) {
      settledFitDoneRef.current = false;
      return;
    }
    if (settledFitDoneRef.current) return;
    if (!activeFrameId || !pseudoNodeDims[TEST_QUERY_NODE_ID] || !pseudoNodeDims[TEST_RESPONSE_NODE_ID]) return;
    settledFitDoneRef.current = true;
    reactFlowInstance.fitView({
      nodes: [{ id: activeFrameId }, { id: TEST_QUERY_NODE_ID }, { id: TEST_RESPONSE_NODE_ID }],
      padding: 0.25,
      duration: 300,
    });
  }, [testMode, pseudoNodeDims, activeFrameId, reactFlowInstance]);

  // Publish (Kế hoạch 2, A4 backend + phần UI còn thiếu tới giờ) — tách state riêng khỏi
  // testMode: Test và Publish là 2 hành động độc lập, có thể chạy lệch pha nhau.
  const [publishState, setPublishState] = useState<"idle" | "running" | "error">("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  // Chấm điểm (`/evaluate`, tách khỏi Publish theo yêu cầu) — nút Publish sáng ở 1 trong 2 nhánh
  // (`canPublish` bên dưới): (a) khung đang ở đúng bản vừa nạp/đổi version, chưa sửa gì
  // (`hasCleanLoadedVersion`) — không cần chấm lại; hoặc (b) lần Chấm điểm GẦN NHẤT verdict="PASS"
  // VÀ đúng cho recipe hiện tại trên canvas (so bằng snapshot JSON `evaluatedRecipeSnapshot` bên
  // dưới — đổi bất cứ gì trên canvas sau khi chấm điểm làm snapshot lệch, Publish tự tắt lại,
  // không cần cờ boolean rời rạc dễ quên đồng bộ). Server vẫn LUÔN tự chấm lại khi bấm Publish
  // thật (nhánh publish bản mới) — đây chỉ là gợi ý UX, không phải hàng rào bảo mật.
  const [evaluateState, setEvaluateState] = useState<"idle" | "running" | "error">("idle");
  const [evaluateError, setEvaluateError] = useState<string | null>(null);
  const [evaluateResult, setEvaluateResult] = useState<Scorecard | null>(null);
  const [evaluatedRecipeSnapshot, setEvaluatedRecipeSnapshot] = useState<string | null>(null);
  const [rollbackVersion, setRollbackVersion] = useState<string>("");

  // Cấu hình agent (identity/agent_config/kb_binding/eval gate) không còn nhồi trong cột trái
  // 236px — 10 field (textarea, dropdown, checkbox, số) bị bóp vào cột đó đọc rất rối. Chuyển
  // thành 1 modal rộng (`AgentConfigModal` bên dưới), mở bằng nút "Cấu hình Agent" — cột trái
  // chỉ còn giữ đúng 1 việc: Palette để kéo/thả node vào canvas.
  const [configOpen, setConfigOpen] = useState(false);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [newAgentId, setNewAgentId] = useState("");
  // "Mở agent đã publish" — thay tab riêng cũ, mở modal chọn agent+version ngay trên Canvas
  // (bỏ ở UI mới: rollback dùng dropdown riêng trong panel trái).

  // Header (identity/agent_config/kb_binding/eval gate) KHÔNG còn là state phẳng của `Studio` —
  // mỗi khung agent tự giữ đúng phần đó trong `data` của node khung (`AgentFrameData`). Đọc/ghi
  // qua khung `activeFrameId` — `onHeaderChange` bên dưới cập nhật `data` của ĐÚNG node khung đó.
  const activeFrame = nodes.find((node) => node.id === activeFrameId);
  const activeFrameData = activeFrame ? (activeFrame.data as unknown as AgentFrameData) : null;
  const frameNodes = useMemo(() => nodes.filter((node) => node.type === "agentFrame"), [nodes]);

  const focusFrame = useCallback(
    (frameId: string) => {
      const target = nodes.find((node) => node.id === frameId && node.type === "agentFrame");
      if (!target) return;

      setActiveFrameId(frameId);
      setSelectedNodeId(frameId);
      setSelectedEdgeId(null);

      const style = (target.style ?? {}) as { width?: number; height?: number };
      const width = style.width ?? target.width ?? FRAME_WIDTH;
      const height = style.height ?? target.height ?? FRAME_HEIGHT;
      const centerX = target.position.x + width / 2;
      const centerY = target.position.y + height / 2;

      requestAnimationFrame(() => {
        reactFlowInstance.setCenter(centerX, centerY, {
          duration: 360,
          zoom: Math.min(1, Math.max(0.72, reactFlowInstance.getZoom() || 0.85)),
        });
        reactFlowInstance.fitView({ nodes: [{ id: frameId }], duration: 360, padding: 0.42, maxZoom: 1 });
      });
    },
    [nodes, reactFlowInstance],
  );

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

  // Version có thật của agent đang active (`wb.recipe_versions`) — nạp lại mỗi khi đổi khung, cho
  // dropdown "đổi version tại chỗ" ở panel trái (thay tab "Agent đã publish" cũ). Rỗng/lỗi thì ẩn
  // dropdown, không chặn gì khác — agent chưa từng publish (`agentId` tự gõ, chưa có version nào)
  // là ca BÌNH THƯỜNG, không phải lỗi.
  const [activeAgentVersions, setActiveAgentVersions] = useState<VersionSummary[]>([]);
  useEffect(() => {
    const agentId = activeFrameData?.agentId;
    if (!agentId) {
      setActiveAgentVersions([]);
      return;
    }
    let cancelled = false;
    listAgentVersions(agentId, session)
      .then((result) => {
        if (!cancelled) setActiveAgentVersions(result);
      })
      .catch(() => {
        if (!cancelled) setActiveAgentVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFrameData?.agentId, session]);

  useEffect(() => {
    if (!activeFrameData || activeAgentVersions.length === 0) {
      setRollbackVersion("");
      return;
    }
    const current = activeFrameData.version;
    if (current !== undefined && activeAgentVersions.some((v) => v.version === current)) {
      setRollbackVersion(String(current));
      return;
    }
    setRollbackVersion(String(activeAgentVersions[0].version));
  }, [activeFrameData, activeAgentVersions]);

  const idCounter = useRef(0);

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
      // `llm-step` — CỐ ĐỊNH, đúng 1 node mỗi agent (tự sinh lúc `createFrame`, không kéo-thả
      // thêm được nữa). Palette không còn cho kéo loại này (`DRAGGABLE_NODE_TYPES`), nhưng chặn
      // lại ở đây cho chắc — phòng ca gọi `addNode("llm-step")` từ nơi khác trong tương lai.
      if (type === "llm-step" && nodes.some((n) => n.parentId === activeFrameId && n.data.type === "llm-step")) {
        return;
      }
      const id = nextNodeId();
      setNodes((current) => {
        const siblings = current.filter(
          (node) => node.type !== "agentFrame" && node.parentId === activeFrameId,
        );
        let x = 40;
        let y = FRAME_HEADER + 30;

        if (type === "kb-retrieve") {
          const kbCount = siblings.filter((n) => n.data.type === "kb-retrieve").length;
          x = 40;
          y = FRAME_HEADER + 40 + kbCount * 140;
        } else if (type === "tool-call") {
          const toolCount = siblings.filter((n) => n.data.type === "tool-call").length;
          x = 590;
          y = FRAME_HEADER + 40 + toolCount * 130;
        } else if (type === "llm-step") {
          const llmCount = siblings.filter((n) => n.data.type === "llm-step").length;
          x = Math.round((FRAME_WIDTH - 275) / 2);
          y = Math.round((FRAME_HEIGHT - 130) / 2) + llmCount * 150;
        } else {
          x = 40;
          y = FRAME_HEADER + 30 + siblings.length * 110;
        }

        // Khung tự bao trọn node mới này qua effect riêng (theo `nodes`, xem khai báo cạnh
        // `useNodesState` phía trên) — không cần tự tính/set `style` của khung ở đây nữa.
        return [
          ...current,
          {
            id,
            type: "recipeNode",
            parentId: activeFrameId,
            // Chặn `minY` ở `FRAME_HEADER` — không cho kéo node đè lên thanh tiêu đề khung (xem
            // giải thích ở `initial` useMemo phía trên). Không chặn phải/dưới — khung tự phình.
            extent: [
              [0, FRAME_HEADER],
              [Infinity, Infinity],
            ] as [[number, number], [number, number]],
            // Toạ độ TƯƠNG ĐỐI trong khung (react-flow tự hiểu vậy khi có `parentId`).
            position: { x, y },
            data: { type, params: defaultParams(type) },
          },
        ];
      });
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
    },
    [activeFrameId, nextNodeId, nodes, setNodes],
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
      const isDraggableType = DRAGGABLE_NODE_TYPES.some((type) => type === raw);
      if (!isDraggableType) return;
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
      // `llm-step` — CỐ ĐỊNH, không xoá được (chỉ mất theo khi cả khung agent bị xoá, nhánh
      // `isFrame` bên dưới) — chặn ở đây phòng ca gọi qua phím Backspace/Delete (node đang chọn),
      // không chỉ qua nút "Xoá node" (đã bỏ hẳn khỏi `LlmStepConfigModal`).
      if (target?.type === "recipeNode" && target.data.type === "llm-step") return;
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
      // `agentTopologyLint` sẽ báo lỗi "dag.edges_are_llm_hub_spokes_only" — đúng luật, nhưng đổ
      // lỗi cho người dùng vì việc UI tự gây ra.
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
  const frameIdCounter = useRef(0);
  // Khung mới thường tạo ở x = frameCount * (FRAME_WIDTH + FRAME_GAP) — ngoài khung nhìn hiện tại
  // nếu đã có ≥1 khung từ trước, và `fitView` của `<ReactFlow>` CHỈ chạy đúng 1 lần lúc mount, nên
  // tạo khung xong không tự lia camera tới. Ghi id khung vừa tạo vào đây, `useEffect` bên dưới đợi
  // nó xuất hiện trong `nodes` (sau khi `setNodes` render xong) rồi mới `fitView` tới đúng khung đó.
  const pendingFocusFrameId = useRef<string | null>(null);
  const createFrame = useCallback((agentId: string) => {
    const trimmed = agentId.trim();
    if (!trimmed) return false;
    const taken = new Set(nodes.map((node) => node.id));
    let id: string;
    do {
      frameIdCounter.current += 1;
      id = `frame-${frameIdCounter.current}`;
    } while (taken.has(id));
    const frameCount = nodes.filter((node) => node.type === "agentFrame").length;
    const frameData: AgentFrameData = {
      agentId: trimmed,
      model: DEFAULT_HEADER.model,
      toolWhitelist: [],
      kbId: DEFAULT_HEADER.kb_id,
      goldenSetRef: DEFAULT_HEADER.golden_set_ref,
      successThreshold: DEFAULT_HEADER.scorecard_threshold.success,
      citationThreshold: DEFAULT_HEADER.scorecard_threshold.citation_accuracy,
    };
    let llmNodeId: string;
    do {
      idCounter.current += 1;
      llmNodeId = `n${idCounter.current}`;
    } while (taken.has(llmNodeId));

    const frameNode: FlowNode<CanvasNodeData> = {
      id,
      type: "agentFrame",
      // Khung mới tự xếp cạnh khung cuối cùng (trái→phải) — không cần thuật toán layout, chỉ
      // cần không đè lên khung đã có.
      position: { x: frameCount * (FRAME_WIDTH + FRAME_GAP), y: 0 },
      style: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      dragHandle: `.${AGENT_FRAME_DRAG_HANDLE}`,
      data: frameData as unknown as CanvasNodeData,
    };

    // Tự động khởi tạo 1 node `llm-step` (Reasoning Hub) cố định ở chính giữa khung
    const initialLlmNode: FlowNode<CanvasNodeData> = {
      id: llmNodeId,
      type: "recipeNode",
      parentId: id,
      extent: [
        [0, FRAME_HEADER],
        [Infinity, Infinity],
      ] as [[number, number], [number, number]],
      position: { x: Math.round((FRAME_WIDTH - 275) / 2), y: Math.round((FRAME_HEIGHT - 130) / 2) },
      data: { type: "llm-step", params: defaultParams("llm-step") },
    };

    setNodes((current) => [...current, frameNode, initialLlmNode]);
    setActiveFrameId(id);
    setSelectedNodeId(llmNodeId);
    setSelectedEdgeId(null);
    pendingFocusFrameId.current = id;
    return true;
  }, [nodes, setNodes]);

  // Lia camera tới khung vừa tạo (xem lý do ở khai báo `pendingFocusFrameId` phía trên).
  // Dùng `setCenter` theo tâm khung để chắc chắn camera nhảy đúng vị trí mới ngay cả khi viewport
  // hiện tại đang ở rất xa; `fitView` giữ làm fallback.
  useEffect(() => {
    const targetId = pendingFocusFrameId.current;
    if (!targetId) return;
    const target = nodes.find((node) => node.id === targetId);
    if (!target) return;
    pendingFocusFrameId.current = null;
    setActiveFrameId(targetId);
    setSelectedNodeId(targetId);
    setSelectedEdgeId(null);

    const style = (target.style ?? {}) as { width?: number; height?: number };
    const width = style.width ?? target.width ?? FRAME_WIDTH;
    const height = style.height ?? target.height ?? FRAME_HEIGHT;
    const centerX = target.position.x + width / 2;
    const centerY = target.position.y + height / 2;

    requestAnimationFrame(() => {
      reactFlowInstance.setCenter(centerX, centerY, {
        duration: 420,
        zoom: Math.min(1, Math.max(0.72, reactFlowInstance.getZoom() || 0.85)),
      });
      reactFlowInstance.fitView({ nodes: [{ id: targetId }], duration: 420, padding: 0.42, maxZoom: 1 });
    });
  }, [nodes, reactFlowInstance]);

  // Đổi version TẠI CHỖ cho 1 khung ĐÃ CÓ trên canvas — tái dùng ĐÚNG `frameId`/vị trí hiện tại,
  // xoá sạch node/cạnh cũ của khung đó trước khi nạp bản mới vào — đổi version không sinh
  // khung trùng. Dùng cho cụm rollback bằng dropdown ở panel trái.
  const switchFrameVersion = useCallback(
    async (frameId: string, agentId: string, version: number) => {
      try {
        const { recipe } = await getAgentRecipe(agentId, session, version);
        const { nodes: loadedNodes, edges: loadedEdges } = fromRecipe(recipe, {
          frameId,
          frameHeader: FRAME_HEADER,
          frameWidth: FRAME_WIDTH,
          frameHeight: FRAME_HEIGHT,
          version,
        });
        const [frameNode, ...childNodes] = loadedNodes;
        const loadedFrameData = frameNode.data as unknown as AgentFrameData;
        const loadedSnapshot = JSON.stringify(
          buildRecipe(frameHeader(loadedFrameData, tenantId, scope, childNodes), childNodes, loadedEdges),
        );
        const oldFrame = nodes.find((n) => n.id === frameId);
        if (!oldFrame) return;
        // Node id KHÔNG cùng 1 quy ước (`addNode` sinh `n1`/`n2`.. phẳng, `fromRecipe` sinh
        // `frameId__n1` có tiền tố) — lọc cạnh cũ theo `oldChildIds` (id NODE thật đang có, đọc từ
        // `nodes` hiện tại) thay vì đoán tiền tố chuỗi id cạnh, mới chắc chắn dọn sạch MỌI cạnh
        // của khung này (kể cả cạnh người dùng tự vẽ tay bằng `onConnect`, không theo khuôn
        // `e-${frameId}-${i}` của cạnh nạp từ recipe).
        const oldChildIds = new Set(nodes.filter((n) => n.parentId === frameId).map((n) => n.id));
        const positionedFrame = {
          ...frameNode,
          position: oldFrame.position, // giữ NGUYÊN vị trí khung — chỉ đổi nội dung bên trong
          data: { ...loadedFrameData, loadedSnapshot } as unknown as CanvasNodeData,
        };
        setNodes((current) => [
          ...current.filter((n) => n.id !== frameId && n.parentId !== frameId),
          positionedFrame,
          ...childNodes,
        ]);
        setEdges((current) => [
          ...current.filter((e) => !oldChildIds.has(e.source) && !oldChildIds.has(e.target)),
          ...loadedEdges,
        ]);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      } catch (err) {
        window.alert(
          `Không đổi được sang v${version}: ` + (err instanceof StudioApiError ? err.message : String(err)),
        );
      }
    },
    [session, nodes, setNodes, setEdges, tenantId, scope],
  );

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
  // nào active thì không có recipe nào để Test/Publish/lint — `null`, JSX bên dưới tự hiện trạng
  // thái tương ứng thay vì giả vờ có 1 recipe rỗng.
  const activeFrameNodes = useMemo(
    () => (activeFrameId ? nodesForFrame(activeFrameId, nodes) : []),
    [activeFrameId, nodes],
  );
  const activeFrameEdges = useMemo(
    () => (activeFrameId ? edgesForFrame(activeFrameId, nodes, edges) : []),
    [activeFrameId, nodes, edges],
  );

  // Test Mode (web#35) — id node `llm-step` (tâm hình sao, `agentTopologyLint` đảm bảo đúng 1),
  // nơi neo 2 cạnh giả `user_query`/`response`.
  const llmHubId = useMemo(() => findLlmHubId(activeFrameNodes), [activeFrameNodes]);

  // Test Mode (web#35) — với mỗi node thật, những vị trí (index) trong `testEvents` khớp với nó
  // (theo `node_type`, KHÔNG theo `node_id` — xem docstring `testMode.ts` giải thích vì sao
  // `run_agent_loop()` không cho phép khớp bằng id). `Map` rỗng khi chưa có lượt chạy nào.
  const nodeEventIndex = useMemo(
    () => (testEvents ? buildNodeEventIndex(testEvents, activeFrameNodes) : new Map<string, number[]>()),
    [testEvents, activeFrameNodes],
  );

  const header: RecipeHeader | null = activeFrameData
    ? frameHeader(activeFrameData, tenantId, scope, activeFrameNodes)
    : null;

  const recipe: WireRecipe | null = useMemo(
    () => {
      if (!header) return null;
      return buildRecipe(header, activeFrameNodes, activeFrameEdges);
    },
    // `header` được dựng mới mỗi render nên không đưa thẳng vào deps — liệt kê qua object gốc
    // (`activeFrameData`) + phần lọc theo khung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFrameData, tenantId, scope, activeFrameNodes, activeFrameEdges],
  );

  const violation = useMemo(() => (recipe ? firstBlockingFinding(recipe) : null), [recipe]);
  const notes = useMemo(() => (recipe ? advisories(recipe) : []), [recipe]);

  // Test Mode (web#35) — POST rồi GET lại (`fetchTrace`), CÙNG nguyên tắc D15 đã dùng ở
  // `TestAgentModal` cũ (không tin thẳng response POST) — khác đúng 1 chỗ: kết quả không đổ vào
  // 1 khung chat nữa, mà nạp vào `testEvents` để `useTestReplay` phát lại trên chính canvas.
  const runTestQuery = useCallback(async () => {
    if (!recipe || testSending || testQuery.trim().length === 0) return;
    setTestSending(true);
    setTestError(null);
    setTestEvents(null);
    testReplay.reset(false);
    try {
      const result = await sendTestChatMessage(recipe, testQuery, session);
      const trace = await fetchTrace(result.run_id, session);
      setTestAnswer(result.answer);
      setTestCitations(result.citations);
      setTestEvents(trace.events);
      testReplay.reset(true);
    } catch (error) {
      setTestError(error instanceof StudioApiError ? error.message : String(error));
    } finally {
      setTestSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe, testQuery, testSending, session]);

  const handleEvaluate = useCallback(async () => {
    if (!recipe) return;
    setEvaluateState("running");
    setEvaluateError(null);
    try {
      const scorecard = await evaluateAgent(recipe, session);
      setEvaluateResult(scorecard);
      setEvaluatedRecipeSnapshot(JSON.stringify(recipe));
      setEvaluateState("idle");
    } catch (error) {
      setEvaluateError(error instanceof StudioApiError ? error.message : String(error));
      setEvaluateResult(null);
      setEvaluatedRecipeSnapshot(null);
      setEvaluateState("error");
    }
  }, [recipe, session]);

  // Khung có bản gốc "sạch" khi vừa nạp/đổi version (`loadedSnapshot`, xem `AgentFrameData`) VÀ
  // canvas hiện tại VẪN khớp y hệt bản đó — bấm Publish lúc này chỉ là đưa ĐÚNG version đã có lên
  // live (`rollbackAgent`), không cần Chấm điểm lại (bản đó đã qua gate lúc publish gốc rồi).
  // Khung tạo tay (chưa từng publish, `loadedSnapshot` là `undefined`) không bao giờ rơi vào
  // nhánh này — không có gì để "đưa lên live" ngoài publish thật.
  const hasCleanLoadedVersion = useMemo(
    () =>
      activeFrameData?.loadedSnapshot !== undefined &&
      recipe !== null &&
      activeFrameData.loadedSnapshot === JSON.stringify(recipe),
    [activeFrameData, recipe],
  );

  // W3 (kit#206/web#14) — khung vừa nạp 1 recipe mang node ngoài 3 loại canvas hiển thị được
  // (`condition`/`hitl-pause`, xem `fromRecipe()`/`AgentFrameData.hiddenNodeTypes`). Node đó
  // KHÔNG có mặt trong `buildRecipe()` tiếp theo — publish bằng cách DỰNG LẠI recipe từ canvas
  // (nhánh (b) dưới) sẽ xoá chúng vĩnh viễn mà không ai để ý.
  const hasHiddenNodes = (activeFrameData?.hiddenNodeTypes?.length ?? 0) > 0;
  // Chỉ THẬT SỰ chặn khi Publish sẽ đi qua nhánh dựng-lại-từ-canvas (`publishAgent(recipe)`) —
  // nhánh rollback (`rollbackAgent(agentId, version)`) không gửi `recipe` nên node ẩn vô hại ở đó
  // (xem `canPublish` bên dưới). Banner/tooltip dùng cờ này để không báo "sẽ xoá" khi thực ra
  // không xoá gì.
  const hiddenNodesBlockPublish = hasHiddenNodes && !(hasCleanLoadedVersion && activeFrameData?.version !== undefined);

  // web#48 — CÙNG rủi ro/CÙNG pattern với `hasHiddenNodes` ở trên: khung vừa nạp 1 recipe publish
  // TRƯỚC KHI system_prompt bị bỏ khỏi UI, mang giá trị không rỗng (`fromRecipe()`). Publish qua
  // nhánh dựng-lại-từ-canvas (`frameHeader()` luôn hardcode `""`) sẽ ghi đè nó thành rỗng mà không
  // ai để ý — nhánh rollback không gửi `recipe` nên vô hại, cùng lý do `hiddenNodesBlockPublish`.
  const hasNonBlankSystemPrompt = activeFrameData?.hadNonBlankSystemPrompt === true;
  const systemPromptBlockPublish =
    hasNonBlankSystemPrompt && !(hasCleanLoadedVersion && activeFrameData?.version !== undefined);

  // Publish sáng ở 1 trong 2 nhánh, ứng đúng 2 API khác nhau ở `handlePublish`:
  // (a) bản gốc sạch (`hasCleanLoadedVersion` + có `version`) -> `rollbackAgent(agentId, version)`,
  //     server tự lấy lại bản đã lưu theo version, KHÔNG gửi `recipe` đi đâu cả -> không thể mất
  //     dữ liệu, `hasHiddenNodes` không áp dụng cho nhánh này (review vòng 2, dholmes0207 web#14:
  //     chặn nhánh này vừa thừa vừa sai — trước đó chặn CẢ 2 nhánh làm 1 recipe có
  //     condition/hitl-pause nạp về xong không rollback lại được nữa, mất tính năng D18 để đổi
  //     lấy an toàn không có thật ở nhánh này).
  // (b) đã Chấm điểm PASS cho ĐÚNG recipe hiện tại (dựng lại từ canvas qua `buildRecipe()`) — xem
  //     comment ở khai báo state `evaluatedRecipeSnapshot`. Đây là nhánh THẬT SỰ mất node ẩn, nên
  //     `!hasHiddenNodes` chỉ áp cho nhánh này.
  // `useMemo` — `JSON.stringify(recipe)` không tính lại mỗi render nếu `recipe` chưa đổi (nit
  // review web#8, TranBaDat2607 #6).
  const canPublish = useMemo(
    () =>
      (hasCleanLoadedVersion && activeFrameData?.version !== undefined) ||
      (!hasHiddenNodes &&
        !hasNonBlankSystemPrompt &&
        evaluateResult?.gate.verdict === "PASS" &&
        recipe !== null &&
        evaluatedRecipeSnapshot === JSON.stringify(recipe)),
    [hasHiddenNodes, hasNonBlankSystemPrompt, hasCleanLoadedVersion, activeFrameData, evaluateResult, recipe, evaluatedRecipeSnapshot],
  );

  const handlePublish = useCallback(async () => {
    if (!recipe || !canPublish || !activeFrameId || !activeFrameData) return;
    setPublishState("running");
    setPublishError(null);
    try {
      if (hasCleanLoadedVersion && activeFrameData.version !== undefined) {
        const result = await rollbackAgent(activeFrameData.agentId, activeFrameData.version, session);
        setPublishResult({ status: "published", scorecard: null, message: `Đã đưa v${result.version} lên live.` });
      } else {
        const result = await publishAgent(recipe, session);
        setPublishResult(result);
      }
      setPublishState("idle");
    } catch (error) {
      setPublishError(error instanceof StudioApiError ? error.message : String(error));
      setPublishState("error");
    }
  }, [recipe, session, canPublish, hasCleanLoadedVersion, activeFrameId, activeFrameData]);

  // Trước workbench#48: node bị `graph_lint()`/`graphLint()` chỉ mặt (`LintViolation.nodeId`)
  // được tô đỏ ở đây, tính lúc render thay vì ghi cờ `invalid` vào state (cờ trong state sẽ phải
  // đồng bộ tay mỗi lần lint đổi). `agentShapeLint`/`agentTopologyLint` (BlockingFinding, web#34)
  // không còn trả `nodeId` — 2 lint mới không gắn finding với 1 node cụ thể — nên không còn gì để
  // tô đỏ theo cách này nữa; giữ lại alias `displayNodes = nodes` để 2 chỗ dùng bên dưới
  // (`selectedNode`, `<ReactFlow nodes=…>`) không phải đổi tên.
  const displayNodes = nodes;


  // Test Mode (web#35) — overlay TUẦN TÚY render trên `<ReactFlow>`, không bao giờ đụng
  // `nodes`/`edges` (state canvas thật, thứ duy nhất `recipe`/`buildRecipe()` đọc). 2 node giả +
  // 2 cạnh giả chỉ sống trong 2 memo này, biến mất hoàn toàn khi `testMode` tắt.
  const activeFrameNode = useMemo(
    () => nodes.find((node) => node.id === activeFrameId) ?? null,
    [nodes, activeFrameId],
  );

  const nodesForCanvas = useMemo(() => {
    if (!testMode) return displayNodes;
    const withHighlight = displayNodes.map((node) => {
      if (node.type !== "recipeNode") return node;
      const testHighlight = highlightForNode(nodeEventIndex.get(node.id), testReplay.status, testReplay.index);
      // web#45 — cờ `testModeHub` CHỈ true cho đúng node `llm-step` (id === llmHubId), để
      // `RecipeNode` render thêm 2 cổng trái/phải nối 2 node giả câu hỏi/phản hồi bên dưới.
      const isHub = node.id === llmHubId;
      if (!testHighlight && !isHub) return node;
      return {
        ...node,
        data: { ...node.data, ...(testHighlight ? { testHighlight } : {}), ...(isHub ? { testModeHub: true } : {}) },
      };
    });
    if (!activeFrameNode) return withHighlight;
    const frameX = activeFrameNode.position.x;
    const frameY = activeFrameNode.position.y;
    const responseStatus: "idle" | "waiting" | "answered" | "error" = testError
      ? "error"
      : testReplay.status === "done"
        ? "answered"
        : testEvents
          ? "waiting"
          : "idle";
    const queryDims = pseudoNodeDims[TEST_QUERY_NODE_ID];
    const responseDims = pseudoNodeDims[TEST_RESPONSE_NODE_ID];
    const queryNode: FlowNode = {
      id: TEST_QUERY_NODE_ID,
      type: "testQuery",
      // Đặt bên TRÁI khung (thẩm mỹ ưu tiên hơn — quyết định chốt cùng user). Rủi ro đè lên khung
      // kế bên khi có nhiều agent được xử lý bằng cách LUÔN auto-focus/fit-view đúng khung + 2
      // node giả này lúc vào Test Mode (xem effect `fitView` theo `activeFrameId`/`testMode` bên
      // dưới) — người dùng không cần tự pan để thấy, và khung khác (nếu bị che) không nằm trong
      // khung nhìn nên không gây rối.
      position: { x: frameX - 300, y: frameY + FRAME_HEADER + 30 },
      draggable: false,
      selectable: false,
      ...queryDims,
      data: {
        kind: "test-query",
        query: testQuery,
        onQueryChange: setTestQuery,
        onRun: runTestQuery,
        running: testSending,
      },
    };
    const responseNode: FlowNode = {
      id: TEST_RESPONSE_NODE_ID,
      type: "testResponse",
      position: { x: frameX + FRAME_WIDTH + 40, y: frameY + FRAME_HEADER + 30 },
      draggable: false,
      selectable: false,
      ...responseDims,
      data: {
        kind: "test-response",
        status: responseStatus,
        answer: testAnswer,
        citations: testCitations,
        errorMessage: testError,
      },
    };
    return [...withHighlight, queryNode, responseNode];
  }, [
    testMode,
    displayNodes,
    nodeEventIndex,
    testReplay.status,
    testReplay.index,
    llmHubId,
    activeFrameNode,
    testQuery,
    runTestQuery,
    testSending,
    testError,
    pseudoNodeDims,
    testEvents,
    testAnswer,
    testCitations,
  ]);

  const edgesForCanvas = useMemo(() => {
    if (!testMode) return edges;
    // Không hiện badge/label trên cạnh — xem trace là BẤM VÀO CẠNH đó (`onEdgeClick` dưới), cạnh
    // ở đây chỉ đổi màu "đã đi qua" (node nguồn đã có ít nhất 1 event khớp) làm gợi ý trực quan.
    const withProgress = edges.map((edge) => {
      const matched = nodeEventIndex.get(edge.source);
      const reached = matched?.some((position) => position <= testReplay.index);
      if (!reached) return edge;
      return { ...edge, style: { ...edge.style, stroke: "var(--good)", strokeWidth: 2.5 } };
    });
    if (!llmHubId) return withProgress;
    // Neo cả 2 cạnh giả vào ĐÚNG tâm hình sao (`llm-step`) — không còn khái niệm "node đầu/cuối
    // chuỗi" từ khi canvas đổi sang hình sao (workbench#48): mọi cánh (kb-retrieve/tool-call) nối
    // trực tiếp tâm, không có thứ tự hình học nào để gọi là "đầu" hay "cuối" nữa.
    const started = testReplay.status !== "idle";
    const finished = testReplay.status === "done";
    // web#45 — `llm-step` giờ có 3 cổng lúc Test Mode (bottom-target cho cạnh DAG thật, cộng 2 cổng
    // trái/phải chỉ Test Mode mới có, `RecipeNode.tsx`) — phải chỉ đích danh `sourceHandle`/
    // `targetHandle` cho 2 cạnh giả này, không còn suy ra được cổng duy nhất như trước. `markerEnd`
    // đặt tường minh ở đây vì `DEFAULT_EDGE_OPTIONS` không còn mũi tên mặc định (đồ thị thật vô
    // hướng) — 2 cạnh giả này là chỗ DUY NHẤT còn hướng thật, vẫn cần mũi tên.
    const testEdgeMarker = { type: MarkerType.ArrowClosed, width: 15, height: 15, color: EDGE_COLOR };
    const queryEdge: FlowEdge = {
      id: "__test_edge_query__",
      source: TEST_QUERY_NODE_ID,
      sourceHandle: "test-query-out",
      target: llmHubId,
      targetHandle: "test-hub-in",
      style: { stroke: started ? "var(--good)" : "var(--ink-faint)", strokeWidth: started ? 2.5 : 2, strokeDasharray: "4 4" },
      markerEnd: testEdgeMarker,
    };
    const responseEdge: FlowEdge = {
      id: "__test_edge_response__",
      source: llmHubId,
      sourceHandle: "test-hub-out",
      target: TEST_RESPONSE_NODE_ID,
      targetHandle: "test-response-in",
      style: { stroke: finished ? "var(--good)" : "var(--ink-faint)", strokeWidth: finished ? 2.5 : 2, strokeDasharray: "4 4" },
      markerEnd: testEdgeMarker,
    };
    return [...withProgress, queryEdge, responseEdge];
  }, [testMode, edges, llmHubId, nodeEventIndex, testReplay.status, testReplay.index]);

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

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setNewAgentId("");
                  setCreateAgentOpen(true);
                }}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
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
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <select
                  aria-label="Chọn phiên bản rollback"
                  value={rollbackVersion}
                  disabled={!activeFrameData || activeAgentVersions.length === 0}
                  onChange={(e) => setRollbackVersion(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 9px",
                    fontSize: 12,
                    borderRadius: 7,
                    border: "1px solid var(--line-strong)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {!activeFrameData || activeAgentVersions.length === 0 ? (
                    <option value="">Chưa có phiên bản publish</option>
                  ) : (
                    activeAgentVersions.map((v) => (
                      <option key={v.version} value={String(v.version)}>
                        v{v.version} — {v.status}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  disabled={!activeFrameData || !activeFrameId || !rollbackVersion}
                  onClick={() => {
                    if (!activeFrameData || !activeFrameId) return;
                    const v = Number(rollbackVersion);
                    if (!Number.isInteger(v)) return;
                    switchFrameVersion(activeFrameId, activeFrameData.agentId, v);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    padding: "9px 10px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    borderRadius: 7,
                    border: "1px solid var(--line-strong)",
                    background: !activeFrameData || !activeFrameId || !rollbackVersion ? "var(--surface-2)" : "var(--surface)",
                    color: !activeFrameData || !activeFrameId || !rollbackVersion ? "var(--ink-faint)" : "var(--ink-soft)",
                    cursor: !activeFrameData || !activeFrameId || !rollbackVersion ? "not-allowed" : "pointer",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  Rollback
                </button>
              </div>
            </div>

            <Palette onAdd={(type) => addNode(type)} allowedTypes={DRAGGABLE_NODE_TYPES} />

            <div style={sectionStyle}>Agent đang sửa</div>
            {frameNodes.length > 0 && (
              <select
                aria-label="Chọn agent trên canvas"
                value={activeFrameId ?? ""}
                onChange={(e) => {
                  const frameId = e.target.value;
                  if (frameId) focusFrame(frameId);
                }}
                style={{
                  marginTop: 6,
                  width: "100%",
                  padding: "5px 7px",
                  fontSize: 11.5,
                  borderRadius: 5,
                  border: "1px solid var(--line-strong)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontFamily: "var(--font-body)",
                }}
              >
                <option value="">— Chọn agent để focus —</option>
                {frameNodes.map((frameNode) => {
                  const data = frameNode.data as unknown as AgentFrameData;
                  return (
                    <option key={frameNode.id} value={frameNode.id}>
                      {data.agentId || "(chưa đặt tên)"}
                      {data.version !== undefined ? ` · v${data.version}` : ""}
                    </option>
                  );
                })}
              </select>
            )}
            {frameNodes.length === 0 && (
              <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 6 }}>Chưa có agent nào.</div>
            )}
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
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background:
            "radial-gradient(circle at 8% 8%, rgba(47,102,89,0.14) 0%, rgba(47,102,89,0.04) 30%, transparent 56%), radial-gradient(circle at 88% 16%, rgba(61,90,128,0.14) 0%, rgba(61,90,128,0.05) 34%, transparent 60%), var(--paper)",
        }}
      >
        <div
          style={{ flexGrow: 1, minHeight: 0, position: "relative" }}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <ReactFlow
            nodes={nodesForCanvas}
            edges={edgesForCanvas}
            onNodesChange={handleCanvasNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={NODE_TYPES_MAP}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            proOptions={{ hideAttribution: true }}
            // Test Mode (web#35) — khoá sửa hẳn trong lúc xem replay (kéo/nối node dễ làm hỏng
            // hình dung "đây là ảnh chụp 1 lượt chạy", không phải đang thiết kế). Thoát Test Mode
            // là cách duy nhất mở khoá lại.
            nodesDraggable={!testMode}
            nodesConnectable={!testMode}
            // Tắt hẳn cơ chế Backspace/Delete MẶC ĐỊNH của react-flow — nó chỉ biết xoá đúng
            // phần tử được chọn theo MODEL SELECTION riêng của nó (`node.selected`), khác hẳn
            // `selectedNodeId`/`selectedEdgeId` app tự quản, và quan trọng hơn: listener của nó
            // nuốt mất sự kiện phím trước khi tới được `window` (xem `useEffect` Backspace bên
            // trên `Studio`) — 2 cơ chế đụng nhau, chỉ giữ đúng 1.
            deleteKeyCode={null}
            onNodeClick={(_, node) => {
              // Test Mode: bấm THÂN node không mở gì cả — xem trace giờ bấm vào CẠNH nối tới/từ
              // nó (`onEdgeClick` bên dưới), không phải bấm node hay cổng của nó.
              if (testMode) return;
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
              if (testMode) return;
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
              // `llm-step` — modal riêng (system_prompt + temperature gộp 1 chỗ, có validate),
              // không phải `NodeConfigModal` generic (xem `LlmStepConfigModal.tsx`).
              if (node.data.type === "llm-step") {
                setLlmStepConfigOpen(true);
              } else {
                setNodeConfigOpen(true);
              }
            }}
            onEdgeClick={(_, edge) => {
              if (testMode) {
                setTestDetailEdge({ source: edge.source, target: edge.target });
                return;
              }
              const ownerFrameId = nodes.find((n) => n.id === edge.source)?.parentId;
              if (ownerFrameId) setActiveFrameId(ownerFrameId);
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onEdgeDoubleClick={(_, edge) => {
              if (testMode) return;
              const ownerFrameId = nodes.find((n) => n.id === edge.source)?.parentId;
              if (ownerFrameId) setActiveFrameId(ownerFrameId);
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
              setEdgeConfigOpen(true);
            }}
            onPaneClick={() => {
              if (testMode) {
                setTestDetailEdge(null);
                return;
              }
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            fitView
          >
            <Background color="rgba(44, 56, 52, 0.48)" gap={22} size={1.9} />
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
                nodeColor={(n) =>
                  n.type === "recipeNode" ? nodeSpec((n.data as CanvasNodeData).type).color : "transparent"
                }
                nodeStrokeColor="rgba(255,255,255,0.45)"
                nodeStrokeWidth={1.5}
                nodeBorderRadius={6}
                maskColor="rgba(8,14,24,0.6)"
                maskStrokeColor="transparent"
                maskStrokeWidth={0}
                ariaLabel="Minimap kiểu Hextech"
              />
            )}
          </ReactFlow>

          {testMode && (
            <div
              style={{
                position: "absolute",
                top: 16,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 999,
                background: "var(--surface)",
                border: "1px solid var(--line-strong)",
                boxShadow: "var(--shadow-md)",
                zIndex: 20,
              }}
            >
              {testEvents && (
                <>
                  {/* Không có nút tạm dừng — xem trace giờ bấm được ở cổng VÀO/RA bất kỳ lúc
                      nào (đang phát/đã xong/chưa chạy), tạm dừng animation không mở khoá thêm gì.
                      Nút này chỉ còn 1 việc: phát LẠI từ đầu, dùng được cả khi đã xong. */}
                  <button
                    type="button"
                    onClick={testReplay.play}
                    disabled={testReplay.status === "playing"}
                    title={testReplay.status === "playing" ? "Đang phát…" : "Phát lại luồng chạy"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      border: "none",
                      cursor: testReplay.status === "playing" ? "default" : "pointer",
                      background: testReplay.status === "playing" ? "var(--surface-2)" : "var(--good)",
                      color: testReplay.status === "playing" ? "var(--ink-faint)" : "#fff",
                    }}
                  >
                    <PlayIcon size={14} />
                  </button>
                  <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>
                    {testReplay.status === "done"
                      ? "Đã xong"
                      : `Bước ${Math.max(testReplay.index + 1, 0)}/${testEvents.length}`}
                  </span>
                  <span style={{ width: 1, height: 18, background: "var(--line)" }} />
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setTestMode(false);
                  resetTestRun();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  borderRadius: 999,
                  border: "1px solid var(--line-strong)",
                  background: "transparent",
                  color: "var(--ink-soft)",
                  cursor: "pointer",
                }}
              >
                <CloseIcon size={13} /> Thoát chế độ test
              </button>
            </div>
          )}

          {testMode && testDetailEdge && (() => {
            const { source, target } = testDetailEdge;
            // Với 1 node THẬT: nhãn/màu lấy từ `nodeSpec(node_type)`, nội dung là các event chính
            // nó tạo ra (khớp bằng `nodeEventIndex` — theo `node_type`, không theo id, xem
            // docstring `testMode.ts`). 2 node giả có nội dung cố định riêng.
            const resolve = (nodeId: string): { label: string; content: TestTraceDetailContent } => {
              if (nodeId === TEST_QUERY_NODE_ID) {
                return { label: "Câu hỏi người dùng", content: { kind: "text", text: testQuery || "(chưa gõ câu hỏi nào)" } };
              }
              if (nodeId === TEST_RESPONSE_NODE_ID) {
                const last = testEvents?.at(-1);
                return {
                  label: "Phản hồi",
                  content: last ? { kind: "events", events: [last] } : { kind: "text", text: "(chưa có lượt chạy nào)" },
                };
              }
              const positions = nodeEventIndex.get(nodeId);
              if (!positions || positions.length === 0 || !testEvents) {
                return { label: nodeId, content: { kind: "text", text: "(chưa chạy tới)" } };
              }
              // `WireTraceEvent.node_type` gõ `string` (TS mirror rộng hơn thật) — nhưng
              // `run_agent_loop()` chỉ phát đúng 3/6 loại đóng (`llm-step`/`kb-retrieve`/
              // `tool-call`, xem `agent_loop.py` handoff #2 K6), luôn hợp lệ cho `nodeSpec()`.
              const nodeType = testEvents[positions[0]].node_type as NodeType;
              return { label: nodeSpec(nodeType).label, content: { kind: "events", events: positions.map((p) => testEvents[p]) } };
            };
            const from = resolve(source);
            const to = resolve(target);
            // "VÀO — đích: X" nghĩa là "thứ chảy vào X" — trong chuỗi thẳng (graph_lint luật 3/4),
            // đó CHÍNH LÀ output của node nguồn, không phải output CỦA CHÍNH X (khác hẳn ý nghĩa).
            // Ngoại lệ: cạnh vào `__test_response__` có nghĩa đặc biệt hơn (LUÔN là turn CUỐI
            // CÙNG — `agent_loop.py` đảm bảo event cuối luôn là LLM_STEP trả lời — không nhất
            // thiết = tất cả event của node nguồn nếu node đó chạy nhiều turn), nên giữ nguyên
            // `to.content` (từ `resolve(TEST_RESPONSE_NODE_ID)`) cho đúng ca này.
            const accent =
              source === TEST_QUERY_NODE_ID || source === TEST_RESPONSE_NODE_ID
                ? "var(--ink-soft)"
                : (() => {
                    const positions = nodeEventIndex.get(source);
                    return positions && positions.length > 0 && testEvents
                      ? nodeSpec(testEvents[positions[0]].node_type as NodeType).color
                      : "var(--ink-soft)";
                  })();
            // web#45 — riêng cạnh `llm-step → Phản hồi`: thay 2 section RA/VÀO (chỉ thấy lượt
            // cuối của llm-step) bằng 1 timeline TOÀN BỘ `testEvents` theo đúng thứ tự, để thấy rõ
            // đã chạy qua tool-call/kb-retrieve nào giữa các lượt LLM trước khi ra câu trả lời
            // cuối. Mọi cạnh khác (query→hub, spoke↔hub) giữ nguyên 2-section RA/VÀO như cũ.
            const isResponseEdge = source === llmHubId && target === TEST_RESPONSE_NODE_ID;
            const sections = isResponseEdge
              ? [
                  {
                    label: "Toàn bộ luồng thực thi",
                    content:
                      testEvents && testEvents.length > 0
                        ? ({ kind: "timeline", events: testEvents } as TestTraceDetailContent)
                        : ({ kind: "text", text: "(chưa có lượt chạy nào)" } as TestTraceDetailContent),
                  },
                ]
              : [
                  { label: `RA — ${from.label}`, content: from.content },
                  { label: `VÀO — ${to.label}`, content: target === TEST_RESPONSE_NODE_ID ? to.content : from.content },
                ];
            return (
              <TestTraceDetail
                key={`${source}->${target}`}
                accent={accent}
                sections={sections}
                onClose={() => setTestDetailEdge(null)}
              />
            );
          })()}
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
      {/* Tiêu đề panel — CÙNG kiểu chữ với "Workbench" bên trái (serif, không viết hoa toàn bộ):
          trước đây panel này mở màn thẳng bằng nhãn nhỏ viết hoa "PLAYGROUND" (kiểu `sectionStyle`
          dùng cho các mục CON như "Chấm điểm"/"Publish" bên dưới) — nhìn như 1 mục con lơ lửng
          không có tiêu đề panel, khiến 2 cột trông như 2 hệ thiết kế khác nhau (phản hồi: "chữ
          Playground... sao khác chữ Workbench thế"). Panel này giờ có đúng 1 tiêu đề cấp panel
          (`h2`, GIỐNG hệt font/cỡ/độ đậm "Workbench"), các nhãn `sectionStyle` bên dưới quay lại
          đúng vai trò eyebrow cho TỪNG mục con. Căn PHẢI (khác "Workbench" căn trái) — 2 tiêu đề
          soi gương nhau qua trục giữa canvas, mỗi bên hướng ra đúng mép ngoài panel của nó (phản
          hồi riêng: "Playground phải để bên phải thanh panel bên phải"). */}
      <h2
        style={{
          fontSize: 15,
          margin: 0,
          marginBottom: 10,
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          textAlign: "right",
        }}
      >
        Playground
      </h2>
      {recipe ? (
        <>
        {/* Chỉ hiện khi ĐỎ — lint xanh là trạng thái BÌNH THƯỜNG (đa số thời gian), không phải
            thành tích cần khoe liên tục; hiện "sạch" thường trực chỉ là nhiễu mắt. Vẫn hiện ngay
            khi vi phạm (Test/Publish bị khoá thì phải rõ vì sao). */}
        {violation && (
        // web#46 — 1 dòng thay vì 2 (nhãn lint + câu chi tiết xếp chồng trước đây): `violation.label`
        // ("agent_shape_lint"/"agent_topology_lint") chuyển vào `title` (tooltip), không chiếm chỗ
        // thường trực — banner chỉ cần đủ để thấy NGAY luật nào fail, không cần đọc hết mọi lần.
        <div
          title={`${violation.label}: TỪ CHỐI`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 10px",
            borderRadius: 6,
            border: "1px solid var(--bad)",
            background: "var(--bad-soft)",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--bad)",
          }}
        >
          <XCircleIcon size={14} style={{ flexShrink: 0 }} />
          <code style={{ fontSize: 11 }}>[{violation.rule}]</code>
          <span style={{ fontWeight: 400 }}>{violation.message}</span>
        </div>
        )}

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
              Lưu ý
            </div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "var(--ink-soft)" }}>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div style={{ marginTop: 4, color: "var(--warn)" }}>Không chặn Test/Publish.</div>
          </div>
        )}

        <button
          type="button"
          disabled={violation !== null}
          onClick={() => setTestMode(true)}
          title={violation ? `${violation.label} đang từ chối recipe này` : "Vào Test Mode — chạy thử thật ngay trên canvas, chưa cần publish"}
          style={{
            ...inputStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            cursor: violation ? "not-allowed" : "pointer",
            fontWeight: 700,
            color: "#fff",
            background: violation ? "var(--ink-faint)" : "var(--good)",
            border: "none",
            padding: 9,
          }}
        >
          {violation ? (
            "Bị chặn — recipe chưa qua lint"
          ) : (
            <>
              <PlayIcon size={14} /> Chạy thử (chưa publish)
            </>
          )}
        </button>

        <div style={{ ...sectionStyle, marginTop: 12 }}>Chấm điểm</div>
        <button
          type="button"
          disabled={violation !== null || evaluateState === "running"}
          onClick={handleEvaluate}
          title={
            violation
              ? `${violation.label} đang từ chối recipe này — cùng luật fail-closed với Test`
              : "Chạy nguyên golden_set_ref qua EvalHarness thật — chỉ xem điểm, không ghi DB, không publish"
          }
          style={{
            ...inputStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            cursor: violation || evaluateState === "running" ? "not-allowed" : "pointer",
            fontWeight: 700,
            color: "#fff",
            background: violation ? "var(--ink-faint)" : evaluateState === "running" ? "var(--ink-soft)" : "var(--node-llm-step)",
            border: "none",
            padding: 9,
          }}
        >
          {violation ? "Bị chặn — recipe chưa qua lint" : evaluateState === "running" ? "Đang chấm điểm…" : "Chấm điểm"}
        </button>
        {evaluateError && (
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
            {evaluateError}
          </div>
        )}
        {evaluateResult && (
          <div
            style={{
              marginTop: 6,
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${evaluateResult.gate.verdict === "PASS" ? "var(--good)" : "var(--warn)"}`,
              background: evaluateResult.gate.verdict === "PASS" ? "var(--good-soft)" : "var(--warn-soft)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: evaluateResult.gate.verdict === "PASS" ? "var(--good)" : "var(--warn)",
            }}
          >
            verdict={evaluateResult.gate.verdict} · success_rate=
            {evaluateResult.aggregate.success_rate.toFixed(2)} · citation_accuracy=
            {evaluateResult.aggregate.citation_accuracy?.toFixed(2) ?? "n/a (chưa đo)"}
          </div>
        )}

        <div style={{ ...sectionStyle, marginTop: 12 }}>Publish</div>
        {hiddenNodesBlockPublish && (
          <div
            style={{
              padding: "8px 10px",
              marginBottom: 8,
              borderRadius: 7,
              border: "1px solid var(--warn)",
              background: "color-mix(in srgb, var(--warn) 12%, transparent)",
              color: "var(--warn)",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            Recipe đang nạp có node ({activeFrameData?.hiddenNodeTypes?.join(", ")}) không hiển thị
            được trên canvas rút gọn này. Publish tiếp từ đây sẽ xoá vĩnh viễn các node đó — đã
            chặn Publish cho tới khi xử lý riêng.
          </div>
        )}
        {systemPromptBlockPublish && (
          <div
            style={{
              padding: "8px 10px",
              marginBottom: 8,
              borderRadius: 7,
              border: "1px solid var(--warn)",
              background: "color-mix(in srgb, var(--warn) 12%, transparent)",
              color: "var(--warn)",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            Agent này từng có system_prompt. Publish tiếp từ canvas sẽ xoá nó — dùng "đưa version
            lên live" nếu chỉ muốn publish lại nguyên bản cũ.
          </div>
        )}
        <button
          type="button"
          disabled={violation !== null || publishState === "running" || !canPublish}
          onClick={handlePublish}
          title={
            violation
              ? `${violation.label} đang từ chối recipe này — cùng luật fail-closed với Test`
              : hiddenNodesBlockPublish
                ? `Bị chặn: recipe có node ẩn (${activeFrameData?.hiddenNodeTypes?.join(", ")}) không hiển thị trên canvas — publish sẽ xoá mất chúng`
                : systemPromptBlockPublish
                  ? "Bị chặn: agent này từng có system_prompt — publish từ canvas sẽ xoá nó"
                  : !canPublish
                    ? "Bấm \"Chấm điểm\" trước — Publish chỉ sáng khi verdict PASS cho đúng recipe hiện tại trên canvas"
                    : hasCleanLoadedVersion
                      ? "Chưa sửa gì so với bản đã nạp — đưa thẳng version này lên live, không cần Chấm điểm lại"
                      : "Publish thật — server tự chấm điểm lại từ đầu rồi gate qua publish() thật"
          }
          style={{
            ...inputStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            cursor: violation || publishState === "running" || !canPublish ? "not-allowed" : "pointer",
            fontWeight: 700,
            color: "#fff",
            background:
              violation || !canPublish
                ? "var(--ink-faint)"
                : publishState === "running"
                  ? "var(--ink-soft)"
                  : "var(--accent)",
            border: "none",
            padding: 9,
          }}
        >
          {violation ? (
            "Bị chặn — recipe chưa qua lint"
          ) : publishState === "running" ? (
            "Đang publish…"
          ) : hasCleanLoadedVersion && activeFrameData?.version !== undefined ? (
            <>
              <BroadcastIcon size={14} /> Publish — đưa v{activeFrameData.version} lên live
            </>
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
              {publishResult.status === "published"
                ? publishResult.message ?? "Đã publish thành công"
                : "Bị chặn — chưa publish"}
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
            {onNavigate && publishResult.status === "published" && (
              <button
                type="button"
                onClick={() => onNavigate("chat")}
                style={{
                  marginTop: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: "1px solid var(--good)",
                  background: "transparent",
                  color: "var(--good)",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                Sang tab Chat để thử
              </button>
            )}
          </div>
        )}
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--ink-faint)", textAlign: "center", padding: "20px 10px" }}>
          Chưa có agent nào. Bấm "Tạo agent" để bắt đầu.
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
        locked={activeFrameData.version !== undefined}
        onClose={() => setConfigOpen(false)}
      />
    )}

    {nodeConfigOpen && selectedNode && (
      <NodeConfigModal
        node={selectedNode}
        session={session}
        onParamChange={onParamChange}
        onDeleteNode={deleteNode}
        onClose={() => setNodeConfigOpen(false)}
      />
    )}

    {llmStepConfigOpen && selectedNode && activeFrameData && (
      <LlmStepConfigModal
        node={selectedNode}
        onTemperatureChange={(nodeId, value) => onParamChange(nodeId, "temperature", value)}
        onClose={() => setLlmStepConfigOpen(false)}
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
    {createAgentOpen && (
      <CreateAgentModal
        agentId={newAgentId}
        onAgentIdChange={setNewAgentId}
        onClose={() => setCreateAgentOpen(false)}
        onSubmit={() => {
          if (createFrame(newAgentId)) {
            setCreateAgentOpen(false);
            setNewAgentId("");
          }
        }}
      />
    )}
    </>
  );
}

interface CreateAgentModalProps {
  agentId: string;
  onAgentIdChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function CreateAgentModal({ agentId, onAgentIdChange, onClose, onSubmit }: CreateAgentModalProps) {
  const trimmed = agentId.trim();
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,14,24,0.52)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 120,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 94vw)",
          borderRadius: 14,
          border: "1px solid var(--line-strong)",
          background:
            "linear-gradient(165deg, rgba(47,102,89,0.12) 0%, rgba(47,102,89,0.04) 22%, var(--paper) 58%)",
          boxShadow: "var(--shadow-md)",
          padding: "20px 22px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontFamily: "var(--font-display)", color: "var(--ink)" }}>Tạo Agent Mới</h2>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.45 }}>
          Nhập tên agent (agent_id) để tạo khung mới trên canvas.
        </div>

        <label
          htmlFor="new-agent-id"
          style={{ display: "block", marginTop: 14, marginBottom: 6, fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}
        >
          agent_id
        </label>
        <input
          id="new-agent-id"
          autoFocus
          value={agentId}
          onChange={(e) => onAgentIdChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed) onSubmit();
          }}
          placeholder="vd: agent-hr-assistant"
          style={{
            width: "100%",
            padding: "11px 12px",
            borderRadius: 9,
            border: "1px solid var(--line-strong)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontSize: 14,
            fontFamily: "var(--font-mono)",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink-soft)",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={onSubmit}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "1px solid var(--tier-admin)",
              background: trimmed ? "var(--tier-admin)" : "var(--line-strong)",
              color: "#fff",
              fontWeight: 700,
              cursor: trimmed ? "pointer" : "not-allowed",
              fontFamily: "var(--font-body)",
            }}
          >
            Tạo agent
          </button>
        </div>
      </div>
    </div>
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
  /** Agent đã publish ít nhất 1 lần (`activeFrameData.version !== undefined`) — khoá sửa tên.
   * `agent_id` KHÔNG có khái niệm "tên hiển thị" tách biệt trong hệ thống: mọi API (`GET /api/
   * agents/{agent_id}/recipe`, `/rollback`, `/versions`, publish, test-chat) đều tra thẳng bằng
   * đúng chuỗi này — "đổi tên" 1 agent đã publish thực chất là trỏ canvas sang 1 agent_id khác
   * (rất có thể chưa tồn tại), KHÔNG đổi tên bản ghi cũ: version/rollback cũ bị mồ côi ngay lập
   * tức, lần Publish tiếp theo tạo hẳn 1 agent mới thay vì version mới của agent đang sửa. Khoá
   * lại thay vì âm thầm cho sửa — agent MỚI (chưa publish lần nào) vẫn sửa thoải mái. */
  locked: boolean;
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

function AgentConfigModal({ agentId, onAgentIdChange, locked, onClose }: AgentConfigModalProps) {
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
          width: "min(440px, 96vw)",
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

        {/* web#38 — rút gọn còn ĐÚNG 1 việc: đổi tên agent. `model`/`tool_whitelist`/`kb_id`/
            `golden_set_ref`/ngưỡng chấm điểm không còn sửa được qua modal này nữa — luôn dùng
            `DEFAULT_HEADER` (`recipe/sample.ts`). web#48 — `system_prompt` không còn sửa được ở
            đâu nữa (kể cả `LlmStepConfigModal`), luôn rỗng (`App.tsx::frameHeader()`). */}
        <Card title="Định danh">
          <label style={modalLabelStyle}>Tên agent</label>
          <input
            value={agentId}
            onChange={(e) => onAgentIdChange(e.target.value)}
            disabled={locked}
            style={{ ...modalInputStyle, ...(locked ? { color: "var(--ink-faint)", cursor: "not-allowed" } : {}) }}
          />
          {locked && (
            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 5 }}>
              Agent này đã publish ít nhất 1 lần — khoá đổi tên để không mất version/rollback cũ
              (đổi tên thực chất là trỏ sang 1 agent khác, không đổi tên bản ghi đang có).
            </div>
          )}
        </Card>

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

function CanvasView({
  session,
  onNavigate,
}: {
  session: Session;
  onNavigate?: (tab: AdminTab) => void;
}) {
  // Bọc `ReactFlowProvider` quanh `Studio` — quy ước an toàn của react-flow khi component render
  // `<ReactFlow>` cũng là nơi mọi state/logic canvas sống (kể cả khi hiện tại không gọi thẳng
  // `useReactFlow()` nào ở tầng này nữa).
  return (
    <ReactFlowProvider>
      <Studio session={session} onNavigate={onNavigate} />
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
  if (session.systemRoles.includes("superadmin")) return "superadmin";
  if (session.systemRoles.includes("admin")) return "admin";
  return "employee";
}

// 2 nhóm rõ rệt: "Agent" (xây/dùng thử) và "Công ty" (nhân viên + tài liệu) — tách bằng 1 vạch
// đứng khi render (xem `GROUP_BREAK_AFTER`), để hàng tab không còn là 1 dải phẳng như nhau — admin
// cần biết "Canvas"/"Dùng thử" là 2 góc nhìn của CÙNG 1 việc (xây agent), khác hẳn "Nhân viên"/
// "Tài liệu" (vận hành công ty). Không còn tab "Agent đã publish" riêng — chọn/xem version giờ
// nằm ngay trên Canvas (nút "Mở agent đã publish" + dropdown version tại chỗ ở "Agent đang sửa").
// "Phòng ban" không còn là tab riêng — nó chỉ là danh sách tham chiếu CHỈ ĐỌC dùng lúc tạo/sửa
// nhân viên (xem `SectionsTab` docstring), nên gộp làm khối trên cùng của tab "Nhân viên".
const ADMIN_TABS = [
  ["canvas", "Canvas", GridIcon],
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
        {/* Luôn mounted, chỉ ẩn/hiện bằng CSS — gỡ hẳn `<CanvasView/>` đúng lúc đổi tab thì mất
            luôn `nodes`/`edges`/selection/modal đang mở (state cục bộ nằm trong `Studio`,
            `apps/web` không có store dùng chung) — quay lại tab Canvas coi như bắt đầu lại từ
            đầu, mất hết agent đang xây dở. */}
        <div style={{ display: screen === "canvas" ? "block" : "none", height: "100%" }}>
          <CanvasView session={session} onNavigate={setScreen} />
        </div>
        {/* Luôn mounted, chỉ ẩn/hiện bằng CSS (khác các tab khác ở trên — gỡ hẳn `<ChatPage/>`
            đúng lúc đổi tab thì mất luôn `messages` (state cục bộ trong chính component đó,
            `apps/web` không có store dùng chung) — quay lại tab Chat coi như bắt đầu lại từ đầu,
            mất hết lịch sử hội thoại đang xem dở). */}
        <div style={{ display: screen === "chat" ? "flex" : "none", flexDirection: "column", height: "100%" }}>
          <ChatPage />
        </div>
        {/* "Phòng ban" không còn là một khối riêng ở đầu tab: nó là một dòng chip trong cột trái
            của `EmployeesTab`, kèm câu nói ai tạo/sửa phòng ban được (web#30 mục 3.1). Một thẻ
            chiếm nguyên chiều ngang chỉ để hiện vài chip là chỗ trống đắt nhất của trang cũ. */}
        {screen === "employees" && <EmployeesTab session={session} />}
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

  // Chặn TRƯỚC khi phân tầng: cờ này áp cho cả ba vai. Đặt sau `resolveRole` thì mỗi nhánh phải tự
  // nhớ kiểm, và nhánh nào quên là nhánh đó bỏ lọt (app#76, quyết định D1).
  if (session.mustChangePassword) {
    return <ForcedPasswordChange session={session} onDone={logout} />;
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

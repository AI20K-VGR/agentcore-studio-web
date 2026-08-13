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

import Inspector from "./canvas/Inspector";
import Palette, { DND_MIME } from "./canvas/Palette";
import RecipeNode from "./canvas/RecipeNode";
import {
  AVAILABLE_TOOLS,
  defaultParams,
  NODE_TYPES,
  type NodeType,
  type WireRecipe,
} from "./recipe/contract";
import {
  buildRecipe,
  toCanvas,
  type CanvasEdgeData,
  type CanvasNodeData,
  type RecipeHeader,
} from "./recipe/fromCanvas";
import { advisories, graphLint } from "./recipe/graphLint";
import { DEFAULT_HEADER, sampleGraph } from "./recipe/sample";
import { toMermaid } from "./recipe/toMermaid";
import TraceViewer from "./playground/TraceViewer";
import DemoLogin from "./auth/DemoLogin";
import { SessionProvider, useSession, type Session } from "./auth/session";
import ChatPage from "./chat/ChatPage";
import { fetchTrace, publishAgent, runRecipe, type PublishResult, type StudioRunResponse } from "./studio/api";
import { StudioApiError } from "./auth/api";

// Định nghĩa ngoài component: React Flow so sánh `nodeTypes` theo tham chiếu và cảnh báo
// (kèm remount toàn bộ node) nếu object mới được tạo lại mỗi lần render.
const NODE_TYPES_MAP = { recipeNode: RecipeNode };

const DEFAULT_EDGE_OPTIONS = {
  markerEnd: { type: MarkerType.ArrowClosed },
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "5px 7px",
  fontSize: 12,
  borderRadius: 4,
  border: "1px solid #d4d4d8",
  boxSizing: "border-box",
};

const sectionStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#3f3f46",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  margin: "14px 0 6px",
  paddingBottom: 3,
  borderBottom: "1px solid #e4e4e7",
};

function Studio({ session }: { session: Session }) {
  const tenantId = session.tenantId;
  const roles = session.roles;
  const initial = useMemo(sampleGraph, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdgeData>(initial.edges);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [view, setView] = useState<"canvas" | "mermaid">("canvas");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  // D15 (issue kit#102) — Playground: bấm Test → interpreter chạy → trace viewer hiện.
  const [testState, setTestState] = useState<"idle" | "running" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [trace, setTrace] = useState<StudioRunResponse | null>(null);

  // Publish (Kế hoạch 2, A4 backend + phần UI còn thiếu tới giờ) — tách state riêng khỏi
  // testState: Test và Publish là 2 hành động độc lập, có thể chạy lệch pha nhau.
  const [publishState, setPublishState] = useState<"idle" | "running" | "error">("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  // Chia sidebar cấu hình thành tab (Kế hoạch B) — thay vì 1 cột dài cuộn hết section 1-6.
  const [configTab, setConfigTab] = useState<"agent" | "kb" | "eval" | "tools">("agent");

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

  const { screenToFlowPosition } = useReactFlow();
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
  const mermaid = useMemo(() => toMermaid(recipe), [recipe]);
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

  const doImport = useCallback(() => {
    try {
      const parsed = JSON.parse(importText) as WireRecipe;
      if (!parsed?.dag?.nodes || !parsed?.dag?.edges) {
        throw new Error("JSON thiếu `dag.nodes` / `dag.edges`.");
      }
      const canvas = toCanvas(parsed);
      setNodes(canvas.nodes);
      setEdges(canvas.edges);
      // Header cũng nạp theo nếu có — import nửa vời (DAG mới + header cũ) sẽ sinh ra 1 recipe
      // không phải bản nào cả.
      if (parsed.agent_id) setAgentId(parsed.agent_id);
      // `parsed.tenant_id` CỐ Ý bị bỏ qua — tenant luôn đến từ session đăng nhập, không phải từ
      // JSON import (dù JSON đó khai tenant khác, canvas vẫn giữ nguyên tenant của session hiện
      // tại; đúng nguyên tắc "session luôn thắng dữ liệu client tự khai" đã áp dụng xuyên suốt).
      if (parsed.agent_config) {
        setInstructions(parsed.agent_config.instructions ?? "");
        setModel(parsed.agent_config.model ?? "");
        setToolWhitelist(parsed.agent_config.tool_whitelist ?? []);
      }
      if (parsed.kb_binding) {
        setKbId(parsed.kb_binding.kb_id ?? "");
        // `parsed.kb_binding.scope` CỐ Ý bị bỏ qua — cùng lý do `tenant_id` ở trên: scope tự suy
        // từ session, không đọc lại từ JSON import.
      }
      if (parsed.golden_set_ref) setGoldenSetRef(parsed.golden_set_ref);
      if (parsed.scorecard_threshold) {
        setSuccessThreshold(parsed.scorecard_threshold.success);
        setCitationThreshold(parsed.scorecard_threshold.citation_accuracy);
      }
      setImportError(null);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  }, [importText, setEdges, setNodes]);

  const selectedNode = displayNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "300px 1fr 340px",
        height: "100vh",
        width: "100vw",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#18181b",
      }}
    >
      {/* ---------------- CỘT TRÁI: header của recipe, chia tab (Kế hoạch B) ---------------- */}
      <aside
        style={{
          borderRight: "1px solid #e4e4e7",
          padding: 14,
          overflowY: "auto",
          background: "#fafafa",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h2 style={{ fontSize: 15, margin: 0 }}>Workbench · Recipe</h2>
        <div style={{ fontSize: 11, color: "#71717a", marginTop: 2, marginBottom: 8 }}>
          D12 · canvas 6-node + graph-lint
        </div>

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e4e4e7", marginBottom: 10 }}>
          {(
            [
              ["agent", "Agent"],
              ["kb", "KB Binding"],
              ["eval", "Eval Gate"],
              ["tools", "Canvas Tools"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setConfigTab(key)}
              style={{
                flex: 1,
                padding: "6px 4px",
                fontSize: 10.5,
                fontWeight: configTab === key ? 700 : 400,
                border: "none",
                borderBottom: configTab === key ? "2px solid #1d4ed8" : "2px solid transparent",
                background: "transparent",
                color: configTab === key ? "#1d4ed8" : "#52525b",
                cursor: "pointer",
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

            <div style={sectionStyle}>Import recipe JSON</div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={3}
              placeholder='Dán recipe JSON để nạp vào canvas (thử 1 recipe có chu trình để xem lint chặn).'
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: 11 }}
            />
            <button
              type="button"
              onClick={doImport}
              style={{ ...inputStyle, marginTop: 4, cursor: "pointer" }}
            >
              Nạp vào canvas
            </button>
            {importError && (
              <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{importError}</div>
            )}
          </>
        )}
      </aside>

      {/* ---------------- CỘT GIỮA: canvas / mermaid ---------------- */}
      <main style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 12px",
            borderBottom: "1px solid #e4e4e7",
            alignItems: "center",
          }}
        >
          {(["canvas", "mermaid"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setView(tab)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 5,
                cursor: "pointer",
                border: "1px solid " + (view === tab ? "#1d4ed8" : "#d4d4d8"),
                background: view === tab ? "#1d4ed8" : "#fff",
                color: view === tab ? "#fff" : "#3f3f46",
              }}
            >
              {tab === "canvas" ? "Canvas (React Flow)" : "Mermaid (nấc 2)"}
            </button>
          ))}
          <div style={{ flexGrow: 1 }} />
          <button
            type="button"
            onClick={() => {
              const graph = sampleGraph();
              setNodes(graph.nodes);
              setEdges(graph.edges);
              idCounter.current = graph.nodes.length;
            }}
            style={{ ...inputStyle, width: "auto", cursor: "pointer" }}
          >
            Nạp DAG mẫu
          </button>
          <button
            type="button"
            onClick={() => {
              setNodes([]);
              setEdges([]);
            }}
            style={{ ...inputStyle, width: "auto", cursor: "pointer" }}
          >
            Xoá hết
          </button>
        </div>

        <div style={{ flexGrow: 1, minHeight: 0 }}>
          {view === "canvas" ? (
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
                }}
                onEdgeClick={(_, edge) => {
                  setSelectedEdgeId(edge.id);
                  setSelectedNodeId(null);
                }}
                onPaneClick={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
                fitView
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </div>
          ) : (
            <div style={{ height: "100%", overflow: "auto", padding: 12 }}>
              <div style={{ fontSize: 11, color: "#71717a", marginBottom: 6 }}>
                Nấc 2 (DESCOPE.md) — cùng một <code>recipe.dag</code> với canvas, chỉ khác cách
                nhìn. Dán chuỗi dưới vào chỗ nào render Mermaid (GitHub, docs) là ra hình.
              </div>
              <pre
                style={{
                  background: "#18181b",
                  color: "#a5f3fc",
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                }}
              >
                {mermaid}
              </pre>
            </div>
          )}
        </div>
      </main>

      {/* ---------------- CỘT PHẢI: lint + inspector + export ---------------- */}
      <aside
        style={{
          borderLeft: "1px solid #e4e4e7",
          padding: 14,
          overflowY: "auto",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            padding: 10,
            borderRadius: 6,
            border: "1px solid " + (violation ? "#fca5a5" : "#86efac"),
            background: violation ? "#fef2f2" : "#f0fdf4",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 12, color: violation ? "#b91c1c" : "#15803d" }}>
            {violation ? "✗ graph-lint: TỪ CHỐI" : "✓ graph-lint: 7/7 luật sạch"}
          </div>
          {violation ? (
            <div style={{ fontSize: 12, marginTop: 5 }}>
              <code style={{ fontSize: 11, color: "#b91c1c" }}>[{violation.rule}]</code>{" "}
              {violation.message}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#3f6212", marginTop: 5 }}>
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
              border: "1px solid #fde68a",
              background: "#fffbeb",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, color: "#a16207" }}>Cảnh báo (ngoài 7 luật)</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div style={{ marginTop: 4, color: "#a16207" }}>
              Những mục này graph_lint KHÔNG chặn — không khoá export.
            </div>
          </div>
        )}

        <div style={sectionStyle}>Inspector</div>
        <Inspector
          node={selectedNode}
          edge={selectedEdge}
          toolWhitelist={toolWhitelist}
          onParamChange={onParamChange}
          onWhenChange={onWhenChange}
          onDeleteNode={deleteNode}
          onDeleteEdge={deleteEdge}
        />

        <div style={sectionStyle}>Export</div>
        <button
          type="button"
          disabled={violation !== null}
          onClick={() => setExported(recipeJson)}
          title={violation ? "graph-lint đang từ chối recipe này" : undefined}
          style={{
            ...inputStyle,
            cursor: violation ? "not-allowed" : "pointer",
            fontWeight: 700,
            color: "#fff",
            background: violation ? "#a1a1aa" : "#1d4ed8",
            border: "none",
            padding: 9,
          }}
        >
          {violation ? "Bị chặn — recipe chưa qua lint" : "Xuất Recipe JSON"}
        </button>

        <div style={{ ...sectionStyle, marginTop: 12 }}>Playground (D15)</div>
        <button
          type="button"
          disabled={violation !== null || testState === "running"}
          onClick={handleTest}
          title={violation ? "graph-lint đang từ chối recipe này — cùng luật fail-closed với Export" : undefined}
          style={{
            ...inputStyle,
            cursor: violation || testState === "running" ? "not-allowed" : "pointer",
            fontWeight: 700,
            color: "#fff",
            background: violation ? "#a1a1aa" : testState === "running" ? "#78716c" : "#15803d",
            border: "none",
            padding: 9,
          }}
        >
          {violation
            ? "Bị chặn — recipe chưa qua lint"
            : testState === "running"
              ? "Đang chạy…"
              : "▶ Test"}
        </button>
        {testError && (
          <div
            style={{
              marginTop: 6,
              padding: 8,
              borderRadius: 6,
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: 11,
            }}
          >
            {testError}
          </div>
        )}
        {trace && (
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
        )}

        <div style={{ ...sectionStyle, marginTop: 12 }}>Publish</div>
        <button
          type="button"
          disabled={violation !== null || publishState === "running"}
          onClick={handlePublish}
          title={
            violation
              ? "graph-lint đang từ chối recipe này — cùng luật fail-closed với Test/Export"
              : "Chạy nguyên golden_set_ref qua EvalHarness thật rồi gate qua publish() thật"
          }
          style={{
            ...inputStyle,
            cursor: violation || publishState === "running" ? "not-allowed" : "pointer",
            fontWeight: 700,
            color: "#fff",
            background: violation ? "#a1a1aa" : publishState === "running" ? "#78716c" : "#1d4ed8",
            border: "none",
            padding: 9,
          }}
        >
          {violation
            ? "Bị chặn — recipe chưa qua lint"
            : publishState === "running"
              ? "Đang chấm điểm + publish…"
              : "🚀 Publish"}
        </button>
        {publishError && (
          <div
            style={{
              marginTop: 6,
              padding: 8,
              borderRadius: 6,
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#b91c1c",
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
              border: `1px solid ${publishResult.status === "published" ? "#86efac" : "#fde68a"}`,
              background: publishResult.status === "published" ? "#f0fdf4" : "#fffbeb",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {publishResult.status === "published" ? "✅ Đã publish thành công" : "⏸ Bị chặn — chưa publish"}
            </div>
            {publishResult.status === "blocked" && (
              <div style={{ marginBottom: 4, color: "#92400e" }}>{publishResult.message}</div>
            )}
            {publishResult.scorecard && (
              <div style={{ fontFamily: "monospace" }}>
                verdict={publishResult.scorecard.gate.verdict} · success_rate=
                {publishResult.scorecard.aggregate.success_rate.toFixed(2)} · citation_accuracy=
                {publishResult.scorecard.aggregate.citation_accuracy?.toFixed(2) ?? "n/a (chưa đo)"}
              </div>
            )}
          </div>
        )}

        <div style={{ ...sectionStyle, marginTop: 12 }}>
          Recipe {violation ? "(CHƯA QUA LINT)" : "(đã qua lint)"}
        </div>
        <pre
          style={{
            background: "#18181b",
            color: violation ? "#fca5a5" : "#4ade80",
            padding: 10,
            borderRadius: 6,
            fontSize: 10.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {recipeJson}
        </pre>

        {exported && (
          <>
            <div style={sectionStyle}>Bản đã xuất</div>
            <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>
              Dán vào <code>packages/workbench/tests/fixtures/canvas_export_d12.json</code> để test
              Python khoá đúng output thật của canvas này.
            </div>
            <textarea
              readOnly
              value={exported}
              rows={8}
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: 10.5 }}
            />
          </>
        )}
      </aside>
    </div>
  );
}

function CanvasView({ session }: { session: Session }) {
  // `useReactFlow()` (dùng trong `Studio` cho `screenToFlowPosition`) đòi provider ở trên nó.
  return (
    <ReactFlowProvider>
      <Studio session={session} />
    </ReactFlowProvider>
  );
}

/**
 * AppShell (Kế hoạch 1, B3) — cổng đăng nhập + chuyển màn hình "canvas"/"chat", không dùng thư
 * viện router nào (`apps/web` hiện không có `react-router` trong deps) — state đơn giản, cùng
 * kiểu 2 nút "canvas/mermaid" đã có sẵn trong `Studio`.
 *
 * Chưa đăng nhập (`session === null`) → CHỈ render `<DemoLogin/>`, không render `Studio`/`ChatPage`
 * — đây là lý do `tenantId`/`roles` truyền xuống `CanvasView` luôn là string thật, không cần
 * optional-chaining rải khắp `Studio`.
 */
/** `"admin"` là 1 role như mọi role khác trong `session.roles` (không phải cờ riêng) — admin của
 * tenant X là user có role `"admin"` TRONG PHẠM VI đăng nhập của tenant X (đúng ranh giới "admin
 * công ty A không có quyền ở công ty B" — tenant fence vẫn áp dụng y hệt, chỉ thêm 1 lớp role
 * BÊN TRONG tenant đó). Đây vẫn ở mức demo-login (không có tài khoản thật) — SWE OJT tự gõ role
 * "admin" lúc đăng nhập là được, chưa có ai xác thực "bạn có thật là admin không" (việc đó nằm
 * trong phần (C) — tạo tài khoản thật — đã đồng ý làm SAU). */
function isAdmin(session: Session): boolean {
  return session.roles.includes("admin");
}

function AppShell() {
  const { session, logout } = useSession();
  const [screen, setScreen] = useState<"canvas" | "chat">("canvas");

  if (session === null) {
    return <DemoLogin />;
  }

  // User thường: KHÔNG có thanh điều hướng/tab nào cả — chỉ 1 khung chat toàn màn hình, không
  // có gợi ý nào là "đang ở 1 tab trong nhiều tab" (nút đăng xuất nằm gọn trong ChatPage).
  if (!isAdmin(session)) {
    return <ChatPage onLogout={logout} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "6px 14px",
          borderBottom: "1px solid #e4e4e7",
          fontSize: 12,
        }}
      >
        <button type="button" onClick={() => setScreen("canvas")} disabled={screen === "canvas"}>
          Canvas
        </button>
        <button type="button" onClick={() => setScreen("chat")} disabled={screen === "chat"}>
          Chat
        </button>
        <span style={{ marginLeft: "auto", color: "#71717a" }}>
          {session.user} · admin · tenant {session.tenantId.slice(0, 8)}…
        </span>
        <button type="button" onClick={logout}>
          Đăng xuất
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {screen === "canvas" ? <CanvasView session={session} /> : <ChatPage />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}

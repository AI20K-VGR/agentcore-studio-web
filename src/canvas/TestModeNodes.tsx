/**
 * 2 node giả của Test Mode (web#35) — `user_query`/`response`. KHÔNG phải `NodeType` thật: không
 * bao giờ nằm trong `nodes` (state canvas thật) hay `recipe.dag.nodes` — chỉ được nối thêm vào
 * mảng `nodes` truyền cho `<ReactFlow>` lúc `testMode` bật (xem `App.tsx`), nên `graph_lint`/
 * `buildRecipe()` không bao giờ thấy chúng. Viền NÉT ĐỨT (khác hẳn viền đặc của `RecipeNode`) để
 * không ai nhầm đây là 1 node thật của recipe.
 *
 * Cổng của 2 node này thuần trang trí (nối cạnh giả `__test_edge_query__`/`__test_edge_response__`
 * cho có hình) — xem trace bấm vào CHÍNH CẠNH đó (`App.tsx::onEdgeClick`), không phải bấm cổng.
 */
import { Handle, Position, type NodeProps } from "reactflow";
import { CheckCircleIcon, SendIcon, UserIcon, WarningTriangleIcon, XCircleIcon } from "../icons";

const portStyle = {
  background: "var(--ink-soft)",
  width: 12,
  height: 12,
  border: "2px solid var(--surface)",
  boxShadow: "0 0 0 1px var(--line-strong)",
};

const boxStyle: React.CSSProperties = {
  minWidth: 260,
  borderRadius: 12,
  border: "2.5px dashed var(--line-strong)",
  background: "var(--surface)",
  boxShadow: "var(--shadow-md)",
  fontSize: 13.5,
  fontFamily: "var(--font-body)",
};

const headerStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "9px 9px 0 0",
  fontWeight: 700,
  fontSize: 12.5,
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "var(--ink-soft)",
  background: "var(--surface-2)",
};

export interface TestQueryNodeData {
  kind: "test-query";
  query: string;
  onQueryChange: (value: string) => void;
  onRun: () => void;
  running: boolean;
}

export function TestQueryNode({ data }: NodeProps<TestQueryNodeData>) {
  return (
    <div style={boxStyle}>
      <div style={headerStyle}>
        <UserIcon size={14} />
        <span>Câu hỏi người dùng</span>
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <textarea
          value={data.query}
          onChange={(e) => data.onQueryChange(e.target.value)}
          disabled={data.running}
          rows={3}
          placeholder="Gõ câu hỏi để chạy thử…"
          style={{
            width: "100%",
            resize: "vertical",
            padding: "7px 9px",
            fontSize: 13,
            borderRadius: 6,
            border: "1px solid var(--line-strong)",
            background: data.running ? "var(--surface-2)" : "var(--surface)",
            color: "var(--ink)",
            fontFamily: "var(--font-body)",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={data.onRun}
          disabled={data.running || data.query.trim().length === 0}
          style={{
            marginTop: 8,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "7px 0",
            fontSize: 12.5,
            fontWeight: 700,
            borderRadius: 6,
            border: "none",
            cursor: data.running || data.query.trim().length === 0 ? "not-allowed" : "pointer",
            background: data.running ? "var(--ink-faint)" : "var(--good)",
            color: "#fff",
          }}
        >
          <SendIcon size={13} /> {data.running ? "Đang chạy…" : "Chạy"}
        </button>
      </div>
      <Handle type="source" position={Position.Right} id="test-query-out" style={portStyle} />
    </div>
  );
}

export interface TestResponseNodeData {
  kind: "test-response";
  status: "idle" | "waiting" | "answered" | "error";
  answer: string | null;
  citations: string[];
  errorMessage: string | null;
}

export function TestResponseNode({ data }: NodeProps<TestResponseNodeData>) {
  return (
    <div style={boxStyle}>
      <div style={headerStyle}>
        {data.status === "answered" ? (
          <CheckCircleIcon size={14} />
        ) : data.status === "error" ? (
          <WarningTriangleIcon size={14} />
        ) : (
          <XCircleIcon size={14} style={{ opacity: 0.4 }} />
        )}
        <span>Phản hồi</span>
      </div>
      <div style={{ padding: "10px 12px 12px", color: "var(--ink)" }}>
        {data.status === "idle" && (
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Chưa có lượt chạy nào.</div>
        )}
        {data.status === "waiting" && (
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Đang đợi luồng chạy tới đây…</div>
        )}
        {data.status === "error" && (
          <div style={{ fontSize: 12.5, color: "var(--bad)" }}>{data.errorMessage}</div>
        )}
        {data.status === "answered" && (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.5, wordBreak: "break-word" }}>{data.answer}</div>
            {data.citations.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
                {data.citations.map((id) => (
                  <span
                    key={id}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: "var(--kb-soft, var(--surface-2))",
                      color: "var(--ink-soft)",
                    }}
                  >
                    {id}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <Handle type="target" position={Position.Left} id="test-response-in" style={portStyle} />
    </div>
  );
}

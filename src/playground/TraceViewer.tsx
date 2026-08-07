/**
 * Trace viewer (D15, issue kit#102) — hiện ra sau khi bấm Test, đọc lại qua
 * `fetchTrace()` (request TÁCH RIÊNG khỏi `runRecipe()`, xem `api.ts`).
 *
 * Banner "khớp" ở đầu là bằng chứng trực quan cho DoD Day 15 (`run_id`/
 * `agent_id` khớp giữa recipe và trace): so `expectedRunId`/`expectedAgentId`
 * (đọc từ state form/kết quả Test ngay trên canvas) với giá trị THỰC TẾ nằm
 * trên từng `TraceEvent` đọc lại — không phải so 2 biến cùng nguồn (vô nghĩa),
 * mà so state-trước-khi-gọi với state-đọc-lại-từ-server.
 */

import type { NodeType } from "../recipe/contract";
import { nodeSpec } from "../recipe/contract";
import type { WireScore, WireTraceEvent } from "./api";

const badgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "1px 7px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  color: "#fff",
  background: color,
});

function nodeColor(nodeType: string): string {
  try {
    return nodeSpec(nodeType as NodeType).color;
  } catch {
    return "#71717a";
  }
}

function fmtTs(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toISOString().split("T")[1]?.replace("Z", "") ?? ts;
}

export interface TraceViewerProps {
  expectedRunId: string;
  expectedAgentId: string;
  tenantId: string;
  events: WireTraceEvent[];
  /** `render_timeline()` THẬT của DE (`studio_kb.trace_reader`) — tính trên đúng events này ở
   * phía server, không phải bản viết lại. `null`/`undefined` = server cũ chưa có field này. */
  timelineText?: string | null;
  /** `score_run_from_trace()` THẬT của AIE-2 (`studio_evalhub.run_report`) — `available: false`
   * khi PR#15 chưa merge phía server, không phải điểm giả/bịa. */
  score?: WireScore | null;
}

export default function TraceViewer({
  expectedRunId,
  expectedAgentId,
  tenantId,
  events,
  timelineText,
  score,
}: TraceViewerProps) {
  const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
  const runIdsMatch = sorted.every((e) => e.run_id === expectedRunId);
  const agentIdsMatch = sorted.every((e) => e.agent_id === expectedAgentId);
  const monotonic = sorted.every((e, i) => i === 0 || e.ts > sorted[i - 1].ts);
  const ok = runIdsMatch && agentIdsMatch && monotonic && sorted.length > 0;

  const totalTokens = sorted.reduce((sum, e) => sum + e.tokens.prompt + e.tokens.completion, 0);
  const totalCost = sorted.reduce((sum, e) => sum + e.cost, 0);

  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          padding: 8,
          borderRadius: 6,
          border: "1px solid " + (ok ? "#86efac" : "#fca5a5"),
          background: ok ? "#f0fdf4" : "#fef2f2",
          fontSize: 11,
        }}
      >
        <div style={{ fontWeight: 700, color: ok ? "#15803d" : "#b91c1c" }}>
          {ok ? "✓ run_id/agent_id khớp giữa recipe và trace" : "✗ run_id/agent_id KHÔNG khớp — kiểm tra wiring"}
        </div>
        <div style={{ marginTop: 3, color: "#3f3f46", fontFamily: "monospace", wordBreak: "break-all" }}>
          run_id={expectedRunId} · agent_id={expectedAgentId} · tenant={tenantId}
        </div>
        <div style={{ marginTop: 3, color: "#3f3f46" }}>
          {sorted.length} event · ordering {monotonic ? "monotonic ✓" : "KHÔNG monotonic ✗"} · Σtokens=
          {totalTokens} · Σcost={totalCost.toFixed(4)}
        </div>
      </div>

      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((event) => (
          <div
            key={event.event_id}
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: 6,
              padding: 8,
              fontSize: 11,
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={badgeStyle(nodeColor(event.node_type))}>{event.node_type}</span>
              <code style={{ fontSize: 10 }}>{event.node_id}</code>
              <span style={{ color: "#a1a1aa", fontSize: 10 }}>{fmtTs(event.ts)}</span>
              <span style={{ marginLeft: "auto", color: "#71717a", fontSize: 10 }}>
                tokens {event.tokens.prompt}+{event.tokens.completion} · cost {event.cost.toFixed(4)}
              </span>
            </div>
            {event.citations && event.citations.length > 0 && (
              <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {event.citations.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "#ecfeff",
                      border: "1px solid #a5f3fc",
                      color: "#0e7490",
                    }}
                  >
                    📎 {c}
                  </span>
                ))}
              </div>
            )}
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer", color: "#71717a", fontSize: 10 }}>outputs</summary>
              <pre
                style={{
                  margin: "4px 0 0",
                  padding: 6,
                  background: "#fafafa",
                  borderRadius: 4,
                  fontSize: 10,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: 160,
                  overflowY: "auto",
                }}
              >
                {JSON.stringify(event.outputs, null, 2)}
              </pre>
            </details>
          </div>
        ))}
      </div>

      {timelineText && (
        <details style={{ marginTop: 10 }} open>
          <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#3f3f46" }}>
            render_timeline() — output thật của DE (studio_kb.trace_reader)
          </summary>
          <pre
            style={{
              margin: "4px 0 0",
              padding: 8,
              background: "#18181b",
              color: "#a5f3fc",
              borderRadius: 6,
              fontSize: 10.5,
              whiteSpace: "pre-wrap",
              overflowX: "auto",
            }}
          >
            {timelineText}
          </pre>
        </details>
      )}

      {score && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 6,
            fontSize: 11,
            border: "1px solid " + (score.available ? "#a5f3fc" : "#e4e4e7"),
            background: score.available ? "#ecfeff" : "#fafafa",
          }}
        >
          <div style={{ fontWeight: 700, color: "#3f3f46" }}>score_run_from_trace() — AIE-2 (studio_evalhub.run_report)</div>
          {!score.available && <div style={{ marginTop: 3, color: "#71717a" }}>{score.message}</div>}
          {score.available && !score.scored && <div style={{ marginTop: 3, color: "#a16207" }}>{score.message}</div>}
          {score.available && score.scored && (
            <div style={{ marginTop: 3, color: "#0e7490", fontFamily: "monospace" }}>
              case={score.case_id} · success={String(score.success)} · citation_accuracy=
              {score.citation_accuracy?.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

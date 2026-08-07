/**
 * Trace viewer (D15, issue kit#102) — hiện ra sau khi bấm Test, đọc lại qua
 * `fetchTrace()` (request TÁCH RIÊNG khỏi `runRecipe()`, xem `api.ts`).
 *
 * Banner đầu là bằng chứng trực quan cho DoD Day 15 (`run_id`/`agent_id`
 * khớp giữa recipe và trace) — nhưng CHỈ `agentIdsMatch` là phép kiểm thật
 * (so `agentId` từ recipe editor, phía client, với `agent_id` trên từng
 * event, phía server — 2 nguồn độc lập). `run_id` KHÔNG so theo kiểu đó:
 * server (`dev_playground_server.py::read_run`) đã LỌC event theo đúng
 * `run_id` trước khi trả về, nên "mọi event có run_id đúng" là hằng số true
 * do cách chọn dữ liệu quyết định, không phải điều đang được kiểm chứng
 * (review AIE-2, `web#3` C2 — cùng lớp lỗi với F1 của DE ở `kb#16`: đo một
 * tính chất trên dữ liệu đã bị lọc/sắp theo đúng tính chất đó). Phép thử
 * wiring thật ở đây là "GET bằng đúng run_id trả về ít nhất 1 event" —
 * `wiringOk` bên dưới.
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

/** `cost` (mọi node) là hằng số `_NO_COST = 0.0` viết chết trong
 * `interpreter.py` — chưa có nguồn cost thật (cost-lineage là D19, kit#120).
 * In "0.0000" đọc thành "đã đo, và bằng 0"; đúng luật `DEC-D12-02` đã áp cho
 * `render_scorecard`, ô chưa đo phải in "chưa đo" (review AIE-2 W2). */
function fmtCost(cost: number): string {
  return cost === 0 ? "chưa đo" : cost.toFixed(4);
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
  // `monotonic` đo trên `events` — thứ tự NGUYÊN BẢN server trả về (chính là thứ tự
  // `InMemoryTraceWriter.write()` nhận, tức thứ tự dispatch thật của interpreter, KHÔNG qua
  // `ORDER BY`/`.sort()` nào ở tầng server) — KHÔNG đo trên `sorted` (mảng dùng riêng cho hiển
  // thị bên dưới). Đo trên mảng đã tự sort thì kết quả gần như luôn true — đúng lỗi review
  // AIE-2 C2 chỉ ra (cùng lớp với F1 của DE ở `kb#16`: đo 1 tính chất trên dữ liệu đã bị biến
  // đổi theo đúng tính chất đang kiểm).
  const monotonic = events.every((e, i) => i === 0 || e.ts > events[i - 1].ts);
  // `agentIdsMatch` là phép kiểm THẬT DUY NHẤT ở đây — `agentId` (client, form canvas) và
  // `agent_id` trên event (server) là 2 nguồn độc lập, không bên nào suy ra được bên kia.
  const agentIdsMatch = events.every((e) => e.agent_id === expectedAgentId);
  // "run_id khớp" KHÔNG kiểm ở đây nữa (review C2) — server đã lọc theo đúng `run_id` trước
  // khi trả `events`, nên every event có run_id đúng là hằng số true do cách chọn dữ liệu,
  // không phải điều đang được chứng minh. Phép thử wiring thật: GET có trả về gì không.
  const wiringOk = events.length > 0;
  const ok = wiringOk && agentIdsMatch && monotonic;

  const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
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
          {ok
            ? "✓ GET theo run_id trả " + events.length + " event đúng tenant · agent_id khớp recipe"
            : "✗ wiring lỗi — GET rỗng, agent_id lệch, hoặc ordering không monotonic"}
        </div>
        <div style={{ marginTop: 3, color: "#3f3f46", fontFamily: "monospace", wordBreak: "break-all" }}>
          run_id={expectedRunId} · agent_id={expectedAgentId} · tenant={tenantId}
        </div>
        <div style={{ marginTop: 3, color: "#3f3f46" }}>
          {sorted.length} event · ordering {monotonic ? "monotonic ✓" : "KHÔNG monotonic ✗"} · Σtokens=
          {totalTokens} · Σcost={fmtCost(totalCost)}
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
                tokens {event.tokens.prompt}+{event.tokens.completion} · cost {fmtCost(event.cost)}
              </span>
            </div>
            {/* `citations === null` ("không áp dụng" — mọi node trừ llm-step, clause C-1) và
                `citations === []` ("đã trích, rỗng" — llm-step không grounded được gì) là 2
                sự thật khác nhau, trước đây render giống hệt nhau (cả 2 đều không hiện gì)
                (review AIE-2 W5). null: không hiện dòng nào (đúng — không có gì để nói). []:
                hiện rõ "0 citation", phân biệt với có citation thật. */}
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
            {event.citations !== null && event.citations.length === 0 && (
              <div style={{ marginTop: 4, fontSize: 10, color: "#a16207" }}>
                0 citation — đã trích (llm-step), không grounded được gì (khác "không áp dụng")
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
              {/* C1 (review AIE-2, workbench#19 + web#3): case từ-chối có citation_accuracy=1.0
                  do QUY ƯỚC vacuous-truth (evalhub DEC-04), KHÔNG phải phép đo — CLI
                  render_run_cases in "n/a" cho đúng dòng đó. In thẳng số ở đây từng khiến UI
                  hiện "1.00" (số đẹp nhất bảng) lên đúng ô chưa đo gì, khác CLI. */}
              {score.expects_refusal ? "n/a (nhánh từ-chối)" : score.citation_accuracy?.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

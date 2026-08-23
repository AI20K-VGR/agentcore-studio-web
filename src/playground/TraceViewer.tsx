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
import { CheckCircleIcon, PaperclipIcon, XCircleIcon } from "../icons";

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
    return "var(--ink-faint)";
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
          border: "1px solid " + (ok ? "var(--good)" : "var(--bad)"),
          background: ok ? "var(--good-soft)" : "var(--bad-soft)",
          fontSize: 11,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, fontWeight: 700, color: ok ? "var(--good)" : "var(--bad)" }}>
          {ok ? <CheckCircleIcon size={13} style={{ flexShrink: 0, marginTop: 1 }} /> : <XCircleIcon size={13} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>
            {ok
              ? "GET theo run_id trả " + events.length + " event đúng tenant · agent_id khớp recipe"
              : "wiring lỗi — GET rỗng, agent_id lệch, hoặc ordering không monotonic"}
          </span>
        </div>
        <div style={{ marginTop: 3, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", fontSize: 10.5, wordBreak: "break-all" }}>
          run_id={expectedRunId} · agent_id={expectedAgentId} · tenant={tenantId}
        </div>
        <div style={{ marginTop: 3, color: "var(--ink-soft)" }}>
          {sorted.length} event · ordering {monotonic ? "monotonic ✓" : "KHÔNG monotonic ✗"} · Σtokens=
          {totalTokens} · Σcost={fmtCost(totalCost)}
        </div>
      </div>

      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((event) => (
          <div
            key={event.event_id}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: 8,
              fontSize: 11,
              background: "var(--surface)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={badgeStyle(nodeColor(event.node_type))}>{event.node_type}</span>
              <code style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{event.node_id}</code>
              <span style={{ color: "var(--ink-faint)", fontSize: 10 }}>{fmtTs(event.ts)}</span>
              <span style={{ marginLeft: "auto", color: "var(--ink-faint)", fontSize: 10 }}>
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
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "var(--tier-admin-soft)",
                      border: "1px solid var(--tier-admin)",
                      color: "var(--tier-admin)",
                    }}
                  >
                    <PaperclipIcon size={10} /> {c}
                  </span>
                ))}
              </div>
            )}
            {event.citations !== null && event.citations.length === 0 && (
              <div style={{ marginTop: 4, fontSize: 10, color: "var(--warn)" }}>
                0 citation — không có trích dẫn tài liệu (hoặc chế độ Chatbot trực tiếp)
              </div>
            )}

            {/* Hiển thị câu trả lời nổi bật cho LLM Step */}
            {event.node_type === "llm-step" && event.outputs && typeof event.outputs === "object" && "answer" in event.outputs && (
              <div
                style={{
                  marginTop: 6,
                  padding: "8px 10px",
                  background: "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)",
                  borderRadius: 6,
                  border: "1px solid var(--line-strong)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase", marginBottom: 3 }}>
                  💬 Phản hồi từ LLM
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                  {String(event.outputs.answer)}
                </div>
              </div>
            )}

            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer", color: "var(--ink-faint)", fontSize: 10 }}>Chi tiết outputs thô (JSON)</summary>
              <pre
                style={{
                  margin: "4px 0 0",
                  padding: 6,
                  background: "var(--surface-2)",
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink-soft)",
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
          <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--ink-soft)" }}>
            render_timeline() — output thật của DE (studio_kb.trace_reader)
          </summary>
          <pre
            style={{
              margin: "4px 0 0",
              padding: 8,
              background: "var(--ink)",
              color: "var(--tier-admin-soft)",
              fontFamily: "var(--font-mono)",
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
            border: "1px solid " + (score.available ? "var(--tier-admin)" : "var(--line)"),
            background: score.available ? "var(--tier-admin-soft)" : "var(--surface-2)",
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--ink-soft)" }}>score_run_from_trace() — AIE-2 (studio_evalhub.run_report)</div>
          {!score.available && <div style={{ marginTop: 3, color: "var(--ink-faint)" }}>{score.message}</div>}
          {score.available && !score.scored && <div style={{ marginTop: 3, color: "var(--warn)" }}>{score.message}</div>}
          {score.available && score.scored && (
            <div style={{ marginTop: 3, color: "var(--tier-admin)", fontFamily: "var(--font-mono)" }}>
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

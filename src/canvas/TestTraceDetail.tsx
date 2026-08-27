/**
 * Popover xem trace của Test Mode (web#35) — mở bằng bấm 1 CẠNH (`App.tsx::onEdgeClick`), thay
 * hẳn bản `<pre>{JSON.stringify(...)}</pre>` thô ban đầu bằng render theo ĐÚNG hình dạng dữ liệu
 * (chunk KB thành thẻ riêng, câu trả lời + citation thành đoạn văn + pill, tool-call còn lại mới
 * rơi về bảng key/value) — dễ đọc hơn hẳn 1 khối JSON thô. 1 cạnh = 2 section xếp chồng (RA từ
 * node nguồn, VÀO tới node đích) — đúng chiều mũi tên, bấm 1 lần thấy cả 2 phía thay vì phải bấm
 * riêng từng cổng như bản trước.
 *
 * Kéo được bằng thanh tiêu đề (phản hồi: khung mặc định che mất node/panel khác) — vị trí kéo tới
 * chỉ sống trong state cục bộ của chính component này, KHÔNG lưu lại giữa các lần mở khác nhau:
 * mỗi lần bấm 1 cạnh mới là 1 lần mount mới (`key` đổi theo cạnh ở nơi gọi), tự về vị trí mặc
 * định — tránh 1 popover "trốn" ở góc màn hình từ lần trước rồi tưởng là biến mất.
 */
import { useRef, useState } from "react";
import { CloseIcon } from "../icons";
import { nodeSpec, type NodeType } from "../recipe/contract";
import type { WireTraceEvent } from "../playground/api";

/** Một dòng thu gọn cho bước kiểm chứng trích dẫn. Bấm mới mở chi tiết. */
function FaithfulnessRow({ event }: { event: WireTraceEvent }) {
  const [open, setOpen] = useState(false);
  const verdict = typeof event.outputs["verdict"] === "string" ? (event.outputs["verdict"] as string) : "?";
  // `CO` = trích dẫn đúng chủ đề. Mọi verdict khác là ca cần chú ý — engine gỡ sạch citations, và
  // câu trả lời rơi về nhánh từ chối.
  const ok = verdict.toUpperCase().startsWith("CO");
  const checked = (event.outputs["citations_checked"] as string[] | undefined) ?? [];
  return (
    <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", fontSize: 12 }}
      >
        {ok ? "✓" : "⚠"} Kiểm chứng trích dẫn: {ok ? "ĐÚNG chủ đề" : `${verdict} — citations bị gỡ`}
        <span style={{ marginLeft: 6, color: "var(--accent)" }}>{open ? "thu gọn" : "chi tiết"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 5, paddingLeft: 10, borderLeft: "2px solid var(--line)", lineHeight: 1.6 }}>
          <div>
            Bước này hỏi lại model: chunk được trích có đúng chủ đề của câu hỏi không? Nó bắt ca
            trích dẫn <strong>hợp lệ nhưng sai nội dung</strong> — thứ mà phép kiểm xuất xứ không
            thấy.
          </div>
          {checked.length > 0 && (
            <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10.5, wordBreak: "break-word" }}>
              {checked.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type TestTraceDetailContent =
  | { kind: "text"; text: string }
  | { kind: "events"; events: WireTraceEvent[] }
  // web#45 — riêng cho cạnh `llm-step → Phản hồi`: TOÀN BỘ `testEvents` theo đúng thứ tự thời
  // gian (không chỉ event khớp với 1 node), mỗi bước có nhãn loại node — để thấy rõ đã "chạy qua"
  // những gì (tool-call/kb-retrieve xen giữa các lượt LLM), không chỉ câu trả lời cuối. Tách kind
  // riêng thay vì thêm cờ vào `"events"` để không đụng hành vi popover của các cạnh khác.
  | { kind: "timeline"; events: WireTraceEvent[] };

export interface TestTraceDetailSection {
  label: string;
  content: TestTraceDetailContent;
}

export interface TestTraceDetailProps {
  accent: string;
  sections: TestTraceDetailSection[];
  onClose: () => void;
}

function fmtCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function ChunkCard({ chunkId, text }: { chunkId: string; text: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "8px 10px",
        background: "var(--surface-2)",
      }}
    >
      <div
        style={{
          display: "inline-block",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          fontWeight: 700,
          padding: "1px 7px",
          borderRadius: 999,
          background: "var(--kb-soft, rgba(47,102,89,0.16))",
          color: "var(--node-kb-retrieve, #2f6659)",
          marginBottom: 5,
        }}
      >
        {chunkId}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-soft)", wordBreak: "break-word" }}>{text}</div>
    </div>
  );
}

function CitationPill({ id }: { id: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 999,
        background: "var(--surface-2)",
        border: "1px solid var(--line-strong)",
        color: "var(--ink-soft)",
      }}
    >
      {id}
    </span>
  );
}

function EventBody({ event }: { event: WireTraceEvent }) {
  if (event.node_type === "kb-retrieve") {
    const chunks = event.outputs["chunks"];
    const list = Array.isArray(chunks) ? chunks : [];
    if (list.length === 0) {
      return <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Không tra được đoạn nào.</div>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {list.map((chunk, i) => {
          const c = chunk as Record<string, unknown>;
          const id = typeof c.chunk_id === "string" ? c.chunk_id : `#${i}`;
          const text = typeof c.text === "string" ? c.text : JSON.stringify(c);
          return <ChunkCard key={id} chunkId={id} text={text} />;
        })}
      </div>
    );
  }

  if (event.node_type === "llm-step") {
    // `run_agent_loop()` (agent_loop.py) — 1 turn "quyết định gọi tool" KHÔNG có `outputs.answer`,
    // chỉ có `outputs.signal === "tool-call"` + `outputs.tool_call`; chỉ turn TRẢ LỜI CUỐI mới có
    // `answer` thật. Phân biệt 2 dạng thay vì luôn tìm `answer` rồi in "(không có answer)" mơ hồ.
    const signal = event.outputs["signal"];
    if (signal === "tool-call") {
      const toolCall = event.outputs["tool_call"] as Record<string, unknown> | undefined;
      const tool = typeof toolCall?.["tool"] === "string" ? (toolCall["tool"] as string) : "?";
      const params = toolCall?.["params"];
      // `params` là thứ model XIN; `effective_top_k` là thứ THẬT SỰ chạy.
      //
      // Catalog khai `top_k` là tuỳ chọn, nên model có quyền không khai và engine rơi về mặc định —
      // nhưng trace chỉ ghi params gốc, nên giá trị thật vô hình. Đo trên một hệ thật: 141/411 lượt
      // gọi `kb_search` không khai `top_k` (trace chỉ in `{"query": ...}`), 109 lượt khác khai `1`
      // rồi lặp tới 13 lần vì một chunk không đủ trả lời. Nhìn từ trace hai ca đó giống hệt nhau.
      //
      // Engine tính và gửi kèm; ở đây chỉ ĐỌC. Suy lại luật rơi-về-mặc-định (`0 -> 5`, `9999 -> 10`)
      // ở client là dựng nguồn sự thật thứ hai, và nó lệch âm thầm vào ngày luật đổi.
      const effectiveTopK = toolCall?.["effective_top_k"];
      const askedTopK = (params as Record<string, unknown> | undefined)?.["top_k"];
      return (
        <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>→ Gọi tool:</span>{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>{tool}</span>
          {params !== undefined && (
            <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11, wordBreak: "break-word" }}>
              {JSON.stringify(params)}
            </div>
          )}
          {typeof effectiveTopK === "number" && (
            <div style={{ marginTop: 3, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>
              top_k thực chạy: {effectiveTopK}
              {askedTopK === undefined
                ? " (model không khai — mặc định)"
                : askedTopK !== effectiveTopK
                  ? ` (model xin ${String(askedTopK)}, đã ép về khoảng cho phép)`
                  : ""}
            </div>
          )}
        </div>
      );
    }
    if (signal === "faithfulness-verify") {
      // Bước kiểm chứng trích dẫn (engine#43): hỏi lại model xem chunk được trích có ĐÚNG CHỦ ĐỀ
      // của câu hỏi không. `ground_citations()` chỉ chứng minh XUẤT XỨ — chunk được trích đúng là
      // chunk đã truy xuất — chứ không nói gì về việc nó có liên quan hay không.
      //
      // Sự kiện này KHÔNG có `outputs.answer`, và trước bản vá này nó rơi xuống nhánh câu-trả-lời
      // rồi in "(không có answer)" — đọc như một lượt hỏng, trong khi nó chạy đúng.
      //
      // Thu gọn sẵn: lúc verdict là CÓ thì không có gì để xử lý, và một bước máy móc chiếm chỗ sẽ
      // đẩy câu trả lời thật ra khỏi tầm mắt. Nhưng KHÔNG ẩn hẳn — khi verdict là KHÔNG, engine gỡ
      // sạch citations và câu trả lời thành "từ chối"; không thấy bước này thì không gì giải thích
      // vì sao.
      return <FaithfulnessRow event={event} />;
    }
    const answer = typeof event.outputs["answer"] === "string" ? (event.outputs["answer"] as string) : "";
    const refused = event.outputs["refused"] === true;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {refused && <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--bad)" }}>⚠ refused = true</div>}
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink)", wordBreak: "break-word" }}>
          {answer || "(không có answer)"}
        </div>
        {event.citations && event.citations.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {event.citations.map((id) => (
              <CitationPill key={id} id={id} />
            ))}
          </div>
        )}
        <div style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--ink-faint)" }}>
          {event.tokens.prompt}+{event.tokens.completion} tokens · {fmtCost(event.cost)}
        </div>
      </div>
    );
  }

  // tool-call (hoặc loại lạ) — hình dạng output tuỳ tool, rơi về bảng key/value đơn giản.
  const entries = Object.entries(event.outputs);
  if (entries.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>(không có output)</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ fontSize: 11.5, display: "flex", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-faint)", flexShrink: 0 }}>{key}:</span>
          <span style={{ color: "var(--ink-soft)", wordBreak: "break-word" }}>
            {typeof value === "string" ? value : JSON.stringify(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionContent({ content }: { content: TestTraceDetailContent }) {
  if (content.kind === "text") {
    return (
      <div style={{ borderLeft: "3px solid var(--line-strong)", paddingLeft: 10, fontSize: 13, fontStyle: "italic", lineHeight: 1.5, color: "var(--ink-soft)" }}>
        “{content.text}”
      </div>
    );
  }
  if (content.kind === "timeline") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {content.events.map((event, i) => (
          <div key={event.event_id}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                color: "var(--ink-faint)",
                marginBottom: 6,
              }}
            >
              {nodeSpec(event.node_type as NodeType).label} · Bước {i + 1}/{content.events.length}
            </div>
            <EventBody event={event} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {content.events.map((event, i) => (
        <div key={event.event_id}>
          {content.events.length > 1 && (
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                color: "var(--ink-faint)",
                marginBottom: 6,
              }}
            >
              Lượt {i + 1}/{content.events.length}
            </div>
          )}
          <EventBody event={event} />
        </div>
      ))}
    </div>
  );
}

export default function TestTraceDetail({ accent, sections, onClose }: TestTraceDetailProps) {
  // Kéo được bằng thanh tiêu đề — cùng cơ chế `ResizeHandle` (`App.tsx`): 1 drag session bằng
  // `window` listener (mousemove/mouseup), không dùng thư viện drag nào. CHỈ đổi vị trí
  // (translate), không cho resize (kích thước cố định — yêu cầu rõ của user).
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; offsetX: number; offsetY: number } | null>(null);

  return (
    <div
      style={{
        position: "absolute",
        top: 64,
        right: 16,
        width: 340,
        maxHeight: "72%",
        overflowY: "auto",
        borderRadius: 12,
        background: "var(--surface)",
        border: `1.5px solid ${accent}`,
        boxShadow: "var(--shadow-md)",
        zIndex: 20,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
      }}
    >
      <div
        onMouseDown={(startEvent) => {
          startEvent.preventDefault();
          dragStartRef.current = { mouseX: startEvent.clientX, mouseY: startEvent.clientY, offsetX: offset.x, offsetY: offset.y };
          const onMove = (moveEvent: MouseEvent) => {
            const start = dragStartRef.current;
            if (!start) return;
            setOffset({ x: start.offsetX + (moveEvent.clientX - start.mouseX), y: start.offsetY + (moveEvent.clientY - start.mouseY) });
          };
          const onUp = () => {
            dragStartRef.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        style={{
          position: "sticky",
          top: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: accent,
          borderRadius: "10px 10px 0 0",
          cursor: "grab",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", flex: 1 }}>Trace của cạnh</span>
        <button
          type="button"
          onClick={onClose}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "rgba(255,255,255,0.85)" }}
        >
          <CloseIcon size={14} />
        </button>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
        {sections.map((section, i) => (
          <div key={section.label}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{section.label}</div>
            <SectionContent content={section.content} />
            {i < sections.length - 1 && <div style={{ borderTop: "1px dashed var(--line)", marginTop: 14 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

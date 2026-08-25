/**
 * Modal nút Test — khung chat THẬT trên recipe draft (canvas, CHƯA publish). Thay hẳn bản
 * connectivity-check tĩnh cũ (OK/NOT_IMPLEMENTED) — quyết định chốt cùng user: 1 lượt chat thật
 * (trả lời + trace) tự nói lên tool chạy được hay không, rõ hơn hẳn bảng trạng thái tĩnh.
 *
 * Gọi `playground/testChatApi.ts::sendTestChatMessage()` (`POST /api/agents/{id}/test-chat`) —
 * TÁCH BIỆT TUYỆT ĐỐI với `chat/ChatPage.tsx`/`chat/api.ts` (agent ĐÃ publish, tab "Dùng thử").
 * Cấu trúc UI mượn lại đúng khuôn `ChatPage.tsx` (bong bóng chat, nút "Xem trace" mở `TraceViewer`
 * inline) nhưng viết ĐỘC LẬP — chấp nhận trùng lặp code để giữ ranh giới rõ giữa 2 tính năng, đúng
 * yêu cầu tách biệt đã chốt (nút Test dùng cho lúc còn đang thiết kế; tab Dùng thử dùng cho bản
 * sống thật + có `as_roles` giả lập role mà nút Test không có).
 */

import { useEffect, useRef, useState } from "react";
import type { WireRecipe } from "../recipe/contract";
import type { Session } from "../auth/session";
import { sendTestChatMessage, type TestChatResponse } from "./testChatApi";
import { fetchTrace, type StudioRunResponse } from "../studio/api";
import { StudioApiError } from "../httpUtil";
import { BotIcon, CloseIcon, PaperclipIcon, SendIcon, UserIcon } from "../icons";
import TraceViewer from "./TraceViewer";

const COMPOSER_MAX_HEIGHT = 160;

interface Message {
  role: "user" | "agent";
  text: string;
  citations?: string[];
  refused?: boolean;
  runId?: string;
  trace?: StudioRunResponse | null;
  traceError?: string;
  traceOpen?: boolean;
}

/** Cùng hàm `ChatPage.tsx::stripInlineCitations` — bỏ `[chunk_id]` LLM tự chèn, đã hiển thị sẵn
 * dạng pill riêng bên dưới (`citations`). Chép lại độc lập, không import chéo (xem docstring). */
function stripInlineCitations(text: string, citations: string[]): string {
  if (citations.length === 0) return text;
  let result = text;
  for (const id of citations) {
    result = result.split(`[${id}]`).join("");
  }
  return result.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

export interface TestAgentModalProps {
  open: boolean;
  recipe: WireRecipe;
  session: Session;
  onClose: () => void;
}

export default function TestAgentModal({ open, recipe, session, onClose }: TestAgentModalProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  };

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, state]);

  // Reset hẳn lịch sử chat mỗi lần modal MỞ LẠI (đóng rồi mở lại = phiên test mới) — tránh nhầm
  // lẫn giữa câu trả lời của 1 recipe cũ với recipe vừa sửa xong trên canvas.
  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setInput("");
    setState("idle");
    setError(null);
  }, [open]);

  if (!open) return null;

  const handleSend = async () => {
    if (!input.trim() || state === "sending") return;
    const text = input.trim();
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    requestAnimationFrame(resizeTextarea);
    setState("sending");
    setError(null);

    let response: TestChatResponse;
    try {
      response = await sendTestChatMessage(recipe, text, session);
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
      setState("error");
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        text: response.answer,
        citations: response.citations,
        refused: response.refused,
        runId: response.run_id,
      },
    ]);
    setState("idle");

    try {
      const trace = await fetchTrace(response.run_id, session);
      setMessages((prev) => prev.map((m) => (m.runId === response.run_id ? { ...m, trace } : m)));
    } catch (err) {
      const traceError = err instanceof StudioApiError ? err.message : String(err);
      setMessages((prev) => prev.map((m) => (m.runId === response.run_id ? { ...m, trace: null, traceError } : m)));
    }
  };

  const toggleTrace = (runId: string) => {
    setMessages((prev) => prev.map((m) => (m.runId === runId ? { ...m, traceOpen: !m.traceOpen } : m)));
  };

  const canSend = state !== "sending" && input.trim().length > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,14,24,0.62)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 130,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 94vw)",
          height: "min(760px, 90vh)",
          display: "flex",
          flexDirection: "column",
          borderRadius: 14,
          border: "1px solid var(--line-strong)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-lg, 0 20px 40px rgba(0,0,0,0.25))",
          overflow: "hidden",
        }}
      >
        {/* ================= HEADER ================= */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontFamily: "var(--font-display)", color: "var(--ink)" }}>
              Chạy thử (chưa publish): <span style={{ color: "var(--brand, #1f3a5f)" }}>{recipe.agent_id}</span>
            </h2>
            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2 }}>
              Chat thật ngay trên bản nháp trên canvas — chưa ai khác dùng được bản này, chỉ để bạn tự kiểm
              trước khi Chấm điểm/Publish.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink-faint)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* ================= MESSAGE LIST ================= */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px" }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 12.5, padding: "32px 0" }}>
              Đặt 1 câu hỏi bạn tự nghĩ ra để kiểm agent đang thiết kế trả lời thế nào.
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginBottom: 12 }}>
                <div
                  style={{
                    maxWidth: "78%",
                    padding: "9px 13px",
                    borderRadius: "14px 14px 3px 14px",
                    background: "var(--tier-admin)",
                    color: "#fff",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {m.text}
                </div>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--tier-admin-soft)",
                    color: "var(--tier-admin)",
                  }}
                >
                  <UserIcon size={14} />
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: "flex", gap: 9, marginBottom: 12 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: m.refused ? "var(--bad-soft)" : "var(--tier-admin-soft)",
                    color: m.refused ? "var(--bad)" : "var(--tier-admin)",
                  }}
                >
                  <BotIcon size={14} />
                </div>
                <div
                  style={{
                    maxWidth: "78%",
                    padding: "9px 13px",
                    borderRadius: "3px 14px 14px 14px",
                    borderLeft: `3px solid ${m.refused ? "var(--bad)" : "var(--good)"}`,
                    background: "var(--surface-2)",
                    boxShadow: "var(--shadow-sm)",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: "var(--ink)",
                  }}
                >
                  {stripInlineCitations(m.text, m.citations ?? [])}
                  {m.citations && m.citations.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {m.citations.map((c) => (
                        <span
                          key={c}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            fontSize: 10,
                            background: "var(--tier-admin)",
                            color: "#fff",
                            borderRadius: 999,
                            padding: "2px 8px",
                          }}
                        >
                          <PaperclipIcon size={10} /> {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.refused && (
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--bad)", marginTop: 6 }}>
                      Từ chối trả lời — không có tài liệu phù hợp
                    </div>
                  )}
                  {m.runId && (
                    <div style={{ marginTop: 7 }}>
                      <button
                        type="button"
                        onClick={() => toggleTrace(m.runId!)}
                        style={{
                          padding: "2px 9px",
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 999,
                          border: "1px solid var(--line-strong)",
                          background: "var(--surface)",
                          color: "var(--ink-soft)",
                          cursor: "pointer",
                        }}
                      >
                        {m.traceOpen ? "Ẩn trace" : "Xem trace"}
                        {m.trace ? ` (${m.trace.events.length} bước)` : ""}
                      </button>
                      {m.traceOpen && (
                        <div style={{ marginTop: 6 }}>
                          {m.trace ? (
                            <TraceViewer
                              expectedRunId={m.trace.run_id}
                              expectedAgentId={recipe.agent_id}
                              tenantId={session.tenantId}
                              events={m.trace.events}
                              timelineText={m.trace.timeline_text}
                            />
                          ) : m.traceError ? (
                            <div style={{ fontSize: 11, color: "var(--bad)" }} role="alert">
                              {m.traceError}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>Đang tải trace…</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {state === "sending" && (
            <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--tier-admin-soft)",
                  color: "var(--tier-admin)",
                }}
              >
                <BotIcon size={14} />
              </div>
              <div
                style={{
                  padding: "12px 15px",
                  borderRadius: "3px 14px 14px 14px",
                  background: "var(--surface-2)",
                  boxShadow: "var(--shadow-sm)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span className="chat-typing-dot" style={{ animationDelay: "0ms" }} />
                <span className="chat-typing-dot" style={{ animationDelay: "150ms" }} />
                <span className="chat-typing-dot" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={scrollBottomRef} />
        </div>

        {/* ================= COMPOSER ================= */}
        <div style={{ padding: "0 20px 16px" }}>
          {error && (
            <p style={{ color: "var(--bad)", fontSize: 12, marginTop: 2, marginBottom: 8 }} role="alert">
              {error}
            </p>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              padding: 7,
              borderRadius: 18,
              background: "var(--surface-2)",
              border: `1.5px solid ${composerFocused ? "var(--tier-admin)" : "var(--line)"}`,
              boxShadow: composerFocused ? "var(--shadow-md)" : "var(--shadow-sm)",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                resizeTextarea();
              }}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Tự nghĩ 1 câu hỏi để test agent…"
              style={{
                flex: 1,
                resize: "none",
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--ink)",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.5,
                padding: "8px 6px 8px 11px",
                maxHeight: COMPOSER_MAX_HEIGHT,
                overflowY: "auto",
              }}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label="Gửi câu hỏi"
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: "none",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: canSend ? "var(--tier-admin)" : "var(--ink-faint)",
                color: "#fff",
                cursor: canSend ? "pointer" : "default",
                transition: "background 0.15s",
              }}
            >
              {state === "sending" ? <span className="chat-spinner" /> : <SendIcon size={17} />}
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ink-faint)", marginTop: 5, paddingLeft: 5 }}>
            Enter để gửi · Shift+Enter xuống dòng
          </div>
        </div>
      </div>
    </div>
  );
}

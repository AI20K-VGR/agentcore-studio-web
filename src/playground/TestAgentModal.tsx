/**
 * Modal chạy thử Agent (Playground Interactive Test & Chat) — Khung chat
 * tương tác trực tiếp nhiều lượt kèm thanh xem Trace theo từng câu trả lời.
 */

import { useEffect, useRef, useState } from "react";
import type { WireTraceEvent } from "./api";
import type { StudioRunResponse } from "../studio/api";
import TraceViewer from "./TraceViewer";
import { SendIcon, XCircleIcon } from "../icons";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: StudioRunResponse;
  error?: string;
  ts: string;
}

export interface TestAgentModalProps {
  open: boolean;
  agentId: string;
  instructions: string;
  model: string;
  hasKb: boolean;
  hasTools: boolean;
  isStandaloneLlm: boolean;
  running: boolean;
  onSendMessage: (text: string) => Promise<StudioRunResponse>;
  tenantId: string;
  onClose: () => void;
}

export default function TestAgentModal({
  open,
  agentId,
  instructions,
  model,
  hasKb,
  hasTools,
  isStandaloneLlm,
  running,
  onSendMessage,
  tenantId,
  onClose,
}: TestAgentModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, running]);

  if (!open) return null;

  const quickPrompts = isStandaloneLlm
    ? [
        "Xin chào, bạn là ai?",
        "Tóm tắt 3 kỹ năng giao tiếp quan trọng.",
        "Viết một email cảm ơn ngắn gọn.",
      ]
    : hasKb
      ? [
          "Nhân viên xin nghỉ phép cần báo trước bao lâu?",
          "Chính sách công tác phí là gì?",
          "Quy trình xử lý sự cố bảo mật.",
        ]
      : hasTools
        ? [
            "Tính giúp tôi 15 * 240.",
            "Hôm nay là ngày mấy?",
            "Kiểm tra và tính toán nhanh.",
          ]
        : [
            "Xin chào!",
            "Giới thiệu các chức năng của bạn.",
          ];

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || running) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: query,
      ts: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLocalError(null);

    try {
      const traceResult = await onSendMessage(query);
      // Tìm câu trả lời từ node `llm-step` trong trace
      const llmEvent = traceResult.events?.find((e) => e.node_type === "llm-step");
      const answer =
        llmEvent?.outputs && typeof llmEvent.outputs === "object" && "answer" in llmEvent.outputs
          ? String(llmEvent.outputs.answer)
          : "Đã thực thi thành công nhưng không có phản hồi dạng văn bản.";

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: answer,
        trace: traceResult,
        ts: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      // Tự động mở trace cho câu trả lời mới
      setExpandedTraceId(assistantMsg.id);
    } catch (err) {
      const errText = err instanceof Error ? err.message : String(err);
      setLocalError(errText);
      const assistantErrMsg: ChatMessage = {
        id: `assistant-err-${Date.now()}`,
        role: "assistant",
        content: "Không thể hoàn thành lượt chạy do có lỗi.",
        error: errText,
        ts: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, assistantErrMsg]);
    }
  };

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
          width: "min(820px, 96vw)",
          height: "min(780px, 92vh)",
          display: "flex",
          flexDirection: "column",
          borderRadius: 14,
          border: "1px solid var(--line-strong)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-lg, 0 20px 40px rgba(0,0,0,0.25))",
          overflow: "hidden",
        }}
      >
        {/* ================= MODAL HEADER ================= */}
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontFamily: "var(--font-display)", color: "var(--ink)" }}>
                Chat & Test: <span style={{ color: "var(--brand, #1f3a5f)" }}>{agentId}</span>
              </h2>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2 }}>
              Model: <code>{model}</code> {instructions && `· Chỉ dẫn: "${instructions.slice(0, 45)}..."`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  color: "var(--ink-soft)",
                  fontSize: 11,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                Xoá chat
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--ink-faint)",
                cursor: "pointer",
                padding: 4,
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ================= CHAT MESSAGE STREAM ================= */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.length === 0 ? (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: 460, color: "var(--ink-soft)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                Khung Chat Kiểm Thử Trực Tiếp
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-faint)" }}>
                {isStandaloneLlm
                  ? "Agent này đang hoạt động như một Chatbot LLM độc lập. Gõ lời chào hoặc câu hỏi bất kỳ bên dưới để trò chuyện ngay."
                  : hasKb
                    ? "Agent này có kết nối Tri thức (KB). Gõ câu hỏi cần tra cứu tài liệu để kiểm tra độ chính xác và trích dẫn."
                    : "Gõ câu hỏi để kiểm tra khả năng thực thi công cụ và suy luận của Agent."}
              </div>

              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-faint)" }}>Gợi ý bắt đầu nhanh:</span>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                  {quickPrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleSend(p)}
                      style={{
                        padding: "5px 11px",
                        fontSize: 12,
                        borderRadius: 999,
                        border: "1px solid var(--line-strong)",
                        background: "var(--surface-2)",
                        color: "var(--ink)",
                        cursor: "pointer",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {/* Bubble */}
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: 12,
                    borderBottomRightRadius: msg.role === "user" ? 2 : 12,
                    borderBottomLeftRadius: msg.role === "assistant" ? 2 : 12,
                    background:
                      msg.role === "user"
                        ? "linear-gradient(135deg, #1f3a5f 0%, #2b4c7e 100%)"
                        : "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)",
                    color: msg.role === "user" ? "#fff" : "var(--ink)",
                    border: msg.role === "assistant" ? "1px solid var(--line-strong)" : "none",
                    boxShadow: "var(--shadow-sm)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content}

                  {msg.error && (
                    <div style={{ marginTop: 6, color: "var(--bad)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}>
                      <XCircleIcon size={13} /> {msg.error}
                    </div>
                  )}
                </div>

                {/* Footer info & Toggle Trace */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, padding: "0 4px" }}>
                  <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>{msg.ts}</span>
                  {msg.trace && (
                    <button
                      type="button"
                      onClick={() => setExpandedTraceId((curr) => (curr === msg.id ? null : msg.id))}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--brand, #1f3a5f)",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      {expandedTraceId === msg.id ? "Ẩn Trace" : "🔍 Xem Execution Trace"}
                    </button>
                  )}
                </div>

                {/* Expanded Trace Details */}
                {msg.trace && expandedTraceId === msg.id && (
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      marginTop: 8,
                      padding: 12,
                      background: "var(--surface-2)",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                    }}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
                      Execution Trace (run_id: {msg.trace.run_id})
                    </div>
                    <TraceViewer
                      expectedRunId={msg.trace.run_id}
                      expectedAgentId={agentId}
                      tenantId={tenantId}
                      events={msg.trace.events as WireTraceEvent[]}
                      timelineText={msg.trace.timeline_text}
                    />
                  </div>
                )}
              </div>
            ))
          )}

          {running && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-soft)", fontSize: 12.5, fontStyle: "italic" }}>
              <div style={{ display: "inline-flex", gap: 3 }}>
                <span style={{ animation: "pulse 1s infinite", fontWeight: 900 }}>•</span>
                <span style={{ animation: "pulse 1s infinite 0.2s", fontWeight: 900 }}>•</span>
                <span style={{ animation: "pulse 1s infinite 0.4s", fontWeight: 900 }}>•</span>
              </div>
              <span>LLM đang suy luận và xử lý...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Global Error Banner */}
        {localError && (
          <div
            style={{
              padding: "6px 16px",
              background: "var(--bad-soft)",
              borderTop: "1px solid var(--bad)",
              color: "var(--bad)",
              fontSize: 11.5,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <XCircleIcon size={14} />
            <span>{localError}</span>
          </div>
        )}

        {/* ================= CHAT INPUT BAR ================= */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid var(--line)",
            background: "var(--surface-2)",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              isStandaloneLlm
                ? "Gõ tin nhắn trò chuyện trực tiếp (Enter để gửi)..."
                : "Gõ câu hỏi tra cứu hoặc lệnh tính toán (Enter để gửi)..."
            }
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid var(--line-strong)",
              background: "var(--surface)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--ink)",
              outline: "none",
              resize: "none",
              maxHeight: 100,
            }}
          />

          <button
            type="button"
            disabled={running || !input.trim()}
            onClick={() => handleSend()}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: "none",
              background: running || !input.trim() ? "var(--ink-soft)" : "var(--good)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: running || !input.trim() ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "var(--shadow-sm)",
              height: 38,
            }}
          >
            <SendIcon size={14} /> Gửi
          </button>
        </div>
      </div>
    </div>
  );
}

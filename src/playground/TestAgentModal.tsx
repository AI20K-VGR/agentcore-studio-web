/**
 * Modal chạy thử Agent (Playground Interactive Test Modal) — Hỗ trợ cả
 * Chatbot LLM độc lập, RAG Agent và Tool-Augmented Agent.
 */

import type { WireTraceEvent } from "./api";
import type { StudioRunResponse } from "../studio/api";
import TraceViewer from "./TraceViewer";
import { BrainIcon, DatabaseIcon, PlayIcon, WrenchIcon, XCircleIcon } from "../icons";

export interface TestAgentModalProps {
  open: boolean;
  agentId: string;
  instructions: string;
  model: string;
  hasKb: boolean;
  hasTools: boolean;
  isStandaloneLlm: boolean;
  testQuery: string;
  onTestQueryChange: (query: string) => void;
  onRunTest: (query: string) => void;
  running: boolean;
  error: string | null;
  trace: StudioRunResponse | null;
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
  testQuery,
  onTestQueryChange,
  onRunTest,
  running,
  error,
  trace,
  tenantId,
  onClose,
}: TestAgentModalProps) {
  if (!open) return null;

  const quickPrompts = isStandaloneLlm
    ? [
        "Xin chào, bạn có thể giới thiệu về bản thân không?",
        "Tóm tắt ngắn gọn quy trình chăm sóc khách hàng chuyên nghiệp.",
        "Viết một email cảm ơn đối tác trang trọng.",
      ]
    : hasKb
      ? [
          "Nhân viên xin nghỉ phép cần báo trước bao lâu?",
          "Chính sách công tác phí và hạn mức phê duyệt là gì?",
          "Quy trình xử lý sự cố bảo mật thông tin nội bộ.",
        ]
      : hasTools
        ? [
            "Tính giúp tôi 15% của 2,450,000 đồng.",
            "Hôm nay là ngày mấy và mấy giờ?",
            "Giúp tôi kiểm tra thông tin và tính toán nhanh.",
          ]
        : [
            "Xin chào, bạn có thể giúp gì cho tôi?",
            "Giới thiệu các chức năng của hệ thống.",
            "Tư vấn giải pháp phù hợp.",
          ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,14,24,0.58)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 130,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 95vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 14,
          border: "1px solid var(--line-strong)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-lg, 0 16px 36px rgba(0,0,0,0.22))",
          overflow: "hidden",
        }}
      >
        {/* ================= MODAL HEADER ================= */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: "var(--font-display)", color: "var(--ink)" }}>
                Chạy thử Agent: <span style={{ color: "var(--brand, #1f3a5f)" }}>{agentId}</span>
              </h2>
              {isStandaloneLlm ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#1f3a5f",
                    background: "rgba(61, 90, 128, 0.15)",
                  }}
                >
                  <BrainIcon size={13} /> Chatbot LLM Trực Tiếp
                </span>
              ) : hasKb ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#134e4a",
                    background: "rgba(32, 109, 100, 0.15)",
                  }}
                >
                  <DatabaseIcon size={13} /> RAG Tra cứu Tri thức
                </span>
              ) : (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#5b3a8c",
                    background: "rgba(107, 79, 160, 0.15)",
                  }}
                >
                  <WrenchIcon size={13} /> Tool Satellite Agent
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
              Model: <code>{model}</code> {instructions && `· Chỉ dẫn: "${instructions.slice(0, 45)}..."`}
            </div>
          </div>
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

        {/* ================= MODAL BODY ================= */}
        <div style={{ padding: "18px 20px", overflowY: "auto", flex: 1 }}>
          <label
            htmlFor="test-query-input"
            style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}
          >
            Câu hỏi / Lời nhắc kiểm thử (Test Prompt):
          </label>

          <textarea
            id="test-query-input"
            rows={3}
            value={testQuery}
            onChange={(e) => onTestQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && testQuery.trim() && !running) {
                e.preventDefault();
                onRunTest(testQuery);
              }
            }}
            placeholder={
              isStandaloneLlm
                ? "Gõ tin nhắn trò chuyện trực tiếp với LLM..."
                : "Gõ câu hỏi cần tra cứu dữ liệu hoặc gọi công cụ..."
            }
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1.5px solid var(--line-strong)",
              background: "var(--surface)",
              fontFamily: "var(--font-body)",
              fontSize: 13.5,
              color: "var(--ink)",
              outline: "none",
              resize: "vertical",
            }}
          />

          {/* Gợi ý câu hỏi nhanh */}
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-faint)" }}>Gợi ý mẫu:</span>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  onTestQueryChange(prompt);
                  onRunTest(prompt);
                }}
                style={{
                  padding: "3px 9px",
                  fontSize: 11,
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                  color: "var(--ink-soft)",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Nút hành động Chạy thử */}
          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              disabled={running || !testQuery.trim()}
              onClick={() => onRunTest(testQuery)}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "none",
                background: running ? "var(--ink-soft)" : "var(--good)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: running || !testQuery.trim() ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <PlayIcon size={14} />
              {running ? "Đang thực thi DAG & gọi LLM..." : "Chạy thử (Run Test)"}
            </button>
            <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
              Phím tắt: Nhấn <code>Enter</code> để chạy nhanh
            </span>
          </div>

          {/* Lỗi nếu có */}
          {error && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--bad)",
                background: "var(--bad-soft)",
                color: "var(--bad)",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <XCircleIcon size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* ================= KẾT QUẢ TRACE & TRẢ LỜI ================= */}
          {trace && (
            <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                  Kết quả thực thi (Execution Trace):
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                  run_id: {trace.run_id}
                </span>
              </div>
              <TraceViewer
                expectedRunId={trace.run_id}
                expectedAgentId={agentId}
                tenantId={tenantId}
                events={trace.events as WireTraceEvent[]}
                timelineText={trace.timeline_text}
              />
            </div>
          )}
        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "flex-end",
            background: "var(--surface-2)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "7px 16px",
              borderRadius: 7,
              border: "1px solid var(--line-strong)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontWeight: 600,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

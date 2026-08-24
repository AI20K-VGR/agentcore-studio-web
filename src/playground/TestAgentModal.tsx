/**
 * Modal nút Test — connectivity-check TĨNH (web#18, `PROJECT-SCOPE-DEMO-DAY30.md` mục D). ĐỔI
 * HẲN so với bản trước app#48: KHÔNG còn chat nhiều lượt, KHÔNG xem trace — chỉ xác nhận từng
 * tool trong `tool_whitelist` có executor/dispatcher thật hay không. 3 việc đó (chạy thử câu hỏi,
 * xem trace, money-shot fence-proof) đã chuyển hẳn sang mục E (Chat) — `src/chat/ChatPage.tsx`,
 * chỉ chạy được trên agent ĐÃ PUBLISH. Modal này thao tác trên draft canvas chưa publish nên
 * không có cách nào chat thật được nữa — đúng thiết kế mới, không phải rút gọn tạm.
 */

import { useEffect, useRef } from "react";
import type { ConnectivityCheckResult } from "../studio/api";
import { CheckCircleIcon, XCircleIcon } from "../icons";

export interface TestAgentModalProps {
  open: boolean;
  agentId: string;
  toolWhitelist: string[];
  running: boolean;
  error: string | null;
  results: ConnectivityCheckResult[] | null;
  onRunCheck: () => void;
  onClose: () => void;
}

export default function TestAgentModal({
  open,
  agentId,
  toolWhitelist,
  running,
  error,
  results,
  onRunCheck,
  onClose,
}: TestAgentModalProps) {
  // Tự chạy connectivity-check khi vừa mở modal LẦN ĐẦU (đúng ý mục D: "bấm Test → xác nhận" —
  // không cần gõ gì thêm). Chỉ tự chạy khi chưa có `results` VÀ chưa có `error` (tức chưa từng
  // thử lần nào) — nếu lần trước đã lỗi, chờ user tự bấm "Thử lại" thay vì lặp lại request mỗi
  // lần modal re-render. Ref chặn re-fire lặp, chỉ fire đúng 1 lần cho mỗi lần open đóng → mở.
  const firedForOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      firedForOpenRef.current = false;
      return;
    }
    if (firedForOpenRef.current) return;
    if (results !== null || running || error) return;
    firedForOpenRef.current = true;
    onRunCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

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
          width: "min(560px, 94vw)",
          maxHeight: "min(640px, 90vh)",
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
            <h2 style={{ margin: 0, fontSize: 17, fontFamily: "var(--font-display)", color: "var(--ink)" }}>
              Kiểm tra kết nối tool: <span style={{ color: "var(--brand, #1f3a5f)" }}>{agentId}</span>
            </h2>
            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2 }}>
              Xác nhận từng tool trong <code>tool_whitelist</code> có nối được chưa — không chạy thử
              câu hỏi, không tạo trace hội thoại (dùng trang Chat cho việc đó, sau khi publish).
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

        {/* ================= NỘI DUNG ================= */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          {running ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-soft)", fontSize: 13, fontStyle: "italic" }}>
              <div style={{ display: "inline-flex", gap: 3 }}>
                <span style={{ animation: "pulse 1s infinite", fontWeight: 900 }}>•</span>
                <span style={{ animation: "pulse 1s infinite 0.2s", fontWeight: 900 }}>•</span>
                <span style={{ animation: "pulse 1s infinite 0.4s", fontWeight: 900 }}>•</span>
              </div>
              <span>Đang kiểm tra kết nối tool...</span>
            </div>
          ) : error ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  padding: "10px 12px",
                  background: "var(--bad-soft)",
                  border: "1px solid var(--bad)",
                  borderRadius: 8,
                  color: "var(--bad)",
                  fontSize: 12.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <XCircleIcon size={14} />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={onRunCheck}
                style={{
                  alignSelf: "flex-start",
                  padding: "7px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--line-strong)",
                  background: "var(--surface-2)",
                  color: "var(--ink)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Thử lại
              </button>
            </div>
          ) : results === null ? null : results.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 12.5, padding: "24px 0" }}>
              Agent chưa khai tool nào trong tool_whitelist.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((r) => {
                const ok = r.status === "OK";
                return (
                  <div
                    key={r.tool}
                    data-status={r.status}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${ok ? "var(--good, #1a7f4c)" : "var(--bad)"}`,
                      background: "var(--surface-2)",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{r.tool}</span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 700,
                        color: ok ? "var(--good, #1a7f4c)" : "var(--bad)",
                      }}
                    >
                      {ok ? <CheckCircleIcon size={14} /> : <XCircleIcon size={14} />}
                      {r.status}
                    </span>
                  </div>
                );
              })}
              {toolWhitelist.length === 0 && (
                <div style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                  (tool_whitelist rỗng trên agent hiện tại — không có gì để kiểm)
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= FOOTER ================= */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid var(--line)",
            background: "var(--surface-2)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            disabled={running}
            onClick={onRunCheck}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: running ? "var(--ink-soft)" : "var(--good)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            Chạy lại
          </button>
        </div>
      </div>
    </div>
  );
}

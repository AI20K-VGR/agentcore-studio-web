/**
 * Trang Chat (Kế hoạch 1, B4) — dùng agent ĐÃ PUBLISH, gọi `POST /api/agents/{agent_id}/chat`
 * (`chat/api.ts`). KHÔNG liên quan tới canvas/Playground — luồng riêng, theo đúng phân biệt đã
 * thống nhất: canvas là "xây/test", trang này là "dùng agent đã xuất bản".
 *
 * `agentId` hiện là ô nhập tay (chưa có route "liệt kê agent đã publish của tenant hiện tại") —
 * ghi rõ giới hạn này thay vì giả vờ đã có danh sách.
 */

import { useCallback, useState } from "react";
import { useSession } from "../auth/session";
import { sendChatMessage, type ChatResponse } from "./api";
import { StudioApiError } from "../auth/api";
import { ThemeToggleButton } from "../theme";
import { LogoBadge, UserMenu } from "../components/UserMenu";

interface Message {
  role: "user" | "agent";
  text: string;
  citations?: string[];
  refused?: boolean;
}

// Giới hạn kéo-giãn chiều cao ô nhập câu hỏi — cùng nguyên tắc với panel trái/phải ở canvas
// (`PANEL_MIN_WIDTH`/`PANEL_MAX_WIDTH`, App.tsx): dưới min thì chữ đang gõ dòng 2 bị che, trên
// max thì lấn quá nhiều chỗ của khung tin nhắn phía trên.
const CHAT_INPUT_MIN_HEIGHT = 44;
const CHAT_INPUT_MAX_HEIGHT = 240;

/**
 * `embedded=true` khi render bên trong tab "Chat" của `AppShell` (Kế hoạch admin, `App.tsx`):
 * AppShell đã có sẵn 1 thanh trên cùng dùng chung cho mọi tab (logo, nút sáng/tối, icon
 * avatar+menu tài khoản) — Chat KHÔNG được tự vẽ thêm 1 bộ logo/theme-toggle/logout riêng nữa
 * (trước đây làm vậy, thành 2 hàng header chồng nhau, lệch hẳn với Canvas). Route độc lập cho
 * user thường (`embedded` để trống, `onLogout` có) vẫn giữ nguyên header đầy đủ — route đó
 * không nằm trong AppShell, không có thanh trên cùng nào khác để dùng chung.
 */
export default function ChatPage({ onLogout, embedded }: { onLogout?: () => void; embedded?: boolean }) {
  const { session } = useSession();
  // Ô nhập agent_id đã bị bỏ khỏi giao diện theo yêu cầu — KHÔNG tự bịa cơ chế thay thế (chưa có
  // route "liệt kê agent đã publish", xem docstring đầu file). Giữ nguyên giá trị rỗng: gửi tin
  // hiện KHÔNG hoạt động cho tới khi có quyết định khác về việc lấy `agent_id` từ đâu.
  const [agentId] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [inputHeight, setInputHeight] = useState(64);

  const resizeInput = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (moveEvent: MouseEvent) => {
      // Kéo LÊN (chuột đi lên, `movementY` âm) phải làm ô nhập CAO hơn — đảo dấu.
      const delta = -moveEvent.movementY;
      setInputHeight((h) => Math.min(CHAT_INPUT_MAX_HEIGHT, Math.max(CHAT_INPUT_MIN_HEIGHT, h + delta)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleSend = async () => {
    if (session === null || !agentId.trim() || !input.trim()) return;
    const text = input.trim();
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setState("sending");
    setError(null);

    let response: ChatResponse;
    try {
      response = await sendChatMessage(agentId.trim(), text, session);
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
      setState("error");
      return;
    }
    setMessages((prev) => [
      ...prev,
      { role: "agent", text: response.answer, citations: response.citations, refused: response.refused },
    ]);
    setState("idle");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg)",
        fontFamily: "var(--font-body)",
        color: "var(--ink)",
      }}
    >
      {/* `embedded`: KHÔNG vẽ header gì cả — AppShell đã có sẵn thanh trên cùng dùng chung (logo,
          nút sáng/tối, icon avatar+menu). Route độc lập (`!embedded`, user role thường — không
          phải admin, xem `AppShell`) dùng ĐÚNG cùng 1 kiểu avatar tròn + menu thả xuống như
          admin — trước đây route này chỉ có text + nút logout mờ, lệch hẳn thẩm mỹ với admin,
          giờ đồng bộ lại: khác dữ liệu hiển thị trong menu (không có toggle minimap — trang này
          không có canvas), nhưng cùng 1 ngôn ngữ thị giác. */}
      {!embedded && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "13px 20px",
            borderBottom: "1px solid var(--line)",
            background: "var(--surface)",
          }}
        >
          <LogoBadge />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ThemeToggleButton />
            {session && <UserMenu session={session} onLogout={onLogout} />}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {messages.length === 0 && (
          <div
            style={{
              maxWidth: 420,
              margin: "40px auto 0",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Chưa có tin nhắn nào — nhập câu hỏi ở khung bên dưới rồi gửi.
          </div>
        )}
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "72%",
                  padding: "9px 13px",
                  borderRadius: 12,
                  borderBottomRightRadius: m.role === "user" ? 3 : 12,
                  borderBottomLeftRadius: m.role === "agent" ? 3 : 12,
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  background: m.role === "user" ? "var(--accent)" : m.refused ? "var(--danger-bg)" : "var(--surface)",
                  color: m.role === "user" ? "#fff" : "var(--ink)",
                  border: m.role === "agent" ? "1px solid var(--line)" : "none",
                }}
              >
                {m.text}
                {m.role === "agent" && m.citations && m.citations.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {m.citations.map((c) => (
                      <span
                        key={c}
                        style={{
                          display: "inline-block",
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          background: "var(--accent-copper)",
                          color: "#fff",
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {m.role === "agent" && m.refused && (
                  <div style={{ fontSize: 10.5, color: "var(--danger-text)", marginTop: 5, fontWeight: 600 }}>
                    Agent từ chối trả lời
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: "0 20px" }}>
          <p style={{ color: "var(--danger-text)", fontSize: 12, margin: "0 0 8px" }} role="alert">
            {error}
          </p>
        </div>
      )}

      {!agentId.trim() && (
        <div style={{ padding: "0 20px" }}>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 8px" }} role="status">
            Chat chưa khả dụng — chưa có nguồn <code>agent_id</code> (chờ route liệt kê agent đã
            publish của tenant hiện tại).
          </p>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        <div
          onMouseDown={resizeInput}
          title="Kéo để đổi chiều cao ô nhập câu hỏi"
          className="row-resizer"
        />
        <div style={{ display: "flex", gap: 8, padding: "10px 20px 14px", alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter gửi, Shift+Enter xuống dòng — quy ước chat quen thuộc (Slack/Discord).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Nhập câu hỏi… (Shift+Enter để xuống dòng)"
            style={{
              flex: 1,
              height: inputHeight,
              padding: "10px 13px",
              fontSize: 13.5,
              fontFamily: "inherit",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              outline: "none",
              resize: "none",
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={state === "sending" || !agentId.trim()}
            title={agentId.trim() ? "Gửi (Enter)" : "Chat chưa khả dụng — chưa có nguồn agent_id"}
            className="btn-switch"
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              color: "#fff",
              background: state === "sending" || !agentId.trim() ? "#93a5e8" : "var(--accent)",
              border: "none",
              cursor: state === "sending" || !agentId.trim() ? "not-allowed" : "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M14.5 1.5 1.5 7l4.8 2L8.5 14l6-12.5Z"
                stroke="#fff"
                strokeWidth="1.3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path d="M14.5 1.5 6.3 9" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Trang Chat (Kế hoạch 1, B4) — dùng agent ĐÃ PUBLISH, gọi `POST /api/agents/{agent_id}/chat`
 * (`chat/api.ts`). KHÔNG liên quan tới canvas/Playground — luồng riêng, theo đúng phân biệt đã
 * thống nhất: canvas là "xây/test", trang này là "dùng agent đã xuất bản".
 *
 * `agentId` hiện là ô nhập tay (chưa có route "liệt kê agent đã publish của tenant hiện tại") —
 * ghi rõ giới hạn này thay vì giả vờ đã có danh sách.
 */

import { useState } from "react";
import { useSession } from "../auth/session";
import { sendChatMessage, type ChatResponse } from "./api";
import { StudioApiError } from "../auth/api";

interface Message {
  role: "user" | "agent";
  text: string;
  citations?: string[];
  refused?: boolean;
}

export default function ChatPage({ onLogout }: { onLogout?: () => void }) {
  const { session } = useSession();
  const [agentId, setAgentId] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 14, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          agent_id (đã publish)
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="vd: agent-callisto-d4"
            style={{ display: "block", width: 260, marginTop: 4, fontFamily: "monospace" }}
          />
        </label>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            style={{ marginLeft: "auto", fontSize: 11, color: "#71717a" }}
          >
            Đăng xuất
          </button>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          border: "1px solid #e4e4e7",
          borderRadius: 6,
          padding: 10,
          marginTop: 10,
          marginBottom: 10,
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: "#a1a1aa", fontSize: 12 }}>Chưa có tin nhắn nào — nhập agent_id đã publish rồi gửi.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 10, textAlign: m.role === "user" ? "right" : "left" }}>
            <div
              style={{
                display: "inline-block",
                maxWidth: "70%",
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 13,
                background: m.role === "user" ? "#e0e7ff" : m.refused ? "#fef2f2" : "#f4f4f5",
              }}
            >
              {m.text}
              {m.role === "agent" && m.citations && m.citations.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {m.citations.map((c) => (
                    <span
                      key={c}
                      style={{
                        display: "inline-block",
                        fontSize: 10,
                        background: "#0f766e",
                        color: "#fff",
                        borderRadius: 999,
                        padding: "1px 7px",
                        marginRight: 4,
                      }}
                    >
                      📎 {c}
                    </span>
                  ))}
                </div>
              )}
              {m.role === "agent" && m.refused && (
                <div style={{ fontSize: 10, color: "#dc2626", marginTop: 4 }}>agent từ chối trả lời</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p style={{ color: "#dc2626", fontSize: 12 }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Nhập câu hỏi…"
          style={{ flex: 1, padding: "6px 10px" }}
        />
        <button type="button" onClick={handleSend} disabled={state === "sending"}>
          {state === "sending" ? "Đang gửi…" : "Gửi"}
        </button>
      </div>
    </div>
  );
}

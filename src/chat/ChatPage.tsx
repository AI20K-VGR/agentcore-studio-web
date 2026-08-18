/**
 * Trang Chat (Kế hoạch 1, B4) — dùng agent ĐÃ PUBLISH, gọi `POST /api/agents/{agent_id}/chat`
 * (`chat/api.ts`). KHÔNG liên quan tới canvas/Playground — luồng riêng, theo đúng phân biệt đã
 * thống nhất: canvas là "xây/test", trang này là "dùng agent đã xuất bản".
 *
 * `agentId` là DROPDOWN nạp từ `GET /api/agents` (`agents/api.ts::listAgents`), KHÔNG gõ tay —
 * quyết định "nhiều agent/công ty, employee CHỌN chứ không gõ ID" đã chốt qua AskUserQuestion.
 * Text hiển thị trong dropdown "nhân bản hoá" slug (`humanizeSlug`) — `agent_id` là 1 slug admin
 * tự gõ lúc build canvas, không phải UUID vô nghĩa nên KHÔNG ẩn, chỉ đổi kiểu trình bày (không
 * còn monospace code-block) cho đúng audience màn này (employee, không phải màn kỹ thuật).
 *
 * Admin (roles có `"admin"`, JWT đã tự mở rộng thấy MỌI section — `routes/auth.py::login`) luôn
 * thấy sẵn danh sách phòng ban dưới dạng checkbox (KHÔNG cần bật/tắt gì trước) — mặc định tick
 * hết (đúng trạng thái "thấy mọi thứ" của admin), admin tự bỏ tick phòng ban nào muốn LOẠI khỏi
 * lượt chat này để xem agent trả lời ra sao với 1 tập role hẹp hơn — tự kiểm nội dung nhân viên
 * phòng ban X thấy được gì TRƯỚC khi tin agent, không cần tạo tài khoản nhân viên thật để test.
 * Server (`routes/chat.py::ChatRequest.as_roles`, `require_admin`) chỉ CHO PHÉP thu hẹp, không
 * bao giờ mở rộng vượt quá section thật của tenant.
 */

import { useEffect, useState } from "react";
import { useSession } from "../auth/session";
import { BrandBar } from "../components/BrandBar";
import { sendChatMessage, type ChatResponse } from "./api";
import { StudioApiError } from "../httpUtil";
import { PaperclipIcon } from "../icons";
import { listAgents, type AgentSummary } from "../agents/api";
import { listSections, type SectionSummary } from "../admin/sectionsApi";

interface Message {
  role: "user" | "agent";
  text: string;
  citations?: string[];
  refused?: boolean;
}

/** `"agent-callisto-d12"` → `"Agent callisto d12"` — chỉ đổi cách TRÌNH BÀY slug admin tự gõ,
 * không đổi giá trị gửi lên server (vẫn dùng `agent_id` gốc, xem `<option value>`). */
function humanizeSlug(slug: string): string {
  const words = slug.split(/[-_]/).filter(Boolean);
  if (words.length === 0) return slug;
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + " " + words.slice(1).join(" ");
}

function TestRolesPanel({
  sections,
  testRoles,
  onChange,
}: {
  sections: SectionSummary[];
  testRoles: string[];
  onChange: (roles: string[]) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 10,
        fontSize: 11,
        background: "var(--surface-2)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--ink-soft)" }}>
        Test agent với role (mặc định tick hết):
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {sections.length === 0 && <span style={{ color: "var(--ink-faint)" }}>Công ty chưa có phòng ban nào.</span>}
        {sections.map((s) => (
          <label key={s.id} style={{ display: "flex", gap: 5, alignItems: "center", color: "var(--ink-soft)" }}>
            <input
              type="checkbox"
              checked={testRoles.includes(s.name)}
              onChange={(e) =>
                onChange(e.target.checked ? [...testRoles, s.name] : testRoles.filter((r) => r !== s.name))
              }
            />
            <code style={{ fontFamily: "var(--font-mono)" }}>{s.name}</code>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ChatPage({ onLogout }: { onLogout?: () => void }) {
  const { session } = useSession();
  const isAdmin = session?.roles.includes("admin") ?? false;

  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [testRoles, setTestRoles] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session === null) return;
    let cancelled = false;
    listAgents(session)
      .then((result) => {
        if (cancelled) return;
        setAgents(result);
        if (result.length > 0) setAgentId(result[0].agent_id);
      })
      .catch((err) => {
        if (cancelled) return;
        setAgentsError(err instanceof StudioApiError ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (session === null || !isAdmin) return;
    let cancelled = false;
    listSections(session)
      .then((result) => {
        if (cancelled) return;
        setSections(result);
        // Mặc định tick HẾT — đúng trạng thái admin thấy mọi thứ, chỉ bỏ tick khi admin CHỦ ĐỘNG
        // muốn thu hẹp để test 1 tổ hợp role hẹp hơn.
        setTestRoles(result.map((s) => s.name));
      })
      .catch(() => {
        // Chỉ ảnh hưởng bảng chọn role test — không hiện lỗi riêng, không chặn chat bình thường.
      });
    return () => {
      cancelled = true;
    };
  }, [session, isAdmin]);

  const handleSend = async () => {
    if (session === null || !agentId || !input.trim()) return;
    const text = input.trim();
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setState("sending");
    setError(null);

    // `as_roles` CHỈ gửi khi là admin — server (`require_admin`) từ chối field này cho employee,
    // và employee vốn không có UI để đổi `testRoles` (panel chỉ hiện cho admin, `testRoles` với
    // employee luôn là `[]` mặc định, gửi lên sẽ bị 403 oan nếu không chặn ở đây).
    let response: ChatResponse;
    try {
      response = await sendChatMessage(agentId, text, session, isAdmin ? testRoles : undefined);
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--paper)" }}>
      {onLogout && session && (
        <BrandBar
          session={session}
          roleLabel="Nhân viên"
          roleTone="var(--tier-employee)"
          onLogout={onLogout}
        />
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>
          Trợ lý (agent đã publish)
          {agents.length > 0 ? (
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              style={{
                display: "block",
                width: 280,
                marginTop: 4,
                padding: "7px 9px",
                borderRadius: 6,
                border: "1px solid var(--line-strong)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 13,
              }}
            >
              {agents.map((a) => (
                <option key={a.agent_id} value={a.agent_id}>
                  {humanizeSlug(a.agent_id)} (v{a.latest_published_version})
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>
              {agentsError ?? "Chưa có agent nào được publish cho công ty bạn."}
            </div>
          )}
        </label>

        {isAdmin && (
          <div style={{ marginTop: 10 }}>
            <TestRolesPanel sections={sections} testRoles={testRoles} onChange={setTestRoles} />
          </div>
        )}

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 12,
            marginTop: 10,
            marginBottom: 10,
            background: "var(--surface)",
          }}
        >
          {messages.length === 0 && (
            <p style={{ color: "var(--ink-faint)", fontSize: 12 }}>
              {agents.length === 0 ? "Chưa có agent nào để chat." : "Chưa có tin nhắn nào — chọn trợ lý rồi gửi."}
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10, textAlign: m.role === "user" ? "right" : "left" }}>
              <div
                style={{
                  display: "inline-block",
                  maxWidth: "70%",
                  padding: "7px 11px",
                  borderRadius: 10,
                  fontSize: 13,
                  textAlign: "left",
                  background: m.role === "user" ? "var(--tier-admin-soft)" : m.refused ? "var(--bad-soft)" : "var(--surface-2)",
                  color: "var(--ink)",
                }}
              >
                {m.text}
                {m.role === "agent" && m.citations && m.citations.length > 0 && (
                  <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 4 }}>
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
                {m.role === "agent" && m.refused && (
                  <div style={{ fontSize: 10, color: "var(--bad)", marginTop: 4 }}>agent từ chối trả lời</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p style={{ color: "var(--bad)", fontSize: 12 }} role="alert">
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Nhập câu hỏi…"
            disabled={agents.length === 0}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--line-strong)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={state === "sending" || agents.length === 0}
            style={{
              padding: "0 18px",
              borderRadius: 6,
              border: "none",
              fontWeight: 700,
              fontSize: 13,
              color: "#fff",
              cursor: state === "sending" || agents.length === 0 ? "default" : "pointer",
              background: state === "sending" || agents.length === 0 ? "var(--ink-faint)" : "var(--tier-employee)",
            }}
          >
            {state === "sending" ? "Đang gửi…" : "Gửi"}
          </button>
        </div>
      </div>
    </div>
  );
}

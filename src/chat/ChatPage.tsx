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

import { useEffect, useRef, useState } from "react";
import { useSession } from "../auth/session";
import { BrandBar } from "../components/BrandBar";
import { fetchConversationHistory, sendChatMessage, type ChatResponse } from "./api";
import { getStoredConversationId, setStoredConversationId } from "./conversationPref";
import { StudioApiError } from "../httpUtil";
import { BotIcon, PaperclipIcon, SendIcon, UserIcon } from "../icons";
import { listAgents, type AgentSummary } from "../agents/api";
import { listSections, type SectionSummary } from "../admin/sectionsApi";
import { fetchTrace, type StudioRunResponse } from "../studio/api";
import TraceViewer from "../playground/TraceViewer";

// Ô nhập tự cao dần theo nội dung (tối đa ~6 dòng rồi mới cuộn bên trong) — thay `<input>` 1 dòng
// cố định trước đây (phản hồi: "khung nhập câu hỏi bé quá"). Không dùng lib auto-resize ngoài
// (không có sẵn trong `package.json`, thêm 1 dependency chỉ để đo chiều cao là quá tay) — tự đo
// qua `scrollHeight` trên chính DOM node.
const COMPOSER_MAX_HEIGHT = 160;

interface Message {
  role: "user" | "agent";
  text: string;
  citations?: string[];
  refused?: boolean;
  version?: number;
  // web#9 — mỗi lượt chat mang `run_id` riêng, đọc lại trace bằng request TÁCH RIÊNG (không tin
  // thẳng response `/chat`), cùng nguyên tắc D15 Canvas Test (`App.tsx::handleTest`) đã dùng.
  // `trace: null` = fetch lỗi (xem `traceError`); `undefined` = còn đang tải.
  runId?: string;
  trace?: StudioRunResponse | null;
  traceError?: string;
  traceOpen?: boolean;
}

/** Bỏ `[chunk_id]` LLM tự chèn ngay trong câu trả lời — cơ chế grounding thật (server dò ngược
 * `[chunk_id]` trong chính text model sinh ra để xác nhận có trích ĐÚNG đoạn đã retrieve hay
 * không, không tin model tự khai), nhưng hiển thị mã nội bộ đó thẳng cho nhân viên đọc thì thừa —
 * thông tin đó đã có sẵn dạng pill riêng (`citations`) ngay bên dưới. Chỉ xoá đúng những
 * `[id]` khớp 1 trong các `citations` THẬT đã xác nhận grounded — không xoá bừa mọi cặp ngoặc
 * vuông (tránh lỡ ăn vào nội dung thật nào đó tình cờ có dấu ngoặc vuông). */
function stripInlineCitations(text: string, citations: string[]): string {
  if (citations.length === 0) return text;
  let result = text;
  for (const id of citations) {
    result = result.split(`[${id}]`).join("");
  }
  return result.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
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
        borderLeft: "3px solid var(--tier-admin)",
        borderRadius: "0 10px 10px 0",
        padding: "9px 14px",
        marginBottom: 12,
        background: "var(--tier-admin-soft)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 7, fontSize: 11, letterSpacing: 0.2, color: "var(--tier-admin)" }}>
        Thử vai trò
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {sections.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>Công ty chưa có phòng ban nào.</span>
        )}
        {sections.map((s) => {
          const checked = testRoles.includes(s.name);
          return (
            <label
              key={s.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 10px 3px 6px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${checked ? "var(--tier-admin)" : "var(--line-strong)"}`,
                background: checked ? "var(--surface)" : "transparent",
                color: checked ? "var(--tier-admin)" : "var(--ink-faint)",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  onChange(e.target.checked ? [...testRoles, s.name] : testRoles.filter((r) => r !== s.name))
                }
                style={{ accentColor: "var(--tier-admin)" }}
              />
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{s.name}</code>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function ChatPage({ onLogout }: { onLogout?: () => void }) {
  const { session } = useSession();
  const isAdmin = session?.systemRoles?.includes("admin") ?? false;

  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [testRoles, setTestRoles] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  // app#74/web#28 — `undefined` = chưa có lượt chat nào cho agent hiện tại (phiên mới, server tự
  // tạo `conversation_id` ở lượt gửi đầu). Có giá trị = phiên đã có (hydrate lại từ localStorage,
  // hoặc server vừa trả về sau 1 lượt gửi thành công) — thread vào lượt gửi tiếp theo.
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);
  // Review dholmes0207 (PR#42, finding 2) — generation counter cho effect hydrate: `cancelled` (bên
  // dưới) chỉ biết effect cleanup (đổi agent/unmount), KHÔNG biết `handleSend` đã bắn 1 lượt gửi
  // mới trong lúc `fetchConversationHistory` còn bay. `handleSend` tự tăng số này lên để vô hiệu
  // hoá MỌI lượt hydrate đang bay — response cũ về muộn sẽ tự bỏ qua thay vì ghi đè tin vừa gửi.
  const hydrationRef = useRef(0);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  };

  // Cuộn xuống tin nhắn mới nhất (kể cả bong bóng "đang trả lời") — mỗi lượt chat thêm nội dung ở
  // cuối danh sách, không tự cuộn thì người dùng phải tự kéo xuống mỗi lần gửi.
  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, state]);

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

  // app#74/web#28 — khi `agentId` đổi (kể cả lần đầu, lúc effect trên vừa set giá trị đầu tiên):
  // xoá sạch hội thoại đang hiện (vá gap "đổi agent ở dropdown không clear messages" — hội thoại
  // agent cũ còn lẫn khi chuyển agent), rồi thử hydrate lại phiên gần nhất CỦA AGENT NÀY từ
  // localStorage. Không có gì lưu sẵn → giữ nguyên `messages=[]` (hội thoại mới, đúng hành vi cũ).
  useEffect(() => {
    if (session === null || !agentId) return;
    setMessages([]);
    setConversationId(undefined);
    const stored = getStoredConversationId(session, agentId);
    if (!stored) return;
    let cancelled = false;
    const generation = ++hydrationRef.current;
    fetchConversationHistory(agentId, stored, session)
      .then((result) => {
        // `generation !== hydrationRef.current` — `handleSend` đã bắn 1 lượt gửi mới trong lúc
        // request này còn bay (finding 2 review dholmes0207) → bỏ qua, không ghi đè tin vừa gửi.
        if (cancelled || generation !== hydrationRef.current) return;
        setConversationId(result.conversation_id);
        // Mỗi `ConversationTurn` = 1 cặp Q/A → 2 `Message` (đúng thứ tự `turn_index ASC` server đã
        // trả). CHỦ Ý không set `runId`: `ConversationTurn` không mang `refused` (chỉ đọc được
        // `citations` — xem docstring `chat/api.ts::ConversationTurn`), và set `runId` mà không
        // fetch trace kèm sẽ để nút "Xem trace" kẹt mãi ở "Đang tải trace…" (không gì trigger fetch
        // cho turn cũ) — bỏ hẳn nút đó cho turn hydrate thay vì để nó vỡ.
        setMessages(
          result.turns.flatMap((t) => [
            { role: "user" as const, text: t.question },
            { role: "agent" as const, text: t.answer, citations: t.citations },
          ]),
        );
      })
      .catch(() => {
        // Phiên cũ đã mất (404)/lỗi mạng — không phải hành động người dùng chủ động bấm nên không
        // hiện `error` riêng, chỉ giữ `messages=[]` như chưa từng có lịch sử (đã set ở trên).
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, session]);

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
    // Review dholmes0207 (PR#42, finding 2) — vô hiệu hoá NGAY bất kỳ lượt hydrate lịch sử nào
    // đang bay (`fetchConversationHistory`, effect trên): nếu nó về sau thời điểm này, response cũ
    // đó sẽ tự bỏ qua thay vì `setMessages()` ghi đè tin nhắn sắp thêm ngay dưới đây.
    hydrationRef.current += 1;
    const text = input.trim();
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    // Ô nhập tự cao dần lúc gõ (`resizeTextarea`) — gửi xong phải tự co lại về 1 dòng, không thì
    // 1 câu hỏi dài để lại ô trống to đùng dù đã rỗng nội dung.
    requestAnimationFrame(resizeTextarea);
    setState("sending");
    setError(null);

    // `as_roles` CHỈ gửi khi admin THẬT SỰ thu hẹp có chủ đích — 2 lỗi khác nhau bị gộp nhầm ở bản
    // cũ (`isAdmin ? testRoles : undefined`):
    // 1. employee: đúng, luôn `undefined` (server 403 field này với non-admin).
    // 2. admin: bản cũ gửi THẲNG `testRoles`, kể cả khi nó đang là `[]` KHÔNG PHẢI vì admin bỏ tick
    //    hết, mà vì `core.sections` của tenant đang RỖNG (`listSections()` trả `[]`, chưa ai tạo
    //    phòng ban) — hoặc đơn giản là `listSections()` CHƯA kịp trả về (race lúc mới vào trang).
    //    `[]` khác `undefined` ở tầng server: `chat.py`'s `if body.as_roles is not None` xem `[]`
    //    là "có" giả lập, `interpreter.run()` ghi đè `section_roles` node kb-retrieve thành RỖNG —
    //    kb-retrieve fail-closed, LUÔN 0 chunk, agent luôn "Không có thông tin" — dù dữ liệu có
    //    thật và nút Test (không đi qua `as_roles`) vẫn trả lời đúng. Chỉ gửi `testRoles` khi có
    //    ÍT NHẤT 1 section thật VÀ admin đã bỏ tick ít nhất 1 cái (thu hẹp thật) — mọi ca còn lại
    //    (chưa có section nào, hoặc tick đủ hết) đều phải là `undefined` = dùng nguyên role thật
    //    của session, không giả lập gì cả.
    const activeTestRoles =
      isAdmin && sections.length > 0 && testRoles.length !== sections.length ? testRoles : undefined;
    let response: ChatResponse;
    try {
      // app#74 — `conversationId` (state): `undefined` ở lượt đầu của 1 phiên mới, có giá trị ở
      // các lượt sau (server thread lịch sử vào prompt). Server LUÔN trả lại `conversation_id`
      // (mới sinh hoặc y hệt giá trị đã gửi) — không tự suy đoán ở client.
      response = await sendChatMessage(agentId, text, session, activeTestRoles, conversationId);
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
        version: response.version,
        runId: response.run_id,
      },
    ]);
    setState("idle");

    // app#74/web#28 — server LUÔN trả `conversation_id` (mới sinh ở lượt đầu, hoặc y hệt giá trị
    // đã gửi ở các lượt sau) — ghi lại state + localStorage (per-agent, `conversationPref.ts`) để
    // lượt gửi tiếp theo VÀ lần mở lại trang sau này đều thread đúng phiên này.
    setConversationId(response.conversation_id);
    setStoredConversationId(session, agentId, response.conversation_id);

    // web#9 — đọc lại trace ngay sau khi có `run_id`, request TÁCH RIÊNG khỏi `/chat` (đúng khuôn
    // dùng chung `fetchTrace()`, `studio/api.ts`: POST rồi GET lại, không tin thẳng response POST). Lỗi fetch
    // trace KHÔNG xoá/chặn `answer` đã hiện — 2 request độc lập, gắn theo đúng `runId` của lượt
    // chat đó (không phải state dùng chung cả phiên, nhiều lượt chat không giẫm lên nhau).
    //
    // CHỈ admin mới gọi — nhân viên không được xem trace (quyết định chốt cùng user). Backend
    // (`routes/runs.py::get_run`) giờ đòi `require_admin`, nên gọi cho nhân viên sẽ luôn 403; bỏ
    // qua hẳn request đó thay vì gọi rồi tự nuốt lỗi.
    if (!isAdmin) return;
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

  const canSend = state !== "sending" && agents.length > 0 && input.trim().length > 0;

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

      <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center", overflow: "hidden" }}>
        {/* Cột giữa co lại tối đa ~720px — chat đọc dễ nhất khi dòng chữ không kéo dài hết bề rộng
            màn hình rộng, giống 1 trang tài liệu hơn là 1 bảng dữ liệu. */}
        <div
          style={{
            flex: 1,
            maxWidth: 720,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            padding: "18px 20px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                flexShrink: 0,
                background: "var(--tier-admin-soft)",
                color: "var(--tier-admin)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BotIcon size={19} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 19,
                  fontWeight: 600,
                  color: "var(--ink)",
                  lineHeight: 1.25,
                }}
              >
                Trợ lý nội bộ
              </div>
              {agents.length > 0 ? (
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  aria-label="Chọn trợ lý"
                  style={{
                    marginTop: 2,
                    border: "none",
                    background: "transparent",
                    color: "var(--ink-soft)",
                    fontSize: 12.5,
                    fontFamily: "var(--font-body)",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  {agents.map((a) => (
                    <option key={a.agent_id} value={a.agent_id}>
                      {humanizeSlug(a.agent_id)} · v{a.latest_published_version}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 3 }}>
                  {agentsError ?? "Chưa có agent nào được publish cho công ty bạn."}
                </div>
              )}
            </div>
          </div>

          {isAdmin && <TestRolesPanel sections={sections} testRoles={testRoles} onChange={setTestRoles} />}

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 2px 4px" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", marginTop: 44, color: "var(--ink-faint)" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, opacity: 0.6 }}>
                  <BotIcon size={26} />
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>
                  {agents.length === 0
                    ? "Chưa có agent nào để chat."
                    : "Đặt câu hỏi để bắt đầu — trợ lý chỉ trả lời dựa trên tài liệu nội bộ đã nạp."}
                </p>
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
                      background: "var(--tier-employee)",
                      color: "#fff",
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    {m.text}
                  </div>
                  {/* Avatar đối xứng bên agent (`BotIcon` ở nhánh dưới) — cùng kích thước 26px,
                      chỉ đổi màu/icon để phân biệt 2 phía hội thoại ngay cả khi cuộn nhanh. */}
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--tier-employee-soft)",
                      color: "var(--tier-employee)",
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
                      // Vệt màu bên trái = tín hiệu "có căn cứ hay không" nhìn thấy ngay, không phải
                      // đọc hết chữ mới biết — `refused` (`packages/engine/.../executors.py`) đúng
                      // bằng "không trích dẫn được gì", nên xanh/đỏ ở đây khớp thẳng ý nghĩa đó.
                      borderLeft: `3px solid ${m.refused ? "var(--bad)" : "var(--good)"}`,
                      background: "var(--surface)",
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
                    {/* Trace CHỈ dành cho admin (tab "Dùng thử") — nhân viên chỉ thấy câu trả lời.
                        Backend đã chặn thật (`GET /api/runs/{run_id}` đòi `require_admin`), đây là
                        lớp ẩn UI đi kèm, không phải hàng rào duy nhất. */}
                    {isAdmin && m.runId && (
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
                                expectedAgentId={agentId}
                                tenantId={session?.tenantId ?? ""}
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

            {/* Chỉ báo "đang trả lời" — thay khoảng trắng im lặng trước đây trong lúc chờ, và nút
                Gửi bên dưới không còn phải tự gánh việc báo trạng thái bằng chữ "Đang gửi…" nữa. */}
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
                    background: "var(--surface)",
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

          {error && (
            <p style={{ color: "var(--bad)", fontSize: 12, marginTop: 2 }} role="alert">
              {error}
            </p>
          )}

          {/* Composer — panh rộng, tự cao dần theo nội dung (phản hồi: "khung nhập câu hỏi bé
              quá"). Viền/bóng đổi theo focus để cả thanh trông như 1 khối bấm được, không phải 1
              input trần cạnh 1 nút rời. */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              marginTop: 10,
              padding: 7,
              borderRadius: 18,
              background: "var(--surface)",
              border: `1.5px solid ${composerFocused ? "var(--tier-employee)" : "var(--line)"}`,
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
                  handleSend();
                }
              }}
              placeholder="Nhập câu hỏi…"
              disabled={agents.length === 0}
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
              onClick={handleSend}
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
                background: canSend ? "var(--tier-employee)" : "var(--ink-faint)",
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

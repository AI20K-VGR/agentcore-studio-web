/**
 * Test cho `ChatPage` — repo chưa có bài nào cho component này trước web#28. Phạm vi: hydrate lại
 * lịch sử hội thoại khi mở lại trang / đổi agent, giữ `conversation_id` qua `localStorage`
 * (`conversationPref.ts`) — đúng mục Verify của issue.
 *
 * `ChatPage` lấy session qua `useSession()` (context), không phải prop như `TestAgentModal` — mock
 * `../auth/session` với 1 biến session có thể đổi giữa các test (`currentSession`).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChatPage from "./ChatPage";
import { fetchConversationHistory, sendChatMessage } from "./api";
import type { ConversationResponse } from "./api";
import { listAgents } from "../agents/api";
import type { Session } from "../auth/session";

vi.mock("./api", () => ({
  sendChatMessage: vi.fn(),
  fetchConversationHistory: vi.fn(),
}));
vi.mock("../agents/api", () => ({
  listAgents: vi.fn(),
}));
vi.mock("../admin/sectionsApi", () => ({
  listSections: vi.fn(),
}));
vi.mock("../studio/api", () => ({
  fetchTrace: vi.fn(),
}));

const employeeSession: Session = {
  accessToken: "t",
  tenantId: "tenant-1",
  tenantName: "Ankor",
  user: "employee@ankor.vn",
  systemRoles: [],
  mustChangePassword: false,
};

let currentSession: Session | null = employeeSession;

vi.mock("../auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/session")>();
  return {
    ...actual,
    useSession: () => ({ session: currentSession, login: vi.fn(), logout: vi.fn() }),
  };
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
  currentSession = employeeSession;
});

const AGENT_A = { agent_id: "agent-a", latest_published_version: 1 };
const AGENT_B = { agent_id: "agent-b", latest_published_version: 1 };

// Review dholmes0207 (finding 1, PR#42) — khoá theo NGƯỜI ĐĂNG NHẬP, không chỉ agent: máy dùng
// chung, người sau đăng nhập không được nhặt đúng `conversation_id` người trước để lại
// (`localStorage` sống qua `logout()`, server chỉ fence theo tenant+agent — không có cột chủ sở
// hữu trên `wb.conversations`).
function storageKey(session: Session, agentId: string): string {
  return `chat:conversation:${session.tenantId}:${session.user}:${agentId}`;
}

describe("ChatPage — hydrate lịch sử hội thoại", () => {
  it("có conversation_id lưu sẵn cho agent → hydrate lại đủ message đúng thứ tự", async () => {
    vi.mocked(listAgents).mockResolvedValue([AGENT_A]);
    localStorage.setItem(storageKey(employeeSession, AGENT_A.agent_id), "conv-1");
    vi.mocked(fetchConversationHistory).mockResolvedValue({
      conversation_id: "conv-1",
      agent_id: AGENT_A.agent_id,
      turns: [
        { turn_index: 1, question: "câu 1?", answer: "trả lời 1", citations: ["c1"], run_id: "r1" },
        { turn_index: 2, question: "câu 2?", answer: "trả lời 2", citations: [], run_id: "r2" },
      ],
    });

    render(<ChatPage />);

    await waitFor(() =>
      expect(fetchConversationHistory).toHaveBeenCalledWith(AGENT_A.agent_id, "conv-1", employeeSession),
    );
    await waitFor(() => expect(screen.getByText("trả lời 2")).toBeInTheDocument());
    expect(screen.getByText("câu 1?")).toBeInTheDocument();
    expect(screen.getByText("trả lời 1")).toBeInTheDocument();
    expect(screen.getByText("câu 2?")).toBeInTheDocument();
  });

  it("không có gì lưu sẵn → không gọi fetchConversationHistory, khung chat trống", async () => {
    vi.mocked(listAgents).mockResolvedValue([AGENT_A]);

    render(<ChatPage />);

    await waitFor(() => expect(listAgents).toHaveBeenCalled());
    expect(fetchConversationHistory).not.toHaveBeenCalled();
  });

  it("gửi tin nhắn đầu tiên → sendChatMessage nhận conversationId=undefined, response ghi lại localStorage", async () => {
    vi.mocked(listAgents).mockResolvedValue([AGENT_A]);
    vi.mocked(sendChatMessage).mockResolvedValue({
      answer: "trả lời agent",
      citations: [],
      refused: false,
      run_id: "r1",
      version: 1,
      conversation_id: "conv-new",
    });

    render(<ChatPage />);
    await waitFor(() => expect(listAgents).toHaveBeenCalled());

    const textarea = screen.getByPlaceholderText("Nhập câu hỏi…");
    fireEvent.change(textarea, { target: { value: "hỏi gì đó" } });
    fireEvent.click(screen.getByRole("button", { name: /gửi câu hỏi/i }));

    await waitFor(() => expect(screen.getByText("trả lời agent")).toBeInTheDocument());
    expect(sendChatMessage).toHaveBeenCalledWith(AGENT_A.agent_id, "hỏi gì đó", employeeSession, undefined, undefined);
    expect(localStorage.getItem(storageKey(employeeSession, AGENT_A.agent_id))).toBe("conv-new");
  });

  it("đổi agent ở dropdown → clear messages ngay, hydrate đúng phiên riêng của agent mới", async () => {
    vi.mocked(listAgents).mockResolvedValue([AGENT_A, AGENT_B]);
    localStorage.setItem(storageKey(employeeSession, AGENT_A.agent_id), "conv-a");
    localStorage.setItem(storageKey(employeeSession, AGENT_B.agent_id), "conv-b");
    vi.mocked(fetchConversationHistory).mockImplementation(async (agentId, conversationId) => ({
      conversation_id: conversationId,
      agent_id: agentId,
      turns: [
        {
          turn_index: 1,
          question: agentId === AGENT_A.agent_id ? "câu của agent A" : "câu của agent B",
          answer: agentId === AGENT_A.agent_id ? "trả lời agent A" : "trả lời agent B",
          citations: [],
          run_id: "r1",
        },
      ],
    }));

    render(<ChatPage />);

    await waitFor(() => expect(screen.getByText("trả lời agent A")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Chọn trợ lý"), { target: { value: AGENT_B.agent_id } });

    await waitFor(() => expect(screen.getByText("trả lời agent B")).toBeInTheDocument());
    expect(screen.queryByText("trả lời agent A")).not.toBeInTheDocument();
    expect(fetchConversationHistory).toHaveBeenCalledWith(AGENT_B.agent_id, "conv-b", employeeSession);
  });

  it("fetchConversationHistory lỗi (404 phiên cũ đã mất) → không crash, messages vẫn rỗng", async () => {
    vi.mocked(listAgents).mockResolvedValue([AGENT_A]);
    localStorage.setItem(storageKey(employeeSession, AGENT_A.agent_id), "conv-mat-roi");
    vi.mocked(fetchConversationHistory).mockRejectedValue(new Error("404 not found"));

    render(<ChatPage />);

    await waitFor(() => expect(fetchConversationHistory).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Đặt câu hỏi để bắt đầu/i)).toBeInTheDocument();
  });

  // Review dholmes0207, finding 1 (PR#42, lý do request-changes) — máy dùng chung: user A đã chat
  // trước, để lại `conversation_id` trong localStorage; user B (khác `user`, CÙNG `tenantId`) đăng
  // nhập sau trên cùng máy đó KHÔNG được tự động nhặt lịch sử của A. Server không chặn được vụ này
  // (fence chỉ theo tenant+agent, `wb.conversations` không có cột chủ sở hữu) — hàng rào PHẢI nằm
  // ở đây, key localStorage.
  it("2 người dùng khác nhau trên cùng máy → không đọc được conversation của nhau", async () => {
    const userB: Session = { ...employeeSession, user: "userB@ankor.vn" };
    vi.mocked(listAgents).mockResolvedValue([AGENT_A]);
    // User A đã chat trước đó trên máy này, để lại conversation_id trong localStorage.
    localStorage.setItem(storageKey(employeeSession, AGENT_A.agent_id), "conv-cua-A");

    currentSession = userB;
    render(<ChatPage />);

    await waitFor(() => expect(listAgents).toHaveBeenCalled());
    expect(fetchConversationHistory).not.toHaveBeenCalled();
  });

  // Review dholmes0207, finding 2 (PR#42) — `fetchConversationHistory` bay lâu, người dùng gửi 1
  // tin nhắn MỚI trước khi nó về (đúng lúc trang vừa tải xong, hay gõ ngay). Lịch sử cũ về muộn
  // KHÔNG được ghi đè tin vừa gửi, và `localStorage` phải giữ đúng `conversation_id` MỚI (không bị
  // kéo ngược lại giá trị cũ, làm mồ côi phiên chứa tin vừa gửi).
  it("lịch sử hydrate về muộn (sau khi đã gửi tin mới) → không ghi đè tin vừa gửi", async () => {
    vi.mocked(listAgents).mockResolvedValue([AGENT_A]);
    localStorage.setItem(storageKey(employeeSession, AGENT_A.agent_id), "conv-cu");

    let resolveHistory!: (value: ConversationResponse) => void;
    vi.mocked(fetchConversationHistory).mockReturnValue(
      new Promise((resolve) => {
        resolveHistory = resolve;
      }),
    );
    vi.mocked(sendChatMessage).mockResolvedValue({
      answer: "trả lời mới",
      citations: [],
      refused: false,
      run_id: "r-moi",
      version: 1,
      conversation_id: "conv-moi",
    });

    render(<ChatPage />);
    await waitFor(() => expect(fetchConversationHistory).toHaveBeenCalled());

    // Gửi tin trong lúc lịch sử cũ còn đang bay.
    fireEvent.change(screen.getByPlaceholderText("Nhập câu hỏi…"), { target: { value: "tin mới" } });
    fireEvent.click(screen.getByRole("button", { name: /gửi câu hỏi/i }));
    await waitFor(() => expect(screen.getByText("trả lời mới")).toBeInTheDocument());

    // Giờ mới cho lịch sử cũ (về muộn) resolve.
    resolveHistory({
      conversation_id: "conv-cu",
      agent_id: AGENT_A.agent_id,
      turns: [{ turn_index: 1, question: "câu cũ", answer: "trả lời cũ", citations: [], run_id: "r-cu" }],
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText("trả lời mới")).toBeInTheDocument();
    expect(screen.queryByText("trả lời cũ")).not.toBeInTheDocument();
    expect(localStorage.getItem(storageKey(employeeSession, AGENT_A.agent_id))).toBe("conv-moi");
  });
});

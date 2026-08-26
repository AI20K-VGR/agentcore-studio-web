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
import { listAgents } from "../agents/api";
import { listSections } from "../admin/sectionsApi";
import { fetchTrace } from "../studio/api";
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

function storageKey(agentId: string): string {
  return `chat:conversation:${agentId}`;
}

describe("ChatPage — hydrate lịch sử hội thoại", () => {
  it("có conversation_id lưu sẵn cho agent → hydrate lại đủ message đúng thứ tự", async () => {
    vi.mocked(listAgents).mockResolvedValue([AGENT_A]);
    localStorage.setItem(storageKey(AGENT_A.agent_id), "conv-1");
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
    expect(localStorage.getItem(storageKey(AGENT_A.agent_id))).toBe("conv-new");
  });

  it("đổi agent ở dropdown → clear messages ngay, hydrate đúng phiên riêng của agent mới", async () => {
    vi.mocked(listAgents).mockResolvedValue([AGENT_A, AGENT_B]);
    localStorage.setItem(storageKey(AGENT_A.agent_id), "conv-a");
    localStorage.setItem(storageKey(AGENT_B.agent_id), "conv-b");
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
    localStorage.setItem(storageKey(AGENT_A.agent_id), "conv-mat-roi");
    vi.mocked(fetchConversationHistory).mockRejectedValue(new Error("404 not found"));

    render(<ChatPage />);

    await waitFor(() => expect(fetchConversationHistory).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Đặt câu hỏi để bắt đầu/i)).toBeInTheDocument();
  });
});

// Giữ import `fetchTrace` để mock module `../studio/api` không rơi vào "declared but unused" —
// không path nào trong bộ test này (session employee, không phải admin) gọi tới nó thật, nhưng
// `ChatPage` vẫn import module đó ở module scope nên phải mock đủ hình dạng.
void fetchTrace;
void listSections;

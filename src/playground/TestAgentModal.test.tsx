/**
 * Test cho `TestAgentModal` sau khi viết lại thành khung chat thật trên draft — thay hẳn bản
 * connectivity-check tĩnh cũ.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TestAgentModal from "./TestAgentModal";
import { sendTestChatMessage } from "./testChatApi";
import { fetchTrace } from "../studio/api";
import type { Session } from "../auth/session";
import type { WireRecipe } from "../recipe/contract";

vi.mock("./testChatApi", () => ({
  sendTestChatMessage: vi.fn(),
}));

vi.mock("../studio/api", () => ({
  fetchTrace: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const session: Session = {
  accessToken: "test-token",
  tenantId: "t1",
  tenantName: "Test Tenant",
  user: "admin@ankor.vn",
  roles: ["admin"],
};

const recipe: WireRecipe = {
  agent_id: "agent-x",
  tenant_id: "00000000-0000-0000-0000-000000000001",
  agent_config: { system_prompt: "x", model: "gpt-4o-mini", tool_whitelist: [] },
  dag: { nodes: [], edges: [] },
  kb_binding: { kb_id: "kb-callisto-v1", scope: "ankor/public" },
  golden_set_ref: "callisto-2.0-golden-30-v1",
  scorecard_threshold: { success: 0.8, citation_accuracy: 0.8 },
};

function renderModal(overrides: Partial<React.ComponentProps<typeof TestAgentModal>> = {}) {
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof TestAgentModal> = {
    open: true,
    recipe,
    session,
    onClose,
    ...overrides,
  };
  const view = render(<TestAgentModal {...props} />);
  return { ...view, onClose };
}

describe("TestAgentModal", () => {
  it("chưa có tin nhắn nào → hiện gợi ý đặt câu hỏi", () => {
    renderModal();
    expect(screen.getByText(/tự nghĩ ra để kiểm agent/i)).toBeInTheDocument();
  });

  it("gửi câu hỏi → gọi sendTestChatMessage đúng recipe/message, hiện câu trả lời", async () => {
    vi.mocked(sendTestChatMessage).mockResolvedValue({
      answer: "Cần báo trước 3 ngày.",
      citations: ["c1"],
      refused: false,
      run_id: "r1",
    });
    vi.mocked(fetchTrace).mockResolvedValue({
      run_id: "r1",
      agent_id: "agent-x",
      tenant_id: "t1",
      events: [],
      timeline_text: "",
    });

    renderModal();
    const textarea = screen.getByPlaceholderText(/tự nghĩ 1 câu hỏi/i);
    fireEvent.change(textarea, { target: { value: "nghỉ phép cần báo trước bao lâu?" } });
    fireEvent.click(screen.getByRole("button", { name: /gửi câu hỏi/i }));

    await waitFor(() => expect(screen.getByText("Cần báo trước 3 ngày.")).toBeInTheDocument());
    expect(sendTestChatMessage).toHaveBeenCalledWith(recipe, "nghỉ phép cần báo trước bao lâu?", session);
  });

  it("lỗi gửi → hiện thông báo lỗi", async () => {
    vi.mocked(sendTestChatMessage).mockRejectedValue(new Error("recipe không qua graph_lint()"));

    renderModal();
    const textarea = screen.getByPlaceholderText(/tự nghĩ 1 câu hỏi/i);
    fireEvent.change(textarea, { target: { value: "q?" } });
    fireEvent.click(screen.getByRole("button", { name: /gửi câu hỏi/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("recipe không qua graph_lint()"));
  });

  it("bấm nút đóng → gọi onClose", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /đóng/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mở lại modal → xoá sạch lịch sử chat cũ", async () => {
    vi.mocked(sendTestChatMessage).mockResolvedValue({
      answer: "trả lời cũ",
      citations: [],
      refused: false,
      run_id: "r1",
    });
    vi.mocked(fetchTrace).mockResolvedValue({
      run_id: "r1",
      agent_id: "agent-x",
      tenant_id: "t1",
      events: [],
      timeline_text: "",
    });

    const { rerender } = renderModal();
    fireEvent.change(screen.getByPlaceholderText(/tự nghĩ 1 câu hỏi/i), { target: { value: "q1" } });
    fireEvent.click(screen.getByRole("button", { name: /gửi câu hỏi/i }));
    await waitFor(() => expect(screen.getByText("trả lời cũ")).toBeInTheDocument());

    rerender(<TestAgentModal open={false} recipe={recipe} session={session} onClose={vi.fn()} />);
    rerender(<TestAgentModal open={true} recipe={recipe} session={session} onClose={vi.fn()} />);

    expect(screen.queryByText("trả lời cũ")).not.toBeInTheDocument();
  });
});

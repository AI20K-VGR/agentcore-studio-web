/**
 * Test cho `TestAgentModal` sau khi viết lại theo web#18 — không còn chat/trace, chỉ hiển thị
 * connectivity-check `{tool, status}[]` (`PROJECT-SCOPE-DEMO-DAY30.md` mục D).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TestAgentModal from "./TestAgentModal";
import type { ConnectivityCheckResult } from "../studio/api";

afterEach(() => {
  cleanup();
});

const fixtureResults: ConnectivityCheckResult[] = [
  { tool: "kb_search", status: "OK" },
  { tool: "calculator", status: "NOT_IMPLEMENTED" },
];

function renderModal(overrides: Partial<React.ComponentProps<typeof TestAgentModal>> = {}) {
  const onRunCheck = vi.fn();
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof TestAgentModal> = {
    open: true,
    agentId: "a1",
    toolWhitelist: ["kb_search", "calculator"],
    running: false,
    error: null,
    results: null,
    onRunCheck,
    onClose,
    ...overrides,
  };
  const view = render(<TestAgentModal {...props} />);
  return { ...view, onRunCheck, onClose };
}

describe("TestAgentModal", () => {
  it("hiện danh sách tool kèm trạng thái, phân biệt qua data-status", () => {
    renderModal({ results: fixtureResults });

    expect(screen.getByText("kb_search")).toBeInTheDocument();
    expect(screen.getByText("calculator")).toBeInTheDocument();

    const okRow = screen.getByText("kb_search").closest("[data-status]");
    const failRow = screen.getByText("calculator").closest("[data-status]");
    expect(okRow).toHaveAttribute("data-status", "OK");
    expect(failRow).toHaveAttribute("data-status", "NOT_IMPLEMENTED");
  });

  it("running=true → hiện loading, không render row", () => {
    renderModal({ running: true, results: null });

    expect(screen.getByText(/đang kiểm tra/i)).toBeInTheDocument();
    expect(screen.queryByText("kb_search")).not.toBeInTheDocument();
  });

  it("error → hiện banner lỗi + nút Thử lại gọi onRunCheck", () => {
    const { onRunCheck } = renderModal({ error: "Không gọi được apps/studio" });

    expect(screen.getByText("Không gọi được apps/studio")).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /thử lại/i });
    fireEvent.click(retryBtn);
    expect(onRunCheck).toHaveBeenCalledTimes(1);
  });

  it("tự gọi onRunCheck đúng 1 lần khi mở modal chưa có kết quả", () => {
    const { onRunCheck } = renderModal({ open: true, results: null, running: false });
    expect(onRunCheck).toHaveBeenCalledTimes(1);
  });

  it("results rỗng → hiện empty-state, không row nào", () => {
    renderModal({ results: [] });
    expect(screen.getByText(/chưa khai tool nào/i)).toBeInTheDocument();
  });
});

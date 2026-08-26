/**
 * Test cho `LlmStepConfigModal` — validate `temperature` ([0, 2]), hiện lỗi inline nhưng KHÔNG
 * chặn đóng modal (đã bỏ chặn — giữ chặn từng khiến người dùng kẹt không đóng nổi modal khi đang
 * gõ dở). web#48 — `system_prompt` không còn ở modal này nữa, không còn test cho nó.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Node as FlowNode } from "reactflow";
import LlmStepConfigModal from "./LlmStepConfigModal";
import type { CanvasNodeData } from "../recipe/fromCanvas";

afterEach(() => {
  cleanup();
});

function llmNode(temperature: unknown = 0.7): FlowNode<CanvasNodeData> {
  return {
    id: "n2",
    type: "recipeNode",
    position: { x: 0, y: 0 },
    data: { type: "llm-step", params: { temperature } },
  };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof LlmStepConfigModal>> = {}) {
  const onTemperatureChange = vi.fn();
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof LlmStepConfigModal> = {
    node: llmNode(),
    onTemperatureChange,
    onClose,
    ...overrides,
  };
  const view = render(<LlmStepConfigModal {...props} />);
  return { ...view, onTemperatureChange, onClose };
}

describe("LlmStepConfigModal", () => {
  it("hợp lệ → bấm Xong gọi onClose", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /xong/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("temperature ngoài [0, 2] → hiện lỗi, KHÔNG gọi onTemperatureChange, vẫn cho đóng bằng Xong", () => {
    const { onTemperatureChange, onClose } = renderModal({ node: llmNode(0.7) });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "5" } });

    expect(screen.getByText(/trong khoảng 0 – 2/i)).toBeInTheDocument();
    expect(onTemperatureChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /xong/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sửa temperature hợp lệ → gọi onTemperatureChange với giá trị số", () => {
    const { onTemperatureChange } = renderModal({ node: llmNode(0.7) });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "1.5" } });
    expect(onTemperatureChange).toHaveBeenCalledWith("n2", 1.5);
  });
});

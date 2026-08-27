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
  const onSystemPromptChange = vi.fn();
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof LlmStepConfigModal> = {
    node: llmNode(),
    systemPrompt: "",
    onSystemPromptChange,
    onTemperatureChange,
    onClose,
    ...overrides,
  };
  const view = render(<LlmStepConfigModal {...props} />);
  return { ...view, onTemperatureChange, onSystemPromptChange, onClose };
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


describe("LlmStepConfigModal — chỉ thị cho agent", () => {
  it("gõ vào ô chỉ thị → báo lên khung, không lưu vào node.params", () => {
    // Ở trên KHUNG chứ không trên node: một agent có đúng một `system_prompt`. Lưu vào
    // `node.params` sẽ tạo hai nguồn sự thật vào ngày có node `llm-step` thứ hai.
    const { onSystemPromptChange, onTemperatureChange } = renderModal();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Bạn là trợ lý nhân sự." } });
    expect(onSystemPromptChange).toHaveBeenCalledWith("Bạn là trợ lý nhân sự.");
    expect(onTemperatureChange).not.toHaveBeenCalled();
  });

  it("để trống KHÔNG phải lỗi — không có thông báo lỗi, nút Xong vẫn bấm được", () => {
    // Điểm chính của lần đưa field này trở lại. Bắt buộc nhập sẽ chặn đúng ca phổ biến nhất: agent
    // chỉ cần tra KB rồi trả lời, và engine đã tự dán chỉ thị nền.
    const { onClose } = renderModal({ systemPrompt: "" });
    expect(screen.queryByText(/bắt buộc nhập|không được để trống/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /xong/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("nói rõ ngay chỗ nhập rằng để trống vẫn chạy được", () => {
    // Không có câu này thì người dùng phải ĐOÁN, và cách đoán an toàn là gõ đại một câu vô thưởng
    // vô phạt — thứ vừa vô dụng vừa làm nhiễu prompt thật.
    renderModal();
    expect(screen.getByText(/để trống cũng chạy được/i)).toBeInTheDocument();
  });

  it("hiện lại đúng giá trị đã lưu khi mở lại", () => {
    renderModal({ systemPrompt: "Trả lời ngắn gọn." });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Trả lời ngắn gọn.");
  });
});

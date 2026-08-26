/**
 * Test cho `NodeConfigModal`, tập trung vào field `kind: "section"` mới (`kb-retrieve`, web#44
 * review) — dropdown fetch `listSections()` lúc mở modal, khác mọi field khác (đều render tĩnh từ
 * spec/props, không gọi API).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Node as FlowNode } from "reactflow";
import NodeConfigModal from "./NodeConfigModal";
import type { CanvasNodeData } from "../recipe/fromCanvas";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";

vi.mock("../admin/sectionsApi", () => ({
  listSections: vi.fn(),
}));

import { listSections } from "../admin/sectionsApi";

afterEach(() => {
  cleanup();
  vi.mocked(listSections).mockReset();
});

const session: Session = {
  accessToken: "t",
  tenantId: "tenant-1",
  tenantName: "Ankor",
  user: "admin@ankor.vn",
  systemRoles: [],
  mustChangePassword: false,
};

function kbRetrieveNode(sectionRole: unknown = ""): FlowNode<CanvasNodeData> {
  return {
    id: "n1",
    type: "recipeNode",
    position: { x: 0, y: 0 },
    data: { type: "kb-retrieve", params: { section_role: sectionRole } },
  };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof NodeConfigModal>> = {}) {
  const onParamChange = vi.fn();
  const onDeleteNode = vi.fn();
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof NodeConfigModal> = {
    node: kbRetrieveNode(),
    session,
    onParamChange,
    onDeleteNode,
    onClose,
    ...overrides,
  };
  const view = render(<NodeConfigModal {...props} />);
  return { ...view, onParamChange, onDeleteNode, onClose };
}

describe("NodeConfigModal — field kind: section (kb-retrieve)", () => {
  it("fetch thành công → dropdown hiện đúng danh sách phòng ban", async () => {
    vi.mocked(listSections).mockResolvedValue([
      { id: "s1", tenant_id: "tenant-1", name: "hr", created_at: "2026-01-01" },
      { id: "s2", tenant_id: "tenant-1", name: "finance", created_at: "2026-01-01" },
    ]);
    renderModal();
    await waitFor(() => expect(screen.getByRole("option", { name: "hr" })).toBeInTheDocument());
    expect(screen.getByRole("option", { name: "finance" })).toBeInTheDocument();
  });

  it("fetch lỗi → hiện thông báo lỗi, không crash", async () => {
    vi.mocked(listSections).mockRejectedValue(new StudioApiError("mất kết nối"));
    renderModal();
    await waitFor(() => expect(screen.getByText(/không tải được danh sách phòng ban/i)).toBeInTheDocument());
    expect(screen.getByText(/mất kết nối/i)).toBeInTheDocument();
  });

  it("tenant chưa có phòng ban nào → hiện ghi chú, dropdown bị khoá", async () => {
    vi.mocked(listSections).mockResolvedValue([]);
    renderModal();
    await waitFor(() => expect(screen.getByText(/tenant chưa có phòng ban nào/i)).toBeInTheDocument());
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("chọn 1 phòng ban → gọi onParamChange với đúng key/giá trị", async () => {
    vi.mocked(listSections).mockResolvedValue([
      { id: "s1", tenant_id: "tenant-1", name: "hr", created_at: "2026-01-01" },
    ]);
    const { onParamChange } = renderModal();
    await waitFor(() => expect(screen.getByRole("option", { name: "hr" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "hr" } });
    expect(onParamChange).toHaveBeenCalledWith("n1", "section_role", "hr");
  });

  it("node khác không có field section → không gọi listSections", () => {
    renderModal({
      node: {
        id: "n2",
        type: "recipeNode",
        position: { x: 0, y: 0 },
        data: { type: "tool-call", params: { tool: "calculator" } },
      },
    });
    expect(listSections).not.toHaveBeenCalled();
  });
});

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

/** `params` nhận nguyên xi để dựng được cả những hình dạng HỎNG (chuỗi trần, mảng số, thiếu khoá)
 * — không chỉ hình dạng đúng. Một fixture chỉ dựng được dữ liệu hợp lệ thì không bao giờ chứng minh
 * được là `sectionRoleOf` có thật sự chặn hình dạng lạ hay chỉ tình cờ trả `""`. */
function kbRetrieveNode(params: Record<string, unknown> = { section_roles: [] }): FlowNode<CanvasNodeData> {
  return {
    id: "n1",
    type: "recipeNode",
    position: { x: 0, y: 0 },
    data: { type: "kb-retrieve", params },
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
    expect(onParamChange).toHaveBeenCalledWith("n1", "section_roles", ["hr"]);
  });

  it("bỏ chọn phòng ban → ghi mảng RỖNG, không phải [\"\"]", async () => {
    // `[""]` là dữ liệu hỏng nằm im: nó đi trọn đường tới backend rồi mới sai ở tầng chấm điểm
    // (cùng bài học `GoldenSetCard`). Test này ghim đúng chỗ đó — `toEqual([])` sẽ đỏ nếu ai đó
    // đơn giản hoá `onChange` thành `[event.target.value]` không điều kiện.
    vi.mocked(listSections).mockResolvedValue([
      { id: "s1", tenant_id: "tenant-1", name: "hr", created_at: "2026-01-01" },
    ]);
    const { onParamChange } = renderModal({ node: kbRetrieveNode({ section_roles: ["hr"] }) });
    await waitFor(() => expect(screen.getByRole("option", { name: "hr" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(onParamChange).toHaveBeenCalledWith("n1", "section_roles", []);
  });

  it("node đã có section_roles sẵn, fetch chưa resolve → select vẫn hiện đúng giá trị đã lưu, không rỗng/lệch", () => {
    // web#44 review (Suggestion) — trước bản vá này, `sections` khởi tạo `[]` nên
    // `<select value="hr">` không khớp option nào đang render (chỉ có "— chưa chọn —") cho tới khi
    // fetch xong. Promise treo vĩnh viễn ở đây mô phỏng đúng khung hình đó.
    vi.mocked(listSections).mockReturnValue(new Promise(() => {}));
    renderModal({ node: kbRetrieveNode({ section_roles: ["hr"] }) });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("hr");
    expect(screen.getByRole("option", { name: "hr" })).toBeInTheDocument();
    expect(screen.getByText(/đang tải danh sách phòng ban/i)).toBeInTheDocument();
  });

  it.each([
    ["chuỗi trần (hình dạng `section_role` CŨ)", { section_roles: "hr" }],
    ["khoá cũ số ít còn sót", { section_role: "hr" }],
    ["mảng phần tử không phải chuỗi", { section_roles: [7] }],
    ["mảng rỗng", { section_roles: [] }],
    ["thiếu khoá hẳn", {}],
  ])("params hình dạng lạ — %s → select về '— chưa chọn —', không crash", async (_label, params) => {
    // Recipe ĐÃ PUBLISH mang hình dạng lúc ghi mãi mãi, nên node cũ ghi `section_role: "hr"` (số ít)
    // vẫn sẽ được mở ra sau bản vá này. Đọc nó thành `""` là ĐÚNG — không phải bug: giá trị cũ chưa
    // bao giờ tới được `fence.py`, và giả vờ đọc được nó chỉ làm hai hình dạng cùng sống mãi.
    vi.mocked(listSections).mockResolvedValue([
      { id: "s1", tenant_id: "tenant-1", name: "hr", created_at: "2026-01-01" },
    ]);
    renderModal({ node: kbRetrieveNode(params) });
    await waitFor(() => expect(screen.getByRole("option", { name: "hr" })).toBeInTheDocument());
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
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

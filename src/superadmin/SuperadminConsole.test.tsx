/**
 * `SuperadminConsole` sau khi dựng lại (web#29).
 *
 * Ba nhóm bất biến, và cả ba đều là thứ KHÔNG có gì đỏ khi sai — chỉ có người vận hành hiểu nhầm
 * hoặc mất dữ liệu:
 * 1. Trang mở ra là DANH SÁCH, không phải form tạo (bản trước mở ra là 2 form xếp dọc).
 * 2. Thao tác phá huỷ hỏi lại, và huỷ ở bước hỏi thì KHÔNG gọi API.
 * 3. Lỗi từ server hiện thành câu chữ, không phải khối JSON thô.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SuperadminConsole from "./SuperadminConsole";
import { listCompanies, listCompanyUsers, updateCompany } from "./api";
import { deleteSection, listSections } from "../admin/sectionsApi";
import type { CompanySummary } from "./api";
import type { Session } from "../auth/session";

vi.mock("./api", () => ({
  listCompanies: vi.fn(),
  listCompanyUsers: vi.fn(),
  createCompany: vi.fn(),
  addCompanyAdmin: vi.fn(),
  resetCompanyUserPassword: vi.fn(),
  updateCompany: vi.fn(),
}));

vi.mock("../admin/sectionsApi", () => ({
  listSections: vi.fn(),
  createSection: vi.fn(),
  renameSection: vi.fn(),
  deleteSection: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

const session: Session = {
  accessToken: "test-token",
  tenantId: "00000000-0000-0000-0000-0000000000ff",
  tenantName: "__system__",
  user: "root@agentcore.test",
  systemRoles: ["superadmin"],
};

function company(over: Partial<CompanySummary> = {}): CompanySummary {
  return {
    tenant_id: "t-ankor",
    name: "Ankor",
    created_at: "2026-08-26T00:00:00+00:00",
    is_active: true,
    user_count: 3,
    section_count: 2,
    ...over,
  };
}

function renderConsole() {
  return render(<SuperadminConsole session={session} onLogout={vi.fn()} />);
}

describe("bố cục", () => {
  it("mở ra là danh sách công ty kèm số liệu, không phải form tạo", async () => {
    // Bản trước: `listCompanies()` ĐÃ gọi và ĐÃ trả `created_at`, nhưng kết quả chỉ đổ vào một
    // `<select>` còn `created_at` bị vứt — không chỗ nào nhìn ra công ty nào đang tồn tại.
    vi.mocked(listCompanies).mockResolvedValue([company(), company({ tenant_id: "t-borea", name: "Borea", user_count: 8, section_count: 5 })]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([]);

    renderConsole();

    // `findAllByText`: tên công ty đang chọn xuất hiện ở CẢ hai cột (dòng danh sách bên trái và
    // tiêu đề chi tiết bên phải) — đó là hành vi đúng của bố cục hai cột, không phải trùng lặp.
    expect(await screen.findAllByText("Ankor")).not.toHaveLength(0);
    expect(screen.getByText("Borea")).toBeInTheDocument();
    // Tổng quan: 2 công ty · 11 tài khoản · 7 phòng ban — số bất đối xứng để bắt được ca cộng
    // nhầm cột.
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    // Form tạo công ty nằm trong modal, chưa mở thì không có ô nào của nó trên màn hình.
    expect(screen.queryByPlaceholderText("vd: Acme Corp")).not.toBeInTheDocument();
  });

  it("công ty đang tạm khoá nhìn ra được ngay trong danh sách, không phải mở chi tiết mới biết", async () => {
    vi.mocked(listCompanies).mockResolvedValue([company({ is_active: false })]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([]);

    renderConsole();

    await waitFor(() => expect(screen.getAllByText("Tạm khoá").length).toBeGreaterThan(0));
  });

  it("bấm 'Tạo công ty' mới mở form", async () => {
    vi.mocked(listCompanies).mockResolvedValue([]);
    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "+ Tạo công ty" }));
    expect(screen.getByPlaceholderText("vd: Acme Corp")).toBeInTheDocument();
  });
});

describe("thao tác phá huỷ", () => {
  it("huỷ ở bước hỏi lại thì KHÔNG gọi API xoá phòng ban", async () => {
    // Bản trước không hỏi gì cả — bấm "Xoá" là xoá luôn.
    vi.mocked(listCompanies).mockResolvedValue([company()]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([
      { id: "s-hr", tenant_id: "t-ankor", name: "hr", created_at: "2026-08-26T00:00:00+00:00" },
    ]);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "Xoá" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteSection).not.toHaveBeenCalled();
  });

  it("huỷ ở bước hỏi lại thì KHÔNG tạm khoá công ty", async () => {
    vi.mocked(listCompanies).mockResolvedValue([company()]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([]);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "Tạm khoá" }));
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it("đồng ý thì gọi đúng `is_active: false`", async () => {
    vi.mocked(listCompanies).mockResolvedValue([company()]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([]);
    vi.mocked(updateCompany).mockResolvedValue(company({ is_active: false }));
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "Tạm khoá" }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith("t-ankor", { isActive: false }, session));
  });

  it("MỞ LẠI công ty không hỏi — hỏi ở thao tác lành sẽ dạy người dùng bấm qua mà không đọc", async () => {
    vi.mocked(listCompanies).mockResolvedValue([company({ is_active: false })]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([]);
    vi.mocked(updateCompany).mockResolvedValue(company());
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);

    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "Mở lại" }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith("t-ankor", { isActive: true }, session));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe("thông báo lỗi", () => {
  it("409 xoá phòng ban hiện thành câu chữ, không phải khối JSON thô", async () => {
    // Chuỗi ném ra dưới đây là thứ `httpUtil.readJsonOrThrow` THẬT SỰ tạo: nó `JSON.stringify`
    // khi `detail` của FastAPI là object. Trước web#29, đúng khối JSON này hiện lên màn hình.
    vi.mocked(listCompanies).mockResolvedValue([company()]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([
      { id: "s-hr", tenant_id: "t-ankor", name: "hr", created_at: "2026-08-26T00:00:00+00:00" },
    ]);
    vi.mocked(deleteSection).mockRejectedValue(
      new Error(JSON.stringify({ message: "còn 3 user đang gắn role 'hr' — gỡ role trước khi xoá", user_count: 3 })),
    );
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "Xoá" }));
    expect(await screen.findByText(/gỡ role trước khi xoá/)).toBeInTheDocument();
    expect(screen.queryByText(/user_count/)).not.toBeInTheDocument();
  });
});

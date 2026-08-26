/**
 * `EmployeesTab` — ba bất biến mà không phép thử thuần nào chạm tới được, vì chúng nằm ở **vòng
 * đời render** và ở **vị trí trong cây JSX**, không ở phép biến đổi dữ liệu.
 *
 * Cả ba đến từ review web#38 (Dozyboy), và cả ba đều là loại lỗi không làm gì đỏ — chỉ làm người
 * dùng tin sai hoặc tưởng ứng dụng treo.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import EmployeesTab from "./EmployeesTab";
import { deactivateUser, listUsers, resetEmployeePassword } from "./usersApi";
import { listSections } from "./sectionsApi";
import type { UserSummary } from "./usersApi";
import type { Session } from "../auth/session";

vi.mock("./usersApi", () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  updateUserRoles: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  resetEmployeePassword: vi.fn(),
  grantAdmin: vi.fn(),
  revokeAdmin: vi.fn(),
}));

vi.mock("./sectionsApi", () => ({ listSections: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

const session: Session = {
  accessToken: "t",
  tenantId: "t-1",
  tenantName: "Ankor",
  user: "boss@ankor.vn",
  systemRoles: ["admin"],
  mustChangePassword: false,
};

function employee(over: Partial<UserSummary> = {}): UserSummary {
  return {
    user_id: "u-1",
    email: "nv@ankor.vn",
    system_roles: ["hr"],
    is_active: true,
    created_at: "2026-08-26T02:00:00+00:00",
    display_name: "Nguyễn Thị Thu",
    last_login_at: null,
    ...over,
  };
}

function renderTab() {
  vi.mocked(listSections).mockResolvedValue([
    { id: "s-hr", tenant_id: "t-1", name: "hr", created_at: "2026-08-01T00:00:00+00:00" },
  ]);
  return render(<EmployeesTab session={session} />);
}

describe("modal đặt lại mật khẩu", () => {
  it("lỗi hiện RA ĐƯỢC — không bị chính modal đè lên", async () => {
    // `Modal` là `position: fixed; inset: 0`, nên một `<Feedback>` ở cấp `Panel` bị nó phủ kín.
    // Bấm "Đặt lại" với mật khẩu sai mà không thấy gì là người dùng tưởng app treo — đúng luồng
    // bảo mật quan trọng nhất của trang này.
    vi.mocked(listUsers).mockResolvedValue([employee()]);
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: /Đặt lại mật khẩu/ }));
    const passwords = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    fireEvent.change(passwords[0], { target: { value: "ngan" } });
    fireEvent.change(passwords[1], { target: { value: "ngan" } });
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại" }));

    // `role="alert"` chứ không phải khớp chữ: nhãn ô nhập cũng chứa "8 ký tự", nên khớp chữ trần
    // sẽ mơ hồ — và mơ hồ ở đây nghĩa là bài test không thật sự chỉ vào dòng lỗi.
    const message = await screen.findByRole("alert");
    expect(message.textContent).toMatch(/8 ký tự/);
    // Phải nằm BÊN TRONG modal, không phải ở panel phía sau.
    expect(message.closest('[role="dialog"]')).not.toBeNull();
  });

  it("xác nhận không khớp cũng báo trong modal, và KHÔNG gọi API", async () => {
    vi.mocked(listUsers).mockResolvedValue([employee()]);
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: /Đặt lại mật khẩu/ }));
    const passwords = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    fireEvent.change(passwords[0], { target: { value: "mat-khau-dung" } });
    fireEvent.change(passwords[1], { target: { value: "mat-khau-sai" } });
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại" }));

    await screen.findByText(/không khớp/);
    expect(resetEmployeePassword).not.toHaveBeenCalled();
  });
});

describe("tải lại sau thao tác", () => {
  it("thao tác LỖI vẫn tải lại danh sách — server có thể đã ghi một phần", async () => {
    // Chỉ tải lại ở nhánh thành công nghĩa là panel bên phải tiếp tục hiện dữ liệu cũ trong khi
    // server đã đổi, và người dùng không có cách nào biết.
    //
    // Đi qua "Vô hiệu hoá" thay vì form Sửa: bất biến cần ghim là `run()` tải lại ở nhánh LỖI, và
    // mọi hành động trong panel đều đi qua đúng `run()` đó — chọn đường ngắn nhất chạm tới nó.
    vi.mocked(listUsers).mockResolvedValue([employee()]);
    vi.mocked(deactivateUser).mockRejectedValue(new Error("mất mạng"));
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    renderTab();

    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Vô hiệu hoá" }));

    // Chỉ ghim ĐÚNG bất biến: gọi lại `listUsers`. Không assert thêm dòng lỗi hiện ra — dòng đó do
    // `Feedback` ở cấp panel lo, và trộn hai điều vào một bài làm bài đỏ vì lý do không phải thứ nó
    // canh.
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2));
  });
});

describe("thao tác phá huỷ", () => {
  it("huỷ ở bước hỏi lại thì KHÔNG gọi API vô hiệu hoá", async () => {
    vi.mocked(listUsers).mockResolvedValue([employee()]);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Vô hiệu hoá" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(deactivateUser).not.toHaveBeenCalled();
  });

  it("câu hỏi lại gọi riêng khi đối tượng đang giữ quyền quản trị", async () => {
    // Công ty có hai admin thì admin này khoá được admin kia bằng một cú bấm — mất một admin khác
    // hẳn mất một nhân viên.
    vi.mocked(listUsers).mockResolvedValue([employee({ system_roles: ["admin", "hr"] })]);
    const confirmSpy = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmSpy);
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Vô hiệu hoá" }));
    expect(confirmSpy.mock.calls[0][0]).toContain("QUẢN TRỊ VIÊN");
  });
});

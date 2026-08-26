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
import { createUser, deactivateUser, listUsers, resetEmployeePassword, updateUser } from "./usersApi";
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

describe("dán danh sách (web#30 mục 3.4)", () => {
  async function openBulk() {
    fireEvent.click(await screen.findByRole("button", { name: "+ Thêm nhân viên" }));
    fireEvent.click(screen.getByRole("button", { name: "Dán danh sách" }));
  }

  it("một dòng lỗi KHÔNG làm hỏng cả lô — các dòng còn lại vẫn được tạo", async () => {
    // Người dán 15 dòng mà mất cả lô vì một email trùng sẽ phải tự dò xem dòng nào đã vào — đúng
    // thứ tính năng này sinh ra để tránh.
    vi.mocked(listUsers).mockResolvedValue([]);
    vi.mocked(createUser)
      .mockResolvedValueOnce({ user_id: "u-1", email: "a@x.vn", tenant_id: "t-1", system_roles: ["hr"] })
      .mockRejectedValueOnce(new Error("email 'b@x.vn' đã tồn tại"))
      .mockResolvedValueOnce({ user_id: "u-3", email: "c@x.vn", tenant_id: "t-1", system_roles: ["hr"] });

    renderTab();
    await openBulk();

    // `document.querySelector("textarea")` chứ không `getByRole("textbox")`: ô tìm kiếm ở cột trái
    // cũng là `textbox`, và nó đứng trước trong cây.
    fireEvent.change(document.querySelector("textarea")!, {
      target: { value: "a@x.vn, A, hr\nb@x.vn, B, hr\nc@x.vn, C, hr" },
    });
    const password = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    fireEvent.change(password, { target: { value: "mat-khau-du-dai" } });
    fireEvent.click(screen.getByRole("button", { name: /Tạo 3 tài khoản/ }));

    await waitFor(() => expect(createUser).toHaveBeenCalledTimes(3));
    // Tổng kết nêu đích danh dòng hỏng, và vẫn báo 2 tài khoản đã vào.
    await screen.findByText(/Đã tạo 2\/3/);
    expect(screen.getByText(/dòng 2/)).toBeInTheDocument();
  });

  it("đặt tên hỏng vẫn tính là tạo được, nhưng PHẢI nói ra", async () => {
    // Tài khoản vào rồi, tên thì không. Nuốt im lặng nghĩa là bảng hiện một dòng trông bình thường
    // và người dùng không bao giờ biết phải đi sửa tên (review web#39, mục 1).
    vi.mocked(listUsers).mockResolvedValue([]);
    vi.mocked(createUser).mockResolvedValue({
      user_id: "u-1",
      email: "a@x.vn",
      tenant_id: "t-1",
      system_roles: ["hr"],
    });
    vi.mocked(updateUser).mockRejectedValue(new Error("mất mạng"));

    renderTab();
    await openBulk();
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "a@x.vn, A, hr" } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="password"]')!, {
      target: { value: "mat-khau-du-dai" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Tạo 1 tài khoản/ }));

    await screen.findByText(/chưa đặt được tên/);
    // …nhưng KHÔNG bị đẩy sang cột lỗi: bảo họ tạo lại là đẩy họ vào lỗi trùng email.
    expect(screen.getByText(/Đã tạo 1\/1/)).toBeInTheDocument();
  });

  it("khoá đường ra trong lúc lô đang chạy", async () => {
    // Vòng lặp tạo tài khoản KHÔNG huỷ được. Đóng modal chỉ unmount form — lô vẫn chạy tiếp và
    // banner bật ra sau đó, còn người dùng thì đã kịp mở lại và chạy chồng một lô thứ hai.
    vi.mocked(listUsers).mockResolvedValue([]);
    let release!: (v: { user_id: string; email: string; tenant_id: string; system_roles: string[] }) => void;
    vi.mocked(createUser).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderTab();
    await openBulk();
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "a@x.vn, A, hr" } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="password"]')!, {
      target: { value: "mat-khau-du-dai" },
    });

    const closeButton = screen.getByRole("button", { name: "Đóng" }) as HTMLButtonElement;
    const oneTab = screen.getByRole("button", { name: "Từng người" }) as HTMLButtonElement;
    expect(closeButton.disabled).toBe(false); // fixture bất đối xứng: trước khi chạy thì mở được

    fireEvent.click(screen.getByRole("button", { name: /Tạo 1 tài khoản/ }));

    await waitFor(() => expect(closeButton.disabled).toBe(true));
    expect(oneTab.disabled).toBe(true);

    release({ user_id: "u-1", email: "a@x.vn", tenant_id: "t-1", system_roles: ["hr"] });
    await screen.findByText(/Đã tạo 1\/1/);
  });

  it("dòng sai định dạng bị chặn TRƯỚC khi gọi API, không đi ra server", async () => {
    vi.mocked(listUsers).mockResolvedValue([]);
    renderTab();
    await openBulk();

    fireEvent.change(document.querySelector("textarea")!, {
      target: { value: "a@x.vn, A, engnieer" }, // phòng ban gõ sai
    });

    // Bảng xem trước nói rõ cái sai, và nút tạo bị khoá vì không còn dòng nào hợp lệ.
    expect(await screen.findByText(/phòng ban không có: engnieer/)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /Tạo 0 tài khoản/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(createUser).not.toHaveBeenCalled();
  });
});

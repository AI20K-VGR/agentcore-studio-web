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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SuperadminConsole from "./SuperadminConsole";
import {
  addCompanyAdmin,
  createCompany,
  deactivateCompanyUser,
  listCompanies,
  listCompanyUsers,
  reactivateCompanyUser,
  updateCompany,
} from "./api";
import { deleteSection, listSections } from "../admin/sectionsApi";
import type { CompanySummary } from "./api";

/** Khớp `AUTO_DISMISS_MS` trong `SuperadminConsole.tsx` — để lệch thì bài này đo sai cái nó tưởng. */
const AUTO_DISMISS_MS = 6000;
import type { Session } from "../auth/session";

vi.mock("./api", () => ({
  listCompanies: vi.fn(),
  listCompanyUsers: vi.fn(),
  createCompany: vi.fn(),
  addCompanyAdmin: vi.fn(),
  resetCompanyUserPassword: vi.fn(),
  updateCompany: vi.fn(),
  deactivateCompanyUser: vi.fn(),
  reactivateCompanyUser: vi.fn(),
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

describe("đặt mật khẩu hộ người khác", () => {
  it("form Thêm admin có ô xác nhận, và không khớp thì KHÔNG gọi API", async () => {
    // Bản đầu chỉ form "Tạo công ty mới" hỏi lại lần hai — cùng một màn hình, ba đường nhập mật
    // khẩu, hai luật khác nhau.
    vi.mocked(listCompanies).mockResolvedValue([company()]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([]);

    const { container } = renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "+ Thêm admin" }));
    // `PasswordInput` không nhận `placeholder` ở màn này, nên chọn theo `type` — hai ô mật khẩu
    // trong form Thêm admin chính là bằng chứng ô xác nhận tồn tại.
    const passwords = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    expect(passwords.length).toBe(2);

    fireEvent.change(screen.getByPlaceholderText("admin2@acme.com"), {
      target: { value: "moi@ankor.test" },
    });
    fireEvent.change(passwords[0], { target: { value: "mat-khau-dung" } });
    fireEvent.change(passwords[1], { target: { value: "mat-khau-sai" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm admin" }));

    await screen.findByText(/không khớp/);
    expect(addCompanyAdmin).not.toHaveBeenCalled();
  });
});

describe("vô hiệu hoá tài khoản công ty", () => {
  const activeUser = {
    user_id: "u-1",
    email: "nv@ankor.vn",
    system_roles: ["hr"],
    is_active: true,
    created_at: "2026-08-26T00:00:00+00:00",
  };

  it("huỷ ở bước hỏi lại thì KHÔNG gọi API", async () => {
    vi.mocked(listCompanies).mockResolvedValue([company()]);
    vi.mocked(listCompanyUsers).mockResolvedValue([activeUser]);
    vi.mocked(listSections).mockResolvedValue([]);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "Vô hiệu hoá" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(deactivateCompanyUser).not.toHaveBeenCalled();
  });

  it("kích hoạt lại KHÔNG hỏi — thao tác lành không nên dạy bấm qua theo phản xạ", async () => {
    vi.mocked(listCompanies).mockResolvedValue([company()]);
    vi.mocked(listCompanyUsers).mockResolvedValue([{ ...activeUser, is_active: false }]);
    vi.mocked(listSections).mockResolvedValue([]);
    vi.mocked(reactivateCompanyUser).mockResolvedValue({ ...activeUser, is_active: true });
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);

    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "Kích hoạt lại" }));
    await waitFor(() => expect(reactivateCompanyUser).toHaveBeenCalledWith("t-ankor", "u-1", session));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe("phản hồi trên màn hình (review web#31)", () => {
  it("thông báo THÀNH CÔNG tự tắt, thông báo LỖI thì không", async () => {
    // Bug gốc của issue: tạo công ty xong, dòng "Đã tạo công ty Ankor" nằm lại trên đầu trang cả
    // buổi, kể cả khi người dùng đã chuyển qua mười công ty khác. PR trước mô tả "tự tắt" nhưng
    // chỉ đổi vị trí — không `setTimeout` nào trong cả file.
    vi.useFakeTimers();
    try {
      vi.mocked(listCompanies).mockResolvedValue([company()]);
      vi.mocked(listCompanyUsers).mockResolvedValue([]);
      vi.mocked(listSections).mockResolvedValue([]);
      vi.mocked(createCompany).mockResolvedValue({ tenant_id: "t-moi", admin_email: "a@moi.test" });

      renderConsole();
      await vi.waitFor(() => expect(screen.getByRole("button", { name: "+ Tạo công ty" })).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "+ Tạo công ty" }));
      fireEvent.change(screen.getByPlaceholderText("vd: Acme Corp"), { target: { value: "Công ty mới" } });
      fireEvent.change(screen.getByPlaceholderText("admin@acme.com"), { target: { value: "a@moi.test" } });
      const passwords = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
      fireEvent.change(passwords[0], { target: { value: "mat-khau-du-dai" } });
      fireEvent.change(passwords[1], { target: { value: "mat-khau-du-dai" } });
      fireEvent.click(screen.getByRole("button", { name: "Tạo công ty" }));

      await vi.waitFor(() => expect(screen.getByText(/Đã tạo công ty/)).toBeInTheDocument());
      // `act` bọc bước tua giờ: `setBanner(null)` chạy từ callback của `setTimeout`, tức ngoài
      // vòng render của React — không bọc thì state đổi nhưng cây chưa vẽ lại khi assert chạy.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTO_DISMISS_MS + 1000);
      });
      expect(screen.queryByText(/Đã tạo công ty/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("thông báo LỖI ở lại — người đọc lỗi còn phải làm gì đó với nó", async () => {
    // Vế đối chứng của bài trên. Thiếu nó, một bản cài đặt cho MỌI thông báo tự tắt vẫn xanh, và
    // người vận hành sẽ mất câu lỗi trước khi kịp đọc xong.
    //
    // Bài này chỉ có nghĩa vì MỌI `Feedback` giờ đều nhận `onDismiss`. Bản đầu chỉ dải banner trên
    // cùng có, mà banner thì chỉ từng mang thông báo thành công — nên nhánh kiểm `tone` là code
    // chết, và mutant xoá nó sống sót. Đo bằng mutant mới thấy.
    vi.useFakeTimers();
    try {
      vi.mocked(listCompanies).mockResolvedValue([company()]);
      vi.mocked(listCompanyUsers).mockResolvedValue([]);
      vi.mocked(listSections).mockResolvedValue([]);
      vi.mocked(updateCompany).mockRejectedValue(new Error("công ty 'Ankor' đã tồn tại"));

      renderConsole();
      await vi.waitFor(() => expect(screen.getByRole("button", { name: "Đổi tên" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Đổi tên" }));
      fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

      await vi.waitFor(() => expect(screen.getByText(/đã tồn tại/)).toBeInTheDocument());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTO_DISMISS_MS + 1000);
      });
      expect(screen.getByText(/đã tồn tại/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("thông báo đổi tên công ty KHÔNG bị chính lượt tải lại xoá mất", async () => {
    // `handleRename` đặt note rồi gọi `onChanged()`; tải lại xong prop `company.name` đổi. Với
    // `company.name` nằm trong dependency của effect reset, note vừa hiện bị xoá trong vòng một
    // round-trip. Đổi tên là hành động duy nhất đổi `name`, nên cũng là hành động duy nhất tự xoá
    // phản hồi của chính nó — và trước bài này, luồng đổi tên không có bài test nào.
    vi.mocked(listCompanies)
      .mockResolvedValueOnce([company({ name: "Ankor Grroup" })])
      .mockResolvedValue([company({ name: "Ankor Group" })]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([]);
    vi.mocked(updateCompany).mockResolvedValue(company({ name: "Ankor Group" }));

    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "Đổi tên" }));
    const nameInput = document.querySelector<HTMLInputElement>('input[value="Ankor Grroup"]');
    expect(nameInput).not.toBeNull();
    fireEvent.change(nameInput!, { target: { value: "Ankor Group" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(updateCompany).toHaveBeenCalled());
    // Danh sách đã tải lại với tên mới — thông báo vẫn phải còn.
    await waitFor(() => expect(screen.getAllByText("Ankor Group").length).toBeGreaterThan(0));
    expect(screen.getByText(/Đã đổi tên/)).toBeInTheDocument();
  });

  it("Thêm admin với email rỗng thì KHÔNG gọi API — không để backend trả 422 dạng mảng", async () => {
    vi.mocked(listCompanies).mockResolvedValue([company()]);
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue([]);

    renderConsole();

    fireEvent.click(await screen.findByRole("button", { name: "+ Thêm admin" }));
    const passwords = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    fireEvent.change(passwords[0], { target: { value: "mat-khau-du-dai" } });
    fireEvent.change(passwords[1], { target: { value: "mat-khau-du-dai" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm admin" }));

    await screen.findByText(/Cần email/);
    expect(addCompanyAdmin).not.toHaveBeenCalled();
  });
});

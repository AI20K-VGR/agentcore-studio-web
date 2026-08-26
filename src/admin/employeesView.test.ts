/**
 * Luật hiển thị của tab Nhân viên. Trước web#30, `EmployeesTab`/`usersApi` không có bài test nào.
 */

import { describe, expect, it } from "vitest";
import {
  displayNameOf,
  employeeActionQuestion,
  filterEmployees,
  formatDate,
  lastLoginLabel,
  teamTotals,
} from "./employeesView";
import type { UserSummary } from "./usersApi";

function user(over: Partial<UserSummary> = {}): UserSummary {
  return {
    user_id: "u-1",
    email: "nv@ankor.vn",
    system_roles: ["hr"],
    is_active: true,
    created_at: "2026-08-26T02:49:40+00:00",
    display_name: null,
    last_login_at: null,
    ...over,
  };
}

describe("displayNameOf", () => {
  it("có tên thì dùng tên", () => {
    expect(displayNameOf(user({ display_name: "Nguyễn Thị Thu" }))).toBe("Nguyễn Thị Thu");
  });

  it("chưa có tên thì lùi về email, KHÔNG hiện ô trống", () => {
    // `display_name` cố ý cho phép rỗng (D3) — bắt buộc sẽ chặn đường tạo hàng loạt. Nên mọi chỗ
    // hiển thị phải tự lùi về email; email vẫn là một danh tính đọc được.
    expect(displayNameOf(user())).toBe("nv@ankor.vn");
  });

  it("tên toàn khoảng trắng cũng lùi về email", () => {
    expect(displayNameOf(user({ display_name: "   " }))).toBe("nv@ankor.vn");
  });
});

describe("filterEmployees", () => {
  // Email KHÔNG chứa tên và ngược lại — cố ý. Fixture đầu tôi đặt `thu@ankor.vn` + "Nguyễn Thị
  // Thu", nên bài "tìm theo tên" xanh cả khi hàm chỉ so email: mutant bỏ hẳn nhánh tên sống sót.
  const team = [
    user({ user_id: "a", email: "nv001@ankor.vn", display_name: "Nguyễn Thị Thu", system_roles: ["hr"] }),
    user({ user_id: "b", email: "nam@ankor.vn", display_name: "Trần Văn Nam", system_roles: ["finance"] }),
    user({ user_id: "c", email: "hoa@ankor.vn", system_roles: ["hr"], is_active: false }),
  ];

  it("truy vấn rỗng trả nguyên danh sách", () => {
    expect(filterEmployees(team, {})).toHaveLength(3);
  });

  it("tìm được theo TÊN — người quản lý nhớ 'Thu', không nhớ email", () => {
    expect(filterEmployees(team, { query: "thu" }).map((u) => u.user_id)).toEqual(["a"]);
  });

  it("tìm được theo EMAIL — ca dán nguyên địa chỉ từ chỗ khác", () => {
    // `nv001` chỉ có trong email, không có trong tên — vế đối xứng của bài trên.
    expect(filterEmployees(team, { query: "nv001" }).map((u) => u.user_id)).toEqual(["a"]);
  });

  it("cắt khoảng trắng hai đầu", () => {
    expect(filterEmployees(team, { query: "  nv001  " }).map((u) => u.user_id)).toEqual(["a"]);
  });

  it("lọc theo phòng ban", () => {
    expect(filterEmployees(team, { role: "hr" }).map((u) => u.user_id)).toEqual(["a", "c"]);
  });

  it("lọc theo trạng thái — người đã khoá không còn nằm lẫn trong danh sách", () => {
    expect(filterEmployees(team, { status: "active" }).map((u) => u.user_id)).toEqual(["a", "b"]);
    expect(filterEmployees(team, { status: "inactive" }).map((u) => u.user_id)).toEqual(["c"]);
  });

  it("ba bộ lọc chồng nhau", () => {
    expect(filterEmployees(team, { role: "hr", status: "active", query: "thu" }).map((u) => u.user_id)).toEqual(["a"]);
  });
});

describe("teamTotals", () => {
  it("đếm đúng bốn con số, trên số liệu bất đối xứng", () => {
    // Bất đối xứng có chủ ý: cộng nhầm cột thì fixture đối xứng vẫn xanh.
    const totals = teamTotals([
      user({ system_roles: ["admin", "hr"] }),
      user({ system_roles: ["hr"] }),
      user({ system_roles: ["admin"], is_active: false }),
    ]);
    expect(totals).toEqual({ total: 3, active: 2, inactive: 1, admins: 1 });
  });

  it("admin đã bị khoá KHÔNG tính là quản trị viên đang có", () => {
    // Cùng phép đếm mà backend dùng để chặn thu quyền admin cuối cùng — hai bên phải nói cùng một
    // con số, nếu không UI sẽ hiện "2 quản trị viên" trong khi server bảo chỉ còn 1.
    expect(teamTotals([user({ system_roles: ["admin"], is_active: false })]).admins).toBe(0);
  });

  it("danh sách rỗng ra toàn số 0", () => {
    expect(teamTotals([])).toEqual({ total: 0, active: 0, inactive: 0, admins: 0 });
  });
});

describe("lastLoginLabel", () => {
  const now = new Date("2026-08-26T10:00:00+00:00");

  it("`null` là CHƯA TỪNG đăng nhập, không phải 'lâu rồi'", () => {
    // Hai trạng thái dẫn tới hai hành động khác nhau: tài khoản vừa tạo chưa ai dùng (mật khẩu có
    // thể chưa tới tay họ) so với tài khoản bỏ hoang (ứng viên thu hồi lúc offboard). Gộp lại là
    // xoá mất chính thông tin mà cột này sinh ra để mang.
    expect(lastLoginLabel(null, now)).toBe("chưa đăng nhập lần nào");
  });

  it("hôm nay / hôm qua / n ngày / n tháng", () => {
    expect(lastLoginLabel("2026-08-26T08:00:00+00:00", now)).toBe("hôm nay");
    expect(lastLoginLabel("2026-08-25T08:00:00+00:00", now)).toBe("hôm qua");
    expect(lastLoginLabel("2026-08-16T08:00:00+00:00", now)).toBe("10 ngày trước");
    expect(lastLoginLabel("2026-05-26T08:00:00+00:00", now)).toBe("3 tháng trước");
  });

  it("chuỗi hỏng thì trả nguyên văn, không hiện 'Invalid Date'", () => {
    expect(lastLoginLabel("khong-phai-ngay", now)).toBe("khong-phai-ngay");
  });
});

describe("formatDate", () => {
  it("theo định dạng Việt, không phải định dạng Mỹ kèm giây", () => {
    // Bản trước dùng `toLocaleString()` không tham số nên in `8/26/2026, 9:49:40 AM` — định dạng
    // Mỹ, kèm giây, giữa một giao diện tiếng Việt.
    expect(formatDate("2026-08-26T02:49:40+00:00")).toBe("26/08/2026");
  });

  it("chuỗi hỏng thì trả nguyên văn", () => {
    expect(formatDate("khong-phai-ngay")).toBe("khong-phai-ngay");
  });
});

describe("employeeActionQuestion", () => {
  it("vô hiệu hoá phải hỏi, và nêu đích danh người bị ảnh hưởng", () => {
    const q = employeeActionQuestion({ kind: "deactivate", user: user({ display_name: "Thu" }) });
    expect(q).toContain("Thu");
  });

  it("nói rõ phiên đang mở cũng bị cắt", () => {
    // Hành vi thật của backend: `authz.fetch_fresh_identity` 403 ngay khi `is_active = false`.
    expect(employeeActionQuestion({ kind: "deactivate", user: user() })).toContain("đang mở");
  });

  it("vô hiệu hoá một QUẢN TRỊ VIÊN được gọi riêng", () => {
    // Ca thật: công ty có hai admin, admin này khoá được admin kia bằng một cú bấm.
    expect(employeeActionQuestion({ kind: "deactivate", user: user({ system_roles: ["admin"] }) })).toContain(
      "QUẢN TRỊ VIÊN",
    );
  });

  it("thu quyền quản trị phải hỏi", () => {
    expect(employeeActionQuestion({ kind: "revoke-admin", user: user({ display_name: "Nam" }) })).toContain("Nam");
  });

  it("kích hoạt lại và phong quyền KHÔNG hỏi — thao tác lành không dạy bấm qua theo phản xạ", () => {
    expect(employeeActionQuestion({ kind: "reactivate" })).toBeNull();
    expect(employeeActionQuestion({ kind: "grant-admin" })).toBeNull();
  });
});

/**
 * Luật hiển thị thuần của tab Nhân viên — tách khỏi `EmployeesTab.tsx` để test được mà không phải
 * dựng DOM hay backend, cùng khuôn `admin/documentsView.ts`.
 *
 * Năm hàm ở đây là năm chỗ trang này dễ nói sai nhất với người quản lý đội ngũ: ai đang hiện,
 * tổng cộng bao nhiêu, một người tên là gì, họ có còn dùng hệ thống không, và thao tác sắp bấm có
 * phá gì không.
 */

import type { UserSummary } from "./usersApi";

/** Tên hiển thị của một tài khoản: tên người nếu có, ngược lại là email.
 *
 * `display_name` cố ý cho phép rỗng (quyết định D3, app#76) — bắt buộc sẽ chặn đường tạo hàng loạt
 * và làm hỏng mọi tài khoản đã tồn tại. Nên chỗ nào hiển thị cũng phải tự lùi về email, và **không
 * bao giờ** hiện một ô trống hay chữ "(chưa đặt tên)": email vẫn là một danh tính đọc được. */
export function displayNameOf(user: Pick<UserSummary, "email" | "display_name">): string {
  return user.display_name?.trim() || user.email;
}

export type StatusFilter = "all" | "active" | "inactive";

/** Lọc danh sách theo ô tìm kiếm, phòng ban, và trạng thái.
 *
 * Tìm theo **cả** tên lẫn email: người quản lý nhớ "Thu" chứ không nhớ `nv.thu2@ankor.vn`, nhưng
 * cũng có lúc họ dán nguyên email từ chỗ khác. Cắt khoảng trắng hai đầu vì ca dán đó rất hay dính
 * dấu cách, và một danh sách rỗng khó hiểu là cách tệ nhất để trả lời. */
export function filterEmployees(
  users: readonly UserSummary[],
  options: { query?: string; role?: string | null; status?: StatusFilter } = {},
): UserSummary[] {
  const needle = (options.query ?? "").trim().toLowerCase();
  const role = options.role ?? null;
  const status = options.status ?? "all";
  return users.filter((u) => {
    if (status === "active" && !u.is_active) return false;
    if (status === "inactive" && u.is_active) return false;
    if (role !== null && !u.system_roles.includes(role)) return false;
    if (needle === "") return true;
    return u.email.toLowerCase().includes(needle) || displayNameOf(u).toLowerCase().includes(needle);
  });
}

/** Ba con số của dải Tổng quan. Đếm trên **toàn bộ** danh sách, không phải phần đang lọc — người
 * đọc cần biết đội ngũ thật có bao nhiêu, còn bộ lọc là việc của khung nhìn. */
export function teamTotals(users: readonly UserSummary[]): {
  total: number;
  active: number;
  inactive: number;
  admins: number;
} {
  const active = users.filter((u) => u.is_active).length;
  return {
    total: users.length,
    active,
    inactive: users.length - active,
    admins: users.filter((u) => u.is_active && u.system_roles.includes("admin")).length,
  };
}

/** Câu mô tả lần đăng nhập gần nhất.
 *
 * `null` KHÔNG phải "lâu rồi" — nó là **chưa từng đăng nhập**, và hai trạng thái đó dẫn tới hai
 * hành động khác nhau: một tài khoản vừa tạo chưa ai dùng (có thể mật khẩu chưa tới tay họ) so với
 * một tài khoản bỏ hoang (ứng viên thu hồi lúc offboard). Gộp chúng lại là xoá mất chính thông tin
 * mà cột này sinh ra để mang. */
export function lastLoginLabel(lastLoginAt: string | null | undefined, now: Date = new Date()): string {
  if (!lastLoginAt) return "chưa đăng nhập lần nào";
  const then = new Date(lastLoginAt);
  if (Number.isNaN(then.getTime())) return lastLoginAt;
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} tháng trước` : `hơn ${Math.floor(months / 12)} năm trước`;
}

/** Ngày tháng theo định dạng Việt.
 *
 * Bản trước dùng `toLocaleString()` không tham số, nên nó lấy locale trình duyệt và in
 * `8/26/2026, 9:49:40 AM` — định dạng Mỹ, kèm giây, nằm giữa một giao diện tiếng Việt. Ở đây giờ
 * phút giây không mang thông tin nào người quản lý dùng tới. */
export function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Câu hỏi lại trước một thao tác không tự đảo ngược bằng một cú bấm. `null` = không cần hỏi.
 *
 * Kích hoạt lại và phong quyền KHÔNG hỏi: hỏi ở thao tác lành dạy người dùng bấm "Đồng ý" theo
 * phản xạ, rồi đúng lúc câu hỏi thật sự quan trọng họ cũng bấm qua mà không đọc. */
export function employeeActionQuestion(
  action:
    | { kind: "deactivate"; user: UserSummary }
    | { kind: "reactivate" }
    | { kind: "grant-admin" }
    | { kind: "revoke-admin"; user: UserSummary },
): string | null {
  if (action.kind === "reactivate" || action.kind === "grant-admin") return null;
  if (action.kind === "revoke-admin") {
    return `Thu quyền quản trị của ${displayNameOf(action.user)}? Họ sẽ không quản được tài khoản nào nữa.`;
  }
  const isAdmin = action.user.system_roles.includes("admin");
  return (
    `Vô hiệu hoá ${isAdmin ? "QUẢN TRỊ VIÊN" : "tài khoản"} ${displayNameOf(action.user)}? ` +
    "Họ mất quyền đăng nhập ngay, và phiên đang mở cũng bị cắt."
  );
}

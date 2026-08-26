/**
 * Luật hiển thị thuần của trang superadmin — tách khỏi `SuperadminConsole.tsx` để test được mà
 * không phải dựng DOM hay backend, cùng khuôn `admin/documentsView.ts`.
 *
 * Bốn hàm ở đây là bốn chỗ trang này dễ nói sai nhất với người vận hành: công ty nào đang hiện,
 * tổng cộng bao nhiêu, thao tác vừa rồi có phá huỷ gì không, và lỗi từ server đọc ra thành câu gì.
 */

import type { CompanySummary } from "./api";

/** Lọc danh sách công ty theo ô tìm kiếm.
 *
 * So khớp không phân biệt hoa/thường và cắt khoảng trắng hai đầu: người vận hành gõ "ankor" phải
 * ra "Ankor Group", và dán tên từ chỗ khác (thường dính khoảng trắng) không được ra danh sách rỗng
 * một cách khó hiểu. Truy vấn rỗng trả NGUYÊN danh sách — không phải mảng rỗng. */
export function filterCompanies(companies: readonly CompanySummary[], query: string): CompanySummary[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...companies];
  return companies.filter((c) => c.name.toLowerCase().includes(needle));
}

/** Ba con số của thẻ Tổng quan.
 *
 * Cộng từ danh sách đã tải sẵn thay vì gọi thêm endpoint thống kê — `GET /api/admin/companies` đã
 * trả `user_count`/`section_count` trên mỗi dòng (quyết định D4, app#75), nên một round-trip là đủ
 * cho cả trang. Đếm CẢ công ty đang tạm khoá: người vận hành cần biết tổng thật, còn trạng thái
 * từng công ty đã hiện ngay trên dòng của nó. */
export function platformTotals(companies: readonly CompanySummary[]): {
  companies: number;
  users: number;
  sections: number;
  suspended: number;
} {
  return {
    companies: companies.length,
    users: companies.reduce((sum, c) => sum + c.user_count, 0),
    sections: companies.reduce((sum, c) => sum + c.section_count, 0),
    suspended: companies.filter((c) => !c.is_active).length,
  };
}

/** Câu hỏi lại trước một thao tác không tự đảo ngược được bằng một cú bấm.
 *
 * Trả `null` nghĩa là KHÔNG cần hỏi. Mở lại một công ty đang tạm khoá là thao tác lành — hỏi lại ở
 * đó chỉ dạy người dùng bấm "Đồng ý" theo phản xạ, và đúng lúc câu hỏi thật sự quan trọng (tạm
 * khoá cả công ty, xoá phòng ban) họ sẽ bấm qua mà không đọc. */
export function confirmMessage(
  action: { kind: "suspend-company"; companyName: string; userCount: number } | { kind: "activate-company" } | {
    kind: "delete-section";
    sectionName: string;
  },
): string | null {
  if (action.kind === "activate-company") return null;
  if (action.kind === "suspend-company") {
    return (
      `Tạm khoá công ty "${action.companyName}"? ${action.userCount} tài khoản sẽ không đăng nhập được, ` +
      "và phiên đang mở của họ cũng bị cắt ngay."
    );
  }
  return `Xoá phòng ban "${action.sectionName}"? Thao tác này không hoàn tác được.`;
}

/** Đọc lỗi từ server thành câu tiếng Việt.
 *
 * `httpUtil.readJsonOrThrow` `JSON.stringify` khi `detail` của FastAPI là object (vd 409 lúc xoá
 * phòng ban còn người dùng: `{"message": ..., "user_count": 3}`) — hợp lý ở tầng chung, nhưng đổ
 * nguyên khối JSON vào mặt người vận hành thì không đọc được. Bóc `message` ra ở đây, KHÔNG sửa
 * `httpUtil` (các call-site khác đang dựa vào hành vi hiện tại của nó). */
export function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return raw;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof (parsed as { message?: unknown }).message === "string") {
      return (parsed as { message: string }).message;
    }
  } catch {
    // Không phải JSON hợp lệ — trả nguyên văn còn hơn nuốt mất thông tin duy nhất đang có.
  }
  return raw;
}

/** Luật mật khẩu dùng chung cho cả **ba** chỗ superadmin đặt mật khẩu hộ người khác: tạo công ty,
 * thêm admin, đặt lại mật khẩu. Trả `null` khi hợp lệ.
 *
 * Gom về một hàm vì bản đầu chỉ có form tạo công ty hỏi lại lần hai, còn hai chỗ kia thì không —
 * cùng một màn hình, ba đường nhập mật khẩu, hai luật khác nhau. Và ở đây gõ nhầm không phải lỗi
 * của người gõ chịu: superadmin gõ mật khẩu **hộ người khác** rồi nhắn cho họ, nên một ký tự sai
 * biến thành "tài khoản mới không đăng nhập được" mà không ai biết sai ở đâu. */
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Mật khẩu phải từ 8 ký tự trở lên.";
  if (password !== confirmation) return "Mật khẩu xác nhận không khớp.";
  return null;
}

/** Câu hỏi lại trước khi vô hiệu hoá một tài khoản của công ty.
 *
 * Nêu đích danh email chứ không hỏi chung chung: danh sách tài khoản không có gì phân biệt hàng
 * này với hàng kia ngoài email, nên "Bạn có chắc không?" là câu người dùng không kiểm lại được.
 * Người đang giữ quyền `admin` được nói riêng — mất một admin khác hẳn mất một nhân viên. */
export function deactivateUserQuestion(email: string, systemRoles: readonly string[]): string {
  const isAdmin = systemRoles.includes("admin");
  return (
    `Vô hiệu hoá ${isAdmin ? "QUẢN TRỊ VIÊN" : "tài khoản"} ${email}? ` +
    "Họ mất quyền đăng nhập ngay, và phiên đang mở cũng bị cắt."
  );
}

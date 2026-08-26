/**
 * Phân tích danh sách nhân viên dán vào ô nhập — luật thuần, tách khỏi component (web#30 mục 3.4).
 *
 * Onboarding 15 người bằng form đơn là điền form 15 lần. Nhưng thứ quyết định tính năng này dùng
 * được hay không **không** phải bước tạo, mà là bước **đọc lại cho người dùng xem trước khi tạo**:
 * dán một danh sách rồi bấm là gửi đi 15 lệnh ghi không hoàn tác được, nên họ phải thấy dòng nào sẽ
 * vào và dòng nào hỏng — trước khi bấm, không phải sau.
 */

/** Một dòng đã phân tích. `error !== null` nghĩa là dòng này **không** được gửi đi. */
export interface ParsedRow {
  /** Số dòng trong ô nhập (1-based) — người dùng sửa theo số này, không theo chỉ số mảng. */
  line: number;
  raw: string;
  email: string;
  displayName: string;
  roles: string[];
  error: string | null;
}

const SEPARATOR = /[,\t;]/;

/** Đọc danh sách dán vào: mỗi dòng `email, tên, phòng ban[, phòng ban...]`.
 *
 * Nhận cả dấu phẩy, tab và chấm phẩy làm dấu tách — dán từ Excel/Sheets ra tab, từ CSV ra phẩy, và
 * danh sách gõ tay thì lẫn lộn. Bắt người dùng chuẩn hoá trước khi dán là bắt họ làm việc mà máy
 * làm được.
 *
 * Dòng trống và dòng mở đầu bằng `#` bỏ qua **im lặng** — dán từ file có chú thích là chuyện
 * thường, và báo lỗi cho một dòng trống là tiếng ồn.
 *
 * `availableRoles` để bắt phòng ban gõ sai NGAY LÚC XEM TRƯỚC. Không có bước này, sai chính tả chỉ
 * lộ ra thành lỗi 400 rời rạc sau khi vài tài khoản đầu đã tạo xong — người dùng phải dọn một mớ
 * nửa vời.
 */
export function parseBulkRows(text: string, availableRoles: readonly string[]): ParsedRow[] {
  const known = new Set(availableRoles);
  const seenEmails = new Set<string>();
  const rows: ParsedRow[] = [];

  text.split("\n").forEach((raw, index) => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;

    const cells = trimmed.split(SEPARATOR).map((c) => c.trim());
    const [email = "", displayName = "", ...roleCells] = cells;
    const roles = roleCells.filter((r) => r !== "");
    const row: ParsedRow = { line: index + 1, raw: trimmed, email, displayName, roles, error: null };

    if (email === "") {
      row.error = "thiếu email";
    } else if (!email.includes("@")) {
      // Kiểm tối thiểu, CỐ Ý không dựng regex email đầy đủ: server mới là nơi phán quyết, và một
      // regex quá tay ở đây sẽ chặn nhầm địa chỉ hợp lệ mà người dùng không hiểu vì sao.
      row.error = `email không hợp lệ: ${email}`;
    } else if (seenEmails.has(email.toLowerCase())) {
      // Trùng NGAY TRONG danh sách dán — bắt ở đây thay vì để server trả 409 cho dòng thứ hai, vì
      // ở đây nói được "lặp lại trong danh sách" còn server chỉ biết "email đã tồn tại".
      row.error = "email lặp lại trong danh sách";
    } else if (roles.length === 0) {
      row.error = "thiếu phòng ban";
    } else {
      const unknown = roles.filter((r) => !known.has(r));
      if (unknown.length > 0) row.error = `phòng ban không có: ${unknown.join(", ")}`;
    }

    if (row.error === null) seenEmails.add(email.toLowerCase());
    rows.push(row);
  });

  return rows;
}

/** Tách thành hai nhóm — dòng gửi được và dòng hỏng. */
export function splitRows(rows: readonly ParsedRow[]): { ready: ParsedRow[]; broken: ParsedRow[] } {
  return { ready: rows.filter((r) => r.error === null), broken: rows.filter((r) => r.error !== null) };
}

/** Kết quả một dòng SAU khi đã gọi API. */
export interface BulkOutcome {
  line: number;
  email: string;
  status: "created" | "failed";
  detail: string | null;
  /** Tài khoản tạo được nhưng bước đặt `display_name` hỏng.
   *
   * Tách khỏi `status` một cách CÓ CHỦ Ý: dòng này vẫn là "đã tạo" — tài khoản đăng nhập được, đổi
   * nó thành `failed` sẽ khiến người dùng đi tạo lại và đâm vào lỗi trùng email. Nhưng im lặng thì
   * họ không bao giờ biết tên chưa lưu, vì bảng vẫn hiện ra một dòng trông bình thường. */
  nameFailed: boolean;
}

/** Câu tổng kết sau khi chạy xong.
 *
 * Nói **cả hai** con số kể cả khi một trong hai bằng 0: "đã tạo 12" một mình không cho người đọc
 * biết họ đã dán 12 dòng hay 15. Và nêu **đích danh** dòng hỏng — một lô 15 dòng mà chỉ báo "3 dòng
 * lỗi" là bắt họ tự dò lại từ đầu. */
export function bulkSummary(outcomes: readonly BulkOutcome[], skipped: readonly ParsedRow[]): string {
  const created = outcomes.filter((o) => o.status === "created").length;
  const failed = outcomes.filter((o) => o.status === "failed");
  const parts = [`Đã tạo ${created}/${outcomes.length + skipped.length} tài khoản.`];
  if (failed.length > 0) {
    parts.push(`${failed.length} dòng lỗi: ${failed.map((f) => `dòng ${f.line} (${f.email})`).join(", ")}.`);
  }
  const nameless = outcomes.filter((o) => o.status === "created" && o.nameFailed);
  if (nameless.length > 0) {
    parts.push(
      `${nameless.length} dòng tạo được nhưng chưa đặt được tên (${nameless
        .map((o) => `dòng ${o.line}`)
        .join(", ")}) — sửa lại ở panel Chi tiết.`,
    );
  }
  if (skipped.length > 0) parts.push(`${skipped.length} dòng bỏ qua vì sai định dạng.`);
  return parts.join(" ");
}

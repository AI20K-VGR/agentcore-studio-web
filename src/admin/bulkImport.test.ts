/**
 * Luật đọc danh sách dán vào (web#30 mục 3.4).
 *
 * Phần đáng canh nhất không phải "đọc đúng dòng hợp lệ" mà là **đọc đúng dòng hỏng**: bảng xem
 * trước là thứ duy nhất đứng giữa một cú dán và 15 lệnh ghi không hoàn tác được.
 */

import { describe, expect, it } from "vitest";
import { bulkSummary, parseBulkRows, splitRows, type BulkOutcome, type ParsedRow } from "./bulkImport";

const ROLES = ["hr", "finance"];

describe("parseBulkRows — dòng hợp lệ", () => {
  it("đọc email, tên, phòng ban", () => {
    const [row] = parseBulkRows("thu@ankor.vn, Nguyễn Thị Thu, hr", ROLES);
    expect(row).toMatchObject({ email: "thu@ankor.vn", displayName: "Nguyễn Thị Thu", roles: ["hr"], error: null });
  });

  it("nhận nhiều phòng ban trên một dòng", () => {
    expect(parseBulkRows("a@x.vn, A, hr, finance", ROLES)[0].roles).toEqual(["hr", "finance"]);
  });

  it("nhận cả tab và chấm phẩy làm dấu tách — dán từ Excel ra tab, từ CSV ra phẩy", () => {
    expect(parseBulkRows("a@x.vn\tA\thr", ROLES)[0].error).toBeNull();
    expect(parseBulkRows("b@x.vn; B; finance", ROLES)[0].error).toBeNull();
  });

  it("tên để trống vẫn hợp lệ — display_name là tuỳ chọn (D3, app#76)", () => {
    const [row] = parseBulkRows("a@x.vn, , hr", ROLES);
    expect(row.error).toBeNull();
    expect(row.displayName).toBe("");
  });

  it("bỏ qua IM LẶNG dòng trống và dòng chú thích", () => {
    // Báo lỗi cho một dòng trống là tiếng ồn, và dán từ file có chú thích là chuyện thường.
    const rows = parseBulkRows("# danh sách phòng nhân sự\n\na@x.vn, A, hr\n\n", ROLES);
    expect(rows).toHaveLength(1);
  });

  it("giữ SỐ DÒNG thật, không phải chỉ số mảng", () => {
    // Người dùng sửa theo số dòng trong ô nhập của họ. Nếu báo "dòng 1" cho thứ nằm ở dòng 3 thì
    // bảng xem trước còn hại hơn không có.
    const rows = parseBulkRows("# chú thích\n\nsai\na@x.vn, A, hr", ROLES);
    expect(rows.map((r) => r.line)).toEqual([3, 4]);
  });
});

describe("parseBulkRows — dòng hỏng", () => {
  it("thiếu email", () => {
    expect(parseBulkRows(", A, hr", ROLES)[0].error).toBe("thiếu email");
  });

  it("email không có @", () => {
    expect(parseBulkRows("khong-phai-email, A, hr", ROLES)[0].error).toMatch(/không hợp lệ/);
  });

  it("thiếu phòng ban", () => {
    expect(parseBulkRows("a@x.vn, A", ROLES)[0].error).toBe("thiếu phòng ban");
  });

  it("phòng ban gõ sai bị bắt NGAY lúc xem trước, và nêu đích danh cái sai", () => {
    // Không có bước này, sai chính tả chỉ lộ ra thành 400 rời rạc sau khi vài tài khoản đầu đã
    // tạo xong — người dùng phải dọn một mớ nửa vời.
    const [row] = parseBulkRows("a@x.vn, A, engnieer", ROLES);
    expect(row.error).toBe("phòng ban không có: engnieer");
  });

  it("email lặp lại TRONG danh sách dán — dòng sau hỏng, dòng đầu vẫn tốt", () => {
    // Bắt ở đây thay vì để server trả 409 cho dòng thứ hai: ở đây nói được "lặp lại trong danh
    // sách", server chỉ biết "email đã tồn tại".
    const rows = parseBulkRows("a@x.vn, A, hr\na@x.vn, A lần hai, finance", ROLES);
    expect(rows[0].error).toBeNull();
    expect(rows[1].error).toBe("email lặp lại trong danh sách");
  });

  it("trùng không phân biệt hoa thường", () => {
    const rows = parseBulkRows("a@x.vn, A, hr\nA@X.VN, A hoa, hr", ROLES);
    expect(rows[1].error).toMatch(/lặp lại/);
  });

  it("dòng hỏng KHÔNG chiếm chỗ email — dòng sau dùng lại email đó vẫn hợp lệ", () => {
    // Dòng đầu hỏng vì thiếu phòng ban nên nó không được gửi đi; email của nó chưa bị dùng.
    const rows = parseBulkRows("a@x.vn, A\na@x.vn, A, hr", ROLES);
    expect(rows[0].error).toBe("thiếu phòng ban");
    expect(rows[1].error).toBeNull();
  });
});

describe("splitRows", () => {
  it("tách đúng hai nhóm", () => {
    const rows = parseBulkRows("a@x.vn, A, hr\nsai\nb@x.vn, B, finance", ROLES);
    const { ready, broken } = splitRows(rows);
    expect(ready.map((r) => r.email)).toEqual(["a@x.vn", "b@x.vn"]);
    expect(broken).toHaveLength(1);
  });
});

describe("bulkSummary", () => {
  function outcome(over: Partial<BulkOutcome> = {}): BulkOutcome {
    return { line: 1, email: "a@x.vn", status: "created", detail: null, ...over };
  }

  it("nói CẢ mẫu số, không chỉ số tạo được", () => {
    // "Đã tạo 12" một mình không cho người đọc biết họ đã dán 12 dòng hay 15.
    const text = bulkSummary([outcome(), outcome({ line: 2, email: "b@x.vn" })], []);
    expect(text).toContain("2/2");
  });

  it("nêu ĐÍCH DANH dòng lỗi, không chỉ đếm", () => {
    // Một lô 15 dòng mà chỉ báo "3 dòng lỗi" là bắt người dùng tự dò lại từ đầu.
    const text = bulkSummary(
      [outcome(), outcome({ line: 7, email: "trung@x.vn", status: "failed", detail: "đã tồn tại" })],
      [],
    );
    expect(text).toContain("dòng 7");
    expect(text).toContain("trung@x.vn");
  });

  it("đếm cả dòng bị bỏ qua vào mẫu số", () => {
    const skipped = [{ line: 3, raw: "sai", email: "", displayName: "", roles: [], error: "thiếu email" }] as ParsedRow[];
    const text = bulkSummary([outcome()], skipped);
    expect(text).toContain("1/2");
    expect(text).toContain("bỏ qua");
  });

  it("lô sạch thì không bịa ra phần lỗi", () => {
    const text = bulkSummary([outcome()], []);
    expect(text).not.toMatch(/lỗi|bỏ qua/);
  });
});

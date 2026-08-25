/**
 * Luật hiển thị của trang superadmin. Trước web#29, cả thư mục `src/superadmin/` không có bài test
 * nào — trong khi `src/admin/` có bốn file.
 */

import { describe, expect, it } from "vitest";
import { confirmMessage, filterCompanies, platformTotals, readableError } from "./companiesView";
import type { CompanySummary } from "./api";

function company(name: string, over: Partial<CompanySummary> = {}): CompanySummary {
  return {
    tenant_id: `id-${name}`,
    name,
    created_at: "2026-08-26T00:00:00+00:00",
    is_active: true,
    user_count: 1,
    section_count: 1,
    ...over,
  };
}

describe("filterCompanies", () => {
  it("truy vấn rỗng trả nguyên danh sách, không phải mảng rỗng", () => {
    const all = [company("Ankor"), company("Borea")];
    expect(filterCompanies(all, "").map((c) => c.name)).toEqual(["Ankor", "Borea"]);
  });

  it("không phân biệt hoa thường", () => {
    expect(filterCompanies([company("Ankor Group"), company("Borea")], "ANKOR").map((c) => c.name)).toEqual([
      "Ankor Group",
    ]);
  });

  it("cắt khoảng trắng hai đầu — dán tên từ chỗ khác không ra danh sách rỗng khó hiểu", () => {
    expect(filterCompanies([company("Ankor")], "  ankor  ").map((c) => c.name)).toEqual(["Ankor"]);
  });

  it("không khớp thì trả rỗng", () => {
    expect(filterCompanies([company("Ankor")], "zzz")).toEqual([]);
  });

  it("không sửa mảng gốc", () => {
    const all = [company("Ankor")];
    filterCompanies(all, "").push(company("Cắm thêm"));
    expect(all).toHaveLength(1);
  });
});

describe("platformTotals", () => {
  it("cộng đúng ba con số của thẻ Tổng quan", () => {
    // Số liệu BẤT ĐỐI XỨNG có chủ ý: nếu hàm cộng nhầm cột (user lấy sang section), fixture đối
    // xứng sẽ vẫn xanh.
    const totals = platformTotals([
      company("Ankor", { user_count: 3, section_count: 2 }),
      company("Borea", { user_count: 8, section_count: 5 }),
    ]);
    expect(totals).toEqual({ companies: 2, users: 11, sections: 7, suspended: 0 });
  });

  it("đếm cả công ty đang tạm khoá vào tổng, và đếm riêng số bị khoá", () => {
    const totals = platformTotals([
      company("Ankor", { user_count: 3, section_count: 2 }),
      company("Đã khoá", { is_active: false, user_count: 4, section_count: 1 }),
    ]);
    expect(totals.companies).toBe(2);
    expect(totals.users).toBe(7);
    expect(totals.suspended).toBe(1);
  });

  it("danh sách rỗng ra toàn số 0, không phải NaN", () => {
    expect(platformTotals([])).toEqual({ companies: 0, users: 0, sections: 0, suspended: 0 });
  });
});

describe("confirmMessage", () => {
  it("tạm khoá công ty phải hỏi lại, và nói rõ bao nhiêu người mất quyền truy cập", () => {
    const message = confirmMessage({ kind: "suspend-company", companyName: "Ankor", userCount: 3 });
    expect(message).toContain("Ankor");
    expect(message).toContain("3");
  });

  it("nói rõ phiên ĐANG MỞ cũng bị cắt — không chỉ lần đăng nhập sau", () => {
    // Đây là hành vi thật của backend (tạm khoá chặn ở `authz.fetch_fresh_identity`, quyết định
    // D2 app#75). Câu hỏi lại mà chỉ nói "không đăng nhập được" sẽ khiến người vận hành tưởng
    // người đang online vẫn dùng tiếp được tới hết phiên.
    expect(confirmMessage({ kind: "suspend-company", companyName: "Ankor", userCount: 1 })).toContain("đang mở");
  });

  it("mở lại công ty KHÔNG hỏi — hỏi ở thao tác lành sẽ dạy người dùng bấm qua mà không đọc", () => {
    expect(confirmMessage({ kind: "activate-company" })).toBeNull();
  });

  it("xoá phòng ban phải hỏi lại", () => {
    expect(confirmMessage({ kind: "delete-section", sectionName: "hr" })).toContain("hr");
  });
});

describe("readableError", () => {
  it("bóc `message` khỏi detail dạng object — 409 xoá phòng ban còn người dùng", () => {
    // Chuỗi này là thứ `httpUtil.readJsonOrThrow` thật sự ném ra: nó `JSON.stringify` khi `detail`
    // của FastAPI là object. Trước web#29, đúng khối JSON này hiện thẳng lên màn hình.
    const err = new Error(JSON.stringify({ message: "còn 3 user đang gắn role 'hr' — gỡ role trước khi xoá", user_count: 3 }));
    expect(readableError(err)).toBe("còn 3 user đang gắn role 'hr' — gỡ role trước khi xoá");
  });

  it("giữ nguyên lỗi vốn đã là câu chữ", () => {
    expect(readableError(new Error("công ty 'Ankor' đã tồn tại"))).toBe("công ty 'Ankor' đã tồn tại");
  });

  it("JSON hỏng thì trả nguyên văn, không nuốt mất thông tin duy nhất đang có", () => {
    expect(readableError(new Error('{"message": hỏng'))).toBe('{"message": hỏng');
  });

  it("object không có `message` thì trả nguyên văn", () => {
    expect(readableError(new Error('{"user_count": 3}'))).toBe('{"user_count": 3}');
  });

  it("nhận cả thứ không phải Error", () => {
    expect(readableError("mất mạng")).toBe("mất mạng");
  });
});

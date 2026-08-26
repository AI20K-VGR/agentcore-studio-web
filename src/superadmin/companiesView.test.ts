/**
 * Luật hiển thị của trang superadmin. Trước web#29, cả thư mục `src/superadmin/` không có bài test
 * nào — trong khi `src/admin/` có bốn file.
 */

import { describe, expect, it } from "vitest";
import {
  confirmMessage,
  deactivateUserQuestion,
  filterCompanies,
  passwordProblem,
  platformTotals,
  readableError,
} from "./companiesView";
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

describe("passwordProblem", () => {
  it("dưới 8 ký tự bị chặn", () => {
    expect(passwordProblem("ngan", "ngan")).toContain("8 ký tự");
  });

  it("đủ dài nhưng xác nhận không khớp thì bị chặn", () => {
    // Đây là ca bản đầu bỏ sót ở hai trong ba chỗ nhập mật khẩu: superadmin gõ mật khẩu HỘ người
    // khác rồi nhắn cho họ, nên một ký tự sai thành "tài khoản mới không đăng nhập được", và người
    // chịu hậu quả không phải người gõ.
    expect(passwordProblem("mat-khau-dung", "mat-khau-sai")).toContain("không khớp");
  });

  it("khớp và đủ dài thì không có vấn đề gì", () => {
    expect(passwordProblem("mat-khau-du-dai", "mat-khau-du-dai")).toBeNull();
  });

  it("cả hai cùng rỗng vẫn bị chặn vì quá ngắn — không phải 'khớp là xong'", () => {
    expect(passwordProblem("", "")).not.toBeNull();
  });

  it("kiểm độ dài TRƯỚC khi kiểm khớp — báo đúng lỗi gần nhất người dùng sửa được", () => {
    expect(passwordProblem("abc", "xyz")).toContain("8 ký tự");
  });
});

describe("deactivateUserQuestion", () => {
  it("nêu đích danh email — danh sách không có gì phân biệt hàng này với hàng kia", () => {
    expect(deactivateUserQuestion("nv@ankor.vn", ["hr"])).toContain("nv@ankor.vn");
  });

  it("nói rõ phiên đang mở cũng bị cắt, không chỉ chặn đăng nhập sau", () => {
    // Hành vi thật của backend: `authz.fetch_fresh_identity` 403 ngay khi `is_active = false`.
    expect(deactivateUserQuestion("nv@ankor.vn", ["hr"])).toContain("đang mở");
  });

  it("người giữ quyền admin được gọi riêng — mất một admin khác hẳn mất một nhân viên", () => {
    expect(deactivateUserQuestion("boss@ankor.vn", ["admin"])).toContain("QUẢN TRỊ VIÊN");
    expect(deactivateUserQuestion("nv@ankor.vn", ["hr"])).not.toContain("QUẢN TRỊ VIÊN");
  });
});

describe("readableError — lỗi validation 422 (review web#31)", () => {
  it("bóc `msg` khỏi `detail` dạng MẢNG của Pydantic, kèm tên trường", () => {
    // Chuỗi này là thứ `httpUtil.readJsonOrThrow` thật sự ném khi FastAPI trả 422: `detail` là
    // MẢNG, không phải object. Bản đầu chỉ nhận chuỗi bắt đầu bằng `{` nên mọi 422 đi thẳng ra
    // màn hình dưới dạng JSON thô — đúng thứ hàm này sinh ra để chặn.
    const err = new Error(
      JSON.stringify([{ type: "missing", loc: ["body", "email"], msg: "Field required" }]),
    );
    expect(readableError(err)).toBe("email: Field required");
  });

  it("nhiều lỗi thì nối lại, không chỉ lấy cái đầu", () => {
    const err = new Error(
      JSON.stringify([
        { type: "missing", loc: ["body", "email"], msg: "Field required" },
        { type: "too_short", loc: ["body", "password"], msg: "String should have at least 8 characters" },
      ]),
    );
    expect(readableError(err)).toContain("email");
    expect(readableError(err)).toContain("password");
  });

  it("mảng không có `msg` thì trả nguyên văn, không nuốt mất thông tin", () => {
    expect(readableError(new Error('[{"type":"missing"}]'))).toBe('[{"type":"missing"}]');
  });

  it("mảng rỗng cũng trả nguyên văn", () => {
    expect(readableError(new Error("[]"))).toBe("[]");
  });
});

/**
 * Client `usersApi` — đường thành công và đường lỗi cho 4 endpoint mới của app#83 (issue web#30
 * mục 3.5).
 *
 * Test ở tầng `fetch` chứ không dựng DOM: thứ dễ sai nhất ở đây là **hình dạng request** — sai
 * method, sai path, hay gửi field mà server không có — và không bài UI nào nhìn thấy chúng.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { grantAdmin, resetEmployeePassword, revokeAdmin, updateUser } from "./usersApi";
import { StudioApiError } from "../httpUtil";
import type { Session } from "../auth/session";

const session: Session = {
  accessToken: "test-token",
  tenantId: "t-1",
  tenantName: "Ankor",
  user: "boss@ankor.vn",
  systemRoles: ["admin"],
  mustChangePassword: false,
};

function mockFetch(response: { status: number; body?: unknown }) {
  const spy = vi.fn().mockResolvedValue({
    ok: response.status < 400,
    status: response.status,
    json: async () => response.body ?? {},
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resetEmployeePassword", () => {
  it("POST đúng path, gửi `new_password`, 204 không có body vẫn là thành công", async () => {
    const spy = mockFetch({ status: 204 });
    await resetEmployeePassword("u-1", "mat-khau-moi", session);

    const [url, init] = spy.mock.calls[0];
    expect(url).toContain("/api/admin/users/u-1/reset-password");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ new_password: "mat-khau-moi" });
  });

  it("400 (tự đặt lại mật khẩu mình) nổi lên thành StudioApiError đọc được", async () => {
    // Server chặn ca này — xem `reset_employee_password`. Client phải để câu đó tới người dùng
    // nguyên vẹn chứ không nuốt thành lỗi chung.
    mockFetch({ status: 400, body: { detail: "Không thể tự đặt lại mật khẩu của chính mình" } });
    await expect(resetEmployeePassword("u-self", "mat-khau-moi", session)).rejects.toThrow(
      /tự đặt lại mật khẩu của chính mình/,
    );
  });
});

describe("updateUser", () => {
  it("chỉ gửi field được truyền — không đụng field không khai", async () => {
    // `None` phía server = "không đụng tới", khác hẳn "đặt về rỗng". Nếu client gửi thừa
    // `system_roles: undefined` thành `null`, server sẽ hiểu sai thành một lệnh ghi.
    const spy = mockFetch({ status: 200, body: {} });
    await updateUser("u-1", { displayName: "Thu" }, session);

    expect(JSON.parse(spy.mock.calls[0][1].body)).toEqual({ display_name: "Thu" });
  });

  it("chuỗi rỗng CÓ được gửi — đó là lệnh xoá tên, không phải 'không đụng'", async () => {
    const spy = mockFetch({ status: 200, body: {} });
    await updateUser("u-1", { displayName: "" }, session);

    expect(JSON.parse(spy.mock.calls[0][1].body)).toEqual({ display_name: "" });
  });

  it("409 email trùng nổi lên nguyên câu", async () => {
    mockFetch({ status: 409, body: { detail: "email 'a@b.test' đã tồn tại" } });
    await expect(updateUser("u-1", { email: "a@b.test" }, session)).rejects.toBeInstanceOf(StudioApiError);
  });
});

describe("grantAdmin / revokeAdmin", () => {
  it("gọi đúng hai path khác nhau", async () => {
    const grantSpy = mockFetch({ status: 200, body: {} });
    await grantAdmin("u-1", session);
    expect(grantSpy.mock.calls[0][0]).toContain("/api/admin/users/u-1/grant-admin");

    const revokeSpy = mockFetch({ status: 200, body: {} });
    await revokeAdmin("u-1", session);
    expect(revokeSpy.mock.calls[0][0]).toContain("/api/admin/users/u-1/revoke-admin");
  });

  it("409 'admin cuối cùng' nổi lên nguyên câu để người dùng biết phải làm gì", async () => {
    mockFetch({ status: 409, body: { detail: "Phong cho người khác trước." } });
    await expect(revokeAdmin("u-1", session)).rejects.toThrow(/Phong cho người khác trước/);
  });

  it("mất mạng thành gợi ý sửa, không phải TypeError trần", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(grantAdmin("u-1", session)).rejects.toThrow(/apps\/studio/);
  });
});

/**
 * Test cho `loadSession()`'s migration của session cũ lưu trong `localStorage` từ trước rename
 * `roles` -> `systemRoles` (review web#22, DongAnh2704 — đo được crash thật, không phải giả
 * thuyết): mọi user đã đăng nhập trước khi bản rename này deploy sẽ có `roles` trong storage,
 * không phải `systemRoles`, và sẽ crash ngay ở `resolveRole()`/`ChatPage`'s admin gate nếu
 * `loadSession()` trả thẳng object đó không migrate.
 */

import { afterEach, describe, expect, it } from "vitest";
import { loadSession } from "./session";

const STORAGE_KEY = "agentcore-studio-session";

afterEach(() => {
  localStorage.clear();
});

describe("loadSession", () => {
  it("returns null when nothing is stored", () => {
    expect(loadSession()).toBeNull();
  });

  it("returns null and clears storage on malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");

    expect(loadSession()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("passes a current-shape session through unchanged", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accessToken: "t",
        tenantId: "tenant-1",
        tenantName: "Ankor",
        user: "admin@ankor.vn",
        systemRoles: ["admin"],
      }),
    );

    expect(loadSession()?.systemRoles).toEqual(["admin"]);
  });

  it("migrates a pre-rename session's legacy `roles` into `systemRoles`", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accessToken: "t",
        tenantId: "tenant-1",
        tenantName: "Ankor",
        user: "admin@ankor.vn",
        roles: ["admin", "hr"],
      }),
    );

    expect(loadSession()?.systemRoles).toEqual(["admin", "hr"]);
  });

  it("defaults to an empty array when neither systemRoles nor roles is present", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken: "t", tenantId: "tenant-1", tenantName: "Ankor", user: "admin@ankor.vn" }),
    );

    expect(loadSession()?.systemRoles).toEqual([]);
  });
});

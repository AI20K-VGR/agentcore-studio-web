/**
 * Test cho `checkToolConnectivity()` — nút Test đổi hẳn sang connectivity-check tĩnh (web#18,
 * theo `PROJECT-SCOPE-DEMO-DAY30.md` mục D). Route mới `POST /api/runs` không còn chạy
 * `interpreter.run()`/trả `run_id` — chỉ xác nhận từng tool trong `tool_whitelist` có
 * executor/dispatcher thật không.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { checkToolConnectivity } from "./api";
import { StudioApiError } from "../httpUtil";
import type { Session } from "../auth/session";

const session: Session = {
  accessToken: "test-token",
  tenantId: "t1",
  tenantName: "Test Tenant",
  user: "admin@ankor.vn",
  systemRoles: ["admin"],
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkToolConnectivity", () => {
  it("POST đúng body {agent_id, tool_whitelist} kèm Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ agent_id: "a1", results: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await checkToolConnectivity("a1", ["kb_search", "calculator"], session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8000/api/runs");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body as string)).toEqual({
      agent_id: "a1",
      tool_whitelist: ["kb_search", "calculator"],
    });
  });

  it("parse đúng response {agent_id, results: [{tool, status}]}", async () => {
    const payload = {
      agent_id: "a1",
      results: [
        { tool: "kb_search", status: "OK" },
        { tool: "calculator", status: "NOT_IMPLEMENTED" },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));

    const result = await checkToolConnectivity("a1", ["kb_search", "calculator"], session);

    expect(result).toEqual(payload);
  });

  it("lỗi HTTP → StudioApiError với message từ detail", async () => {
    // `mockImplementation` (không phải `mockResolvedValue`) — mỗi lần gọi phải tạo `Response`
    // MỚI, vì body của `Response` chỉ đọc (`.json()`) được đúng 1 lần.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        jsonResponse({ detail: "not admin" }, { status: 403, statusText: "Forbidden" }),
      ),
    );

    await expect(checkToolConnectivity("a1", [], session)).rejects.toThrow(StudioApiError);
    await expect(checkToolConnectivity("a1", [], session)).rejects.toThrow("not admin");
  });

  it("fetch throw (network down) → StudioApiError với networkErrorHint()", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(checkToolConnectivity("a1", [], session)).rejects.toThrow(StudioApiError);
    await expect(checkToolConnectivity("a1", [], session)).rejects.toThrow(/apps\/studio/);
  });
});

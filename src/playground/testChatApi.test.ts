/**
 * Test cho `sendTestChatMessage()` — nút Test, chat thật trên draft (`routes/test_chat.py`).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTestChatMessage } from "./testChatApi";
import { StudioApiError } from "../httpUtil";
import type { Session } from "../auth/session";
import type { WireRecipe } from "../recipe/contract";

const session: Session = {
  accessToken: "test-token",
  tenantId: "t1",
  tenantName: "Test Tenant",
  user: "admin@ankor.vn",
  systemRoles: ["admin"],
  mustChangePassword: false,
};

const recipe: WireRecipe = {
  agent_id: "a1",
  tenant_id: "00000000-0000-0000-0000-000000000001",
  agent_config: {
    system_prompt: "Trả lời dựa trên tài liệu nội bộ.",
    model: "gpt-4o-mini",
    tool_whitelist: ["calculator"],
    temperature: 0.5,
  },
  dag: {
    nodes: [
      { id: "n1", type: "kb-retrieve", params: {} },
      { id: "n2", type: "llm-step", params: { temperature: 0.5 } },
      { id: "n4", type: "end", params: {} },
    ],
    edges: [
      { from: "n1", to: "n2", when: null },
      { from: "n2", to: "n4", when: null },
    ],
  },
  kb_binding: { kb_id: "kb-callisto-v1", scope: "ankor/public" },
  golden_set_ref: "callisto-2.0-golden-30-v1",
  scorecard_threshold: { success: 0.8, citation_accuracy: 0.8 },
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

describe("sendTestChatMessage", () => {
  it("POST đúng URL + body kèm Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ answer: "ok", citations: [], refused: false, run_id: "r1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendTestChatMessage(recipe, "câu hỏi tự nghĩ?", session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8000/api/agents/a1/test-chat");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body as string)).toEqual({
      agent_id: "a1",
      system_prompt: "Trả lời dựa trên tài liệu nội bộ.",
      tool_whitelist: ["calculator"],
      nodes: recipe.dag.nodes,
      edges: recipe.dag.edges,
      temperature: 0.5,
      message: "câu hỏi tự nghĩ?",
    });
  });

  it("parse đúng response {answer, citations, refused, run_id}", async () => {
    const payload = { answer: "Cần báo trước 3 ngày.", citations: ["c1"], refused: false, run_id: "r1" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));

    const result = await sendTestChatMessage(recipe, "q?", session);

    expect(result).toEqual(payload);
  });

  it("lỗi HTTP → StudioApiError với message từ detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        jsonResponse({ detail: "recipe không qua graph_lint()" }, { status: 400, statusText: "Bad Request" }),
      ),
    );

    await expect(sendTestChatMessage(recipe, "q?", session)).rejects.toThrow(StudioApiError);
    await expect(sendTestChatMessage(recipe, "q?", session)).rejects.toThrow("recipe không qua graph_lint()");
  });

  it("fetch throw (network down) → StudioApiError với networkErrorHint()", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(sendTestChatMessage(recipe, "q?", session)).rejects.toThrow(StudioApiError);
    await expect(sendTestChatMessage(recipe, "q?", session)).rejects.toThrow(/apps\/studio/);
  });
});

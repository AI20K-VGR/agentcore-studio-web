/**
 * Client gọi `POST /api/agents/{agent_id}/test-chat` (`routes/test_chat.py`) — nút Test, chat THẬT
 * trên recipe DRAFT (canvas, CHƯA publish). Tách biệt tuyệt đối với `chat/api.ts::sendChatMessage`
 * (agent ĐÃ publish, `routes/chat.py`) — không dùng chung hàm/type nào giữa 2 file.
 *
 * Body gửi lên cùng hình dạng `PublishRequest`/`_evaluate` dùng để dựng recipe động (bớt
 * `golden_set_ref`, không cần cho route này), thêm `message` — cùng khuôn `flattenRecipe()`
 * (`studio/api.ts`) dùng cho `/evaluate`/`/publish`.
 */

import type { WireRecipe } from "../recipe/contract";
import { authHeader, type Session } from "../auth/session";
import { StudioApiError, networkErrorHint, readJsonOrThrow, studioBaseUrl } from "../httpUtil";

export interface TestChatResponse {
  answer: string;
  citations: string[];
  refused: boolean;
  run_id: string;
}

export async function sendTestChatMessage(
  recipe: WireRecipe,
  message: string,
  session: Session,
): Promise<TestChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/agents/${encodeURIComponent(recipe.agent_id)}/test-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({
        agent_id: recipe.agent_id,
        system_prompt: recipe.agent_config.system_prompt,
        tool_whitelist: recipe.agent_config.tool_whitelist,
        nodes: recipe.dag.nodes,
        edges: recipe.dag.edges,
        message,
      }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as TestChatResponse;
}

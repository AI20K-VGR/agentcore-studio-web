/**
 * Test Mode (web#35) — canvas thay hẳn `TestAgentModal.tsx` (modal full-screen che mất canvas)
 * bằng 1 chế độ của chính canvas: 2 node giả `user_query`/`response` (KHÔNG phải `NodeType` thật,
 * không bao giờ gửi lên backend — thuần render layer, xem `TestModeNodes.tsx`) bọc quanh chuỗi
 * node thật, rồi PHÁT LẠI (replay) đúng thứ tự `WireTraceEvent` đã nhận được từ 1 lần chạy đã
 * XONG HẲN — `sendTestChatMessage()`/`fetchTrace()` chỉ trả lời sau khi backend chạy hết, không có
 * streaming, nên đây luôn là phát lại, không phải xem engine chạy real-time.
 *
 * Test-chat không có bộ nhớ nhiều lượt (mỗi `message` là 1 request độc lập, không kèm lịch sử) —
 * lịch sử hội thoại thật là kit#240, việc riêng, không thuộc phạm vi này. Vì vậy mỗi lượt hỏi ở
 * đây THAY nội dung 2 node giả + phát lại từ đầu, không cộng dồn.
 *
 * ## `testEvents` KHÔNG đi theo `chainOrder` (phát hiện lúc verify thủ công, web#35 review)
 * `routes/test_chat.py` gọi thẳng `agent_loop.run_agent_loop()` — theo đúng docstring của chính
 * module đó (`packages/engine/src/studio_engine/agent_loop.py`): *"This REPLACES DAG-walk...
 * never reads the recipe's DAG field at all"*. `kb_search` LUÔN có sẵn cho LLM tự quyết định gọi
 * hay không (bao nhiêu lần), KHÔNG bị gate bởi việc canvas có node `kb-retrieve` hay không (A4).
 * Event cho `kb-retrieve`/`tool-call` mang `node_id` TỰ SINH (`t{i}-kb-search`, `t{i}-tool-{tool}`)
 * — không bao giờ trùng id node thật trên canvas ("n1"...). So `event.node_id === realNode.id`
 * (cách làm ban đầu) nên LUÔN false với 2 loại này — khớp bằng `node_type` (+ tên tool tách từ
 * chính `node_id` cho `tool-call`) là cách đúng duy nhất hiện có phía client.
 *
 * ## Cạnh hub-spoke KHÔNG phải bằng chứng thứ tự gọi thật
 * Từ workbench#48 (web#34), canvas là 1 HÌNH SAO thật (`agentTopologyLint`, `recipe/graphLint.ts`):
 * đúng 1 `llm-step` làm tâm, 0-1 `kb-retrieve` + 0..N `tool-call` làm cánh, mỗi cánh nối trực tiếp
 * tâm — không còn chuỗi thẳng, không còn thứ tự hình học nào để suy ra thứ tự gọi thật cả. Dù vậy
 * `run_agent_loop()` vẫn không đọc `recipe.dag` (xem trên) — số cánh + tên tool trên canvas chỉ là
 * HIỂN THỊ những gì CÓ THỂ được gọi, `tool_whitelist` mới là nguồn thật quyết định LLM được gọi
 * tool nào, gọi bao nhiêu lần, theo thứ tự nào. Trace hiện ra ở 1 cạnh chỉ nên đọc là "2 phía đã
 * tạo/nhận gì", không phải 1 quan hệ nhân-quả hay thứ tự thật.
 */
import type { Node as FlowNode } from "reactflow";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CanvasNodeData } from "../recipe/fromCanvas";
import type { WireTraceEvent } from "../playground/api";

/** Id 2 node giả — hằng số dùng chung `App.tsx`/`TestModeNodes.tsx` thay vì rải literal string ở
 * nhiều nơi (review PR#37: cũng là chỗ 1 bài test khoá được bất biến "2 node này không bao giờ
 * lọt vào `nodes` state thật" — `nodesForFrame()`/`fromCanvas.test.ts` lọc theo `parentId`, node
 * giả không bao giờ được gán `parentId` nên không thể lọt qua bộ lọc đó dù có mặt trong `nodes`). */
export const TEST_QUERY_NODE_ID = "__test_query__";
export const TEST_RESPONSE_NODE_ID = "__test_response__";

/** Id của node `llm-step` — tâm hình sao, nơi neo 2 cạnh giả `user_query`/`response` (`App.tsx`).
 * `agentTopologyLint` (`dag.exactly_one_llm_node`) đảm bảo LUÔN đúng 1 node loại này trong 1 khung
 * hợp lệ; `createFrame()` cũng tự sinh nó lúc "Tạo agent" nên trên thực tế không bao giờ `null`
 * — vẫn trả `| null` thay vì ném lỗi vì khung có thể đang ở trạng thái tạm thời không hợp lệ (lúc
 * đó nút "Chạy thử" đã khoá rồi, xem `violation`). */
export function findLlmHubId(nodes: FlowNode<CanvasNodeData>[]): string | null {
  return nodes.find((node) => node.data.type === "llm-step")?.id ?? null;
}

const TOOL_EVENT_ID_RE = /^t\d+-tool-(.+)$/;

/** Node THẬT trên canvas mà 1 event tương ứng — khớp theo `node_type` (`llm-step`/`kb-retrieve`
 * luôn chỉ có ≤1 node thật mỗi loại trong 1 khung nên khớp type là đủ); `tool-call` khớp thêm
 * đúng tên tool (tách từ `event.node_id`, dạng `t{i}-tool-{tool}` — xem `agent_loop.py`) với
 * `node.data.params.tool` của node thật, phòng khung có nhiều node `tool-call` cho nhiều tool
 * khác nhau. Trả `null` nếu không có node thật nào khớp — KHÔNG đoán bừa node `tool-call` đầu
 * tiên tìm thấy (bug thật, review PR#37: gán sai — node cấu hình `kb_search` bị gán nhầm output
 * của `send_email`, popover nói dối "node này tạo ra Y" trong khi nó tạo ra X). Không cần fallback
 * "chỉ có đúng 1 node chưa khai tool": `agentTopologyLint` luật `dag.tool_call_has_non_blank_tool`
 * (`recipe/graphLint.ts`, workbench#48) đã bắt buộc MỌI node `tool-call` phải có `params.tool`
 * không rỗng trước khi recipe qua được lint — nút "Chạy thử" khoá hẳn khi còn vi phạm
 * (`disabled={violation !== null}`, `App.tsx`), nên tới được Test Mode nghĩa là case "node chưa
 * khai tool" không thể xảy ra — không có gì để đoán cả, `null` (LLM gọi tool ngoài canvas, hợp lệ
 * — `tool_whitelist` là nguồn thật) là câu trả lời trung thực duy nhất. */
export function matchEventToNodeId(event: WireTraceEvent, nodes: FlowNode<CanvasNodeData>[]): string | null {
  if (event.node_type === "tool-call") {
    const toolName = TOOL_EVENT_ID_RE.exec(event.node_id)?.[1];
    return nodes.find((n) => n.data.type === "tool-call" && n.data.params["tool"] === toolName)?.id ?? null;
  }
  return nodes.find((n) => n.data.type === event.node_type)?.id ?? null;
}

/** Với mỗi node thật, danh sách vị trí (index trong `events`) mà nó được khớp tới — 1 node có
 * thể khớp NHIỀU event (vd LLM gọi `kb_search` 2 lần trong 1 lượt chạy). */
export function buildNodeEventIndex(
  events: WireTraceEvent[],
  nodes: FlowNode<CanvasNodeData>[],
): Map<string, number[]> {
  const index = new Map<string, number[]>();
  events.forEach((event, position) => {
    const nodeId = matchEventToNodeId(event, nodes);
    if (!nodeId) return;
    const existing = index.get(nodeId);
    if (existing) existing.push(position);
    else index.set(nodeId, [position]);
  });
  return index;
}

export type ReplayStatus = "idle" | "playing" | "done";

/** Trạng thái highlight của 1 node thật, theo tiến độ phát lại hiện tại — `matchedPositions` là
 * `buildNodeEventIndex(...).get(node.id)`. Lúc `status === "done"`, MỌI event khớp đều là "done"
 * (không còn "active" nào — lượt chạy đã xong hẳn); lúc đang `"playing"`, "active" nếu `index`
 * hiện tại nằm trong danh sách khớp, "done" nếu node đã có ít nhất 1 event khớp Ở TRƯỚC `index`
 * (dù event MỚI NHẤT khớp nó là ở tương lai — vẫn tính đã "chạm" rồi). */
export function highlightForNode(
  matchedPositions: number[] | undefined,
  status: ReplayStatus,
  index: number,
): "active" | "done" | undefined {
  if (!matchedPositions || matchedPositions.length === 0 || status === "idle") return undefined;
  if (status === "done") return "done";
  if (matchedPositions.includes(index)) return "active";
  if (matchedPositions.some((position) => position < index)) return "done";
  return undefined;
}

const STEP_MS = 1100;

/** Điều khiển phát lại 1 danh sách event đã có sẵn (không phải live) — mỗi tick tiến 1 event.
 * `reset()` khi đổi sang 1 lượt chạy mới (events mới) để không lẫn hoạt ảnh của lượt trước.
 *
 * KHÔNG có `pause` (bỏ theo phản hồi: xem trace giờ bấm CẠNH được bất kỳ lúc nào — đang phát, đã
 * xong, hay chưa chạy gì — nên tạm dừng animation không mở khoá thêm gì cả, chỉ là 1 nút thừa).
 * `play()` luôn phát lại TỪ ĐẦU (không phải "tiếp tục" — không có khái niệm tạm dừng để tiếp tục
 * nữa), dùng được cả lúc `status === "done"` để xem lại. */
export function useTestReplay(events: WireTraceEvent[] | null) {
  const [status, setStatus] = useState<ReplayStatus>("idle");
  const [index, setIndex] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const reset = useCallback(
    (autoplay: boolean) => {
      clearTimer();
      setIndex(-1);
      setStatus(autoplay ? "playing" : "idle");
    },
    [clearTimer],
  );

  const play = useCallback(() => {
    if (!events || events.length === 0) return;
    clearTimer();
    setIndex(-1);
    setStatus("playing");
  }, [events, clearTimer]);

  useEffect(() => {
    if (status !== "playing" || !events) {
      clearTimer();
      return;
    }
    timerRef.current = setInterval(() => {
      setIndex((current) => {
        const nextIndex = current + 1;
        if (nextIndex >= events.length) {
          setStatus("done");
          clearTimer();
          return current;
        }
        return nextIndex;
      });
    }, STEP_MS);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, events]);

  return { status, index, play, reset };
}

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
 * ## Cạnh nối 2+ node `tool-call` KHÔNG phải bằng chứng thứ tự gọi thật
 * `graph_lint` luật 3/4 (đúng 1 start node, ≤1 outgoing edge/node — kit#206, giữ chặn) buộc canvas
 * chỉ vẽ được 1 CHUỖI THẲNG — muốn có 2 node `tool-call` cùng lúc, chúng buộc phải nối tiếp nhau
 * (`llm-step → tool-call-A → tool-call-B`), dù thật ra `run_agent_loop()` không hề gọi theo đúng
 * thứ tự/số lần đó (có thể gọi B trước, gọi A 2 lần, hay không gọi B). Cạnh A→B trên canvas là
 * ẢNH HƯỞNG CỦA LUẬT VẼ (chỉ để hợp lệ graph_lint), không phải quả quyết "A tạo ra B" — trace hiện
 * ra ở 1 cạnh chỉ nên đọc là "2 phía đã tạo/nhận gì", không phải 1 quan hệ nhân-quả thật.
 */
import type { Edge as FlowEdge, Node as FlowNode } from "reactflow";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CanvasEdgeData, CanvasNodeData } from "../recipe/fromCanvas";
import type { WireTraceEvent } from "../playground/api";

/** Thứ tự node thật từ start (không incoming edge) tới end (không outgoing edge) — CHỈ dùng để
 * biết đặt cạnh giả `user_query`/`response` vào đâu (đầu/cuối chuỗi hình học trên canvas), KHÔNG
 * còn dùng để suy ra thứ tự event thật nữa (xem docstring module — `run_agent_loop()` không đi
 * theo cạnh nào cả). An toàn về mặt hình học vì `graph_lint` luật 3/4 đã đảm bảo đúng 1 start +
 * ≤1 outgoing edge mỗi node. Trả `[]` nếu khung chưa có node thật nào. */
export function walkChain(
  nodes: FlowNode<CanvasNodeData>[],
  edges: FlowEdge<CanvasEdgeData>[],
): string[] {
  if (nodes.length === 0) return [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nextById = new Map<string, string>();
  const hasIncoming = new Set<string>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    nextById.set(edge.source, edge.target);
    hasIncoming.add(edge.target);
  }
  const startId = nodes.find((node) => !hasIncoming.has(node.id))?.id;
  if (!startId) return [];
  const order: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = startId;
  while (current && !seen.has(current)) {
    order.push(current);
    seen.add(current);
    current = nextById.get(current);
  }
  return order;
}

const TOOL_EVENT_ID_RE = /^t\d+-tool-(.+)$/;

/** Node THẬT trên canvas mà 1 event tương ứng — khớp theo `node_type` (`llm-step`/`kb-retrieve`
 * luôn chỉ có ≤1 node thật mỗi loại trong 1 khung nên khớp type là đủ); `tool-call` khớp thêm
 * đúng tên tool (tách từ `event.node_id`, dạng `t{i}-tool-{tool}` — xem `agent_loop.py`) với
 * `node.data.params.tool` của node thật, phòng khung có nhiều node `tool-call` cho nhiều tool
 * khác nhau. Trả `null` nếu không có node thật nào khớp (vd LLM gọi 1 tool không có mặt trên
 * canvas — hợp lệ, `tool_whitelist` là nguồn thật, canvas chỉ là hiển thị). */
export function matchEventToNodeId(event: WireTraceEvent, nodes: FlowNode<CanvasNodeData>[]): string | null {
  if (event.node_type === "tool-call") {
    const toolName = TOOL_EVENT_ID_RE.exec(event.node_id)?.[1];
    const exact = nodes.find((n) => n.data.type === "tool-call" && n.data.params["tool"] === toolName);
    if (exact) return exact.id;
    return nodes.find((n) => n.data.type === "tool-call")?.id ?? null;
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

/** Tóm tắt ngắn cho badge trên cạnh — lấy thẳng từ `outputs` của 1 `WireTraceEvent`, không bịa
 * thêm field nào ngoài những gì `interpreter.py`/`agent_loop.py` đã ghi thật. */
export function edgeBadgeFromEvent(event: WireTraceEvent): string {
  if (event.node_type === "kb-retrieve") {
    const chunks = event.outputs["chunks"];
    const count = Array.isArray(chunks) ? chunks.length : 0;
    return count === 0 ? "0 chunk" : `${count} chunk${count > 1 ? "s" : ""}`;
  }
  if (event.node_type === "llm-step") {
    const citations = event.citations;
    if (!citations || citations.length === 0) return "0 trích dẫn";
    return `cited: ${citations.join(", ")}`;
  }
  return "✓ xong";
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
 * KHÔNG có `pause` (bỏ theo phản hồi: xem trace giờ bấm được ở cổng VÀO/RA bất kỳ lúc nào —
 * đang phát, đã xong, hay chưa chạy gì — nên tạm dừng animation không mở khoá thêm gì cả, chỉ là
 * 1 nút thừa). `play()` luôn phát lại TỪ ĐẦU (không phải "tiếp tục" — không có khái niệm tạm dừng
 * để tiếp tục nữa), dùng được cả lúc `status === "done"` để xem lại. */
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

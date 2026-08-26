/**
 * Test cho các hàm thuần của Test Mode (web#35/PR#37 review) — `matchEventToNodeId` đặc biệt quan
 * trọng: đây chính là hàm từng gán SAI node thật lúc build (fallback "đoán bừa node tool-call đầu
 * tiên" khi không khớp tên tool) — sửa rồi nhưng KHÔNG có test nào khoá lại là một bug được phép
 * xảy ra lần nữa (review PR#37, dholmes0207). File này khoá đúng ca đó + `buildNodeEventIndex`
 * (1 node khớp nhiều event) + `findLlmHubId`.
 */
import { describe, expect, it } from "vitest";
import type { Node as FlowNode } from "reactflow";
import type { CanvasNodeData } from "../recipe/fromCanvas";
import type { WireTraceEvent } from "../playground/api";
import { buildNodeEventIndex, findLlmHubId, matchEventToNodeId } from "./testMode";

function node(id: string, type: CanvasNodeData["type"], params: Record<string, unknown> = {}): FlowNode<CanvasNodeData> {
  return { id, type: "recipeNode", position: { x: 0, y: 0 }, data: { type, params } };
}

function event(overrides: Partial<WireTraceEvent> & Pick<WireTraceEvent, "node_id" | "node_type">): WireTraceEvent {
  return {
    event_id: "e1",
    run_id: "r1",
    agent_id: "a1",
    tenant_id: "t1",
    ts: "2026-01-01T00:00:00Z",
    inputs_hash: "hash",
    outputs: {},
    tokens: { prompt: 0, completion: 0 },
    cost: 0,
    citations: null,
    ...overrides,
  };
}

describe("matchEventToNodeId", () => {
  it("khớp llm-step theo node_type", () => {
    const nodes = [node("n1", "llm-step")];
    expect(matchEventToNodeId(event({ node_id: "t0-llm", node_type: "llm-step" }), nodes)).toBe("n1");
  });

  it("khớp kb-retrieve theo node_type", () => {
    const nodes = [node("n1", "llm-step"), node("n2", "kb-retrieve")];
    expect(matchEventToNodeId(event({ node_id: "t0-kb-search", node_type: "kb-retrieve" }), nodes)).toBe("n2");
  });

  it("tool-call: khớp đúng node có params.tool trùng tên tool tách từ node_id", () => {
    const nodes = [
      node("n1", "llm-step"),
      node("n2", "tool-call", { tool: "kb_search" }),
      node("n3", "tool-call", { tool: "send_email" }),
    ];
    expect(matchEventToNodeId(event({ node_id: "t2-tool-send_email", node_type: "tool-call" }), nodes)).toBe("n3");
    expect(matchEventToNodeId(event({ node_id: "t1-tool-kb_search", node_type: "tool-call" }), nodes)).toBe("n2");
  });

  it("tool-call: LLM gọi tool KHÔNG có node nào trên canvas → null, KHÔNG đoán bừa node khác", () => {
    // Ca thật gây bug lúc build: canvas chỉ có node cấu hình "kb_search", LLM lại gọi "send_email"
    // (hợp lệ — tool_whitelist là nguồn thật, canvas chỉ hiển thị 1 phần). Bản cũ rơi vào fallback
    // "lấy node tool-call đầu tiên tìm thấy" → gán nhầm output của send_email cho node kb_search.
    const nodes = [node("n1", "llm-step"), node("n2", "tool-call", { tool: "kb_search" })];
    expect(matchEventToNodeId(event({ node_id: "t2-tool-send_email", node_type: "tool-call" }), nodes)).toBeNull();
  });

  it("tool-call: không có node tool-call nào trên canvas → null", () => {
    const nodes = [node("n1", "llm-step")];
    expect(matchEventToNodeId(event({ node_id: "t0-tool-calculator", node_type: "tool-call" }), nodes)).toBeNull();
  });
});

describe("buildNodeEventIndex", () => {
  it("1 node khớp nhiều event (LLM gọi kb_search 2 lần trong 1 lượt chạy)", () => {
    const nodes = [node("n1", "llm-step"), node("n2", "kb-retrieve")];
    const events = [
      event({ node_id: "t0-kb-search", node_type: "kb-retrieve" }),
      event({ node_id: "t1-llm", node_type: "llm-step" }),
      event({ node_id: "t2-kb-search", node_type: "kb-retrieve" }),
      event({ node_id: "t3-llm", node_type: "llm-step" }),
    ];
    const index = buildNodeEventIndex(events, nodes);
    expect(index.get("n2")).toEqual([0, 2]);
    expect(index.get("n1")).toEqual([1, 3]);
  });

  it("event không khớp node nào (tool ngoài canvas) không xuất hiện trong index", () => {
    const nodes = [node("n1", "llm-step")];
    const events = [
      event({ node_id: "t0-tool-send_email", node_type: "tool-call" }),
      event({ node_id: "t1-llm", node_type: "llm-step" }),
    ];
    const index = buildNodeEventIndex(events, nodes);
    expect(index.size).toBe(1);
    expect(index.get("n1")).toEqual([1]);
  });
});

describe("findLlmHubId", () => {
  it("tìm đúng id node llm-step", () => {
    const nodes = [node("n1", "kb-retrieve"), node("n2", "llm-step")];
    expect(findLlmHubId(nodes)).toBe("n2");
  });

  it("không có node llm-step nào → null", () => {
    expect(findLlmHubId([node("n1", "kb-retrieve")])).toBeNull();
  });
});

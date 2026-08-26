/**
 * Test cho `buildRecipe()` — đặc biệt `readTemperature()` nội bộ: `temperature` sống ở node
 * `llm-step` (không phải `RecipeHeader`), phải được đọc đúng vào `agent_config.temperature` khi
 * dựng `WireRecipe` gửi lên server (bug đã đóng — trước bản vá này field này chưa từng được gửi).
 */

import { describe, expect, it } from "vitest";
import type { Node as FlowNode } from "reactflow";
import { buildRecipe, nodesForFrame, type CanvasNodeData } from "./fromCanvas";
import { DEFAULT_HEADER } from "./sample";
import { TEST_QUERY_NODE_ID, TEST_RESPONSE_NODE_ID } from "../canvas/testMode";

function node(id: string, type: CanvasNodeData["type"], params: Record<string, unknown>): FlowNode<CanvasNodeData> {
  return { id, type: "recipeNode", position: { x: 0, y: 0 }, data: { type, params } };
}

describe("buildRecipe — temperature", () => {
  it("đọc temperature từ node llm-step vào agent_config.temperature", () => {
    const nodes = [
      node("n1", "kb-retrieve", {}),
      node("n2", "llm-step", { temperature: 1.2 }),
      node("n3", "end", {}),
    ];
    const recipe = buildRecipe(DEFAULT_HEADER, nodes, []);
    expect(recipe.agent_config.temperature).toBe(1.2);
  });

  it("thiếu node llm-step → fallback 0.7 (khớp default AgentConfig.temperature backend)", () => {
    const nodes = [node("n1", "kb-retrieve", {}), node("n3", "end", {})];
    const recipe = buildRecipe(DEFAULT_HEADER, nodes, []);
    expect(recipe.agent_config.temperature).toBe(0.7);
  });

  it("temperature không phải số (giá trị hỏng) → fallback 0.7", () => {
    const nodes = [node("n2", "llm-step", { temperature: "not-a-number" })];
    const recipe = buildRecipe(DEFAULT_HEADER, nodes, []);
    expect(recipe.agent_config.temperature).toBe(0.7);
  });
});

describe("buildRecipe — tool_whitelist suy từ node tool-call trên canvas", () => {
  // web#40: agent_loop.py đọc agent_config.tool_whitelist (không đọc recipe.dag) để quyết định
  // LLM được gọi tool nào — suy đúng từ node tool-call thật trên canvas là bất biến quan trọng
  // nhất của fix này (1 agent chỉ vẽ node "calculator" thì KHÔNG được tự nhiên có "current_datetime").
  it("1 node tool-call chọn calculator → whitelist chỉ có calculator", () => {
    const nodes = [node("n1", "llm-step", {}), node("n2", "tool-call", { tool: "calculator" })];
    const recipe = buildRecipe(DEFAULT_HEADER, nodes, []);
    expect(recipe.agent_config.tool_whitelist).toEqual(["calculator"]);
  });

  it("2 node tool-call khác tool → whitelist có cả 2, đúng thứ tự xuất hiện", () => {
    const nodes = [
      node("n1", "llm-step", {}),
      node("n2", "tool-call", { tool: "current_datetime" }),
      node("n3", "tool-call", { tool: "calculator" }),
    ];
    const recipe = buildRecipe(DEFAULT_HEADER, nodes, []);
    expect(recipe.agent_config.tool_whitelist).toEqual(["current_datetime", "calculator"]);
  });

  it("2 node tool-call CÙNG 1 tool → dedupe, không nhân đôi", () => {
    const nodes = [
      node("n1", "llm-step", {}),
      node("n2", "tool-call", { tool: "calculator" }),
      node("n3", "tool-call", { tool: "calculator" }),
    ];
    const recipe = buildRecipe(DEFAULT_HEADER, nodes, []);
    expect(recipe.agent_config.tool_whitelist).toEqual(["calculator"]);
  });

  it("không có node tool-call nào → whitelist rỗng", () => {
    const nodes = [node("n1", "llm-step", {})];
    const recipe = buildRecipe(DEFAULT_HEADER, nodes, []);
    expect(recipe.agent_config.tool_whitelist).toEqual([]);
  });

  it("node tool-call params.tool rỗng/hỏng → bị bỏ qua, không lọt vào whitelist", () => {
    const nodes = [
      node("n1", "llm-step", {}),
      node("n2", "tool-call", { tool: "" }),
      node("n3", "tool-call", { tool: 123 }),
    ];
    const recipe = buildRecipe(DEFAULT_HEADER, nodes, []);
    expect(recipe.agent_config.tool_whitelist).toEqual([]);
  });
});

describe("Test Mode (web#35) — 2 node giả không bao giờ lọt vào recipe", () => {
  // Review PR#37 (dholmes0207): "2 node giả không bao giờ chạm recipe" là bất biến đáng giá nhất
  // của tính năng, hiện chỉ được bảo vệ bằng cách viết đúng (App.tsx nối chúng vào `nodesForCanvas`,
  // KHÔNG bao giờ vào `nodes` state thật). Test này khoá bất biến đó ở đúng chỗ nó thật sự được
  // đảm bảo: `App.tsx::activeFrameNodes` luôn đi qua `nodesForFrame()` (lọc theo `parentId` chuẩn
  // react-flow) trước khi tới `buildRecipe()` — 2 node giả (`App.tsx`) không bao giờ được gán
  // `parentId`, nên dù có lỡ lọt vào mảng `nodes` chung (kịch bản xấu nhất 1 refactor sau này có
  // thể gây ra), `nodesForFrame()` vẫn loại chúng ra trước khi recipe được dựng.
  it("node giả không có parentId → nodesForFrame() loại bỏ, không tới được buildRecipe()", () => {
    const frameId = "frame-1";
    const nodes: FlowNode<CanvasNodeData>[] = [
      { ...node("n1", "llm-step", {}), parentId: frameId },
      { ...node(TEST_QUERY_NODE_ID, "llm-step", {}) },
      { ...node(TEST_RESPONSE_NODE_ID, "llm-step", {}) },
    ];
    const frameNodes = nodesForFrame(frameId, nodes);
    expect(frameNodes.map((n) => n.id)).toEqual(["n1"]);

    const recipe = buildRecipe(DEFAULT_HEADER, frameNodes, []);
    const wireIds = recipe.dag.nodes.map((n) => n.id);
    expect(wireIds).not.toContain(TEST_QUERY_NODE_ID);
    expect(wireIds).not.toContain(TEST_RESPONSE_NODE_ID);
    expect(wireIds).toEqual(["n1"]);
  });
});

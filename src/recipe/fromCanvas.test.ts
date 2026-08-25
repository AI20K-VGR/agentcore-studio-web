/**
 * Test cho `buildRecipe()` — đặc biệt `readTemperature()` nội bộ: `temperature` sống ở node
 * `llm-step` (không phải `RecipeHeader`), phải được đọc đúng vào `agent_config.temperature` khi
 * dựng `WireRecipe` gửi lên server (bug đã đóng — trước bản vá này field này chưa từng được gửi).
 */

import { describe, expect, it } from "vitest";
import type { Node as FlowNode } from "reactflow";
import { buildRecipe, type CanvasNodeData } from "./fromCanvas";
import { DEFAULT_HEADER } from "./sample";

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

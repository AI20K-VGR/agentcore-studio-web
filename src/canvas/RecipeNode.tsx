/**
 * Node renderer cho canvas — web#45: đồ thị vô hướng, mỗi node CHỈ 1 cổng (không còn phân biệt
 * vào/ra) — `agentTopologyLint` (luật hub-spoke, `recipe/graphLint.ts`) vốn đã KHÔNG ép chiều
 * `from`/`to`, nên 2 cổng có hướng ở bản trước chỉ là tàn dư UI. `llm-step` (tâm hình sao) có cổng
 * ở DƯỚI; `kb-retrieve`/`tool-call` (cánh) có cổng ở TRÊN — chỉ đúng 1 cặp type (source/target) hợp
 * lệ để nối nên vẫn tự ép đúng topology hub-spoke dù dùng `connectionMode` mặc định (Strict) của
 * react-flow, không cần validate thêm ở `onConnect`. Không có cổng nào cho `data.type === "end"`
 * (legacy) — `toCanvas.ts::fromRecipe()` lọc node này khỏi canvas TRƯỚC KHI tới đây (xem comment
 * tại chỗ khai báo handle bên dưới), nên `RecipeNode` không bao giờ thực sự thấy loại node đó.
 *
 * Test Mode (web#35, mở rộng web#45): CHỈ `llm-step`, CHỈ khi `data.testModeHub`, mọc thêm 2 cổng
 * trái/phải nối 2 node giả câu hỏi/phản hồi (`TestModeNodes.tsx`) — đây là chỗ DUY NHẤT còn khái
 * niệm vào/ra thật.
 */

import { useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "reactflow";

import { nodeSpec } from "../recipe/contract";
import type { CanvasNodeData } from "../recipe/fromCanvas";
import { BrainIcon, DatabaseIcon, WrenchIcon } from "../icons";

export default function RecipeNode({ id, data, selected }: NodeProps<CanvasNodeData>) {
  const spec = nodeSpec(data.type);
  const isLlmStep = data.type === "llm-step";
  const isKbRetrieve = data.type === "kb-retrieve";
  const isToolCall = data.type === "tool-call";

  // Bug quan sát được: bật Test Mode, 2 cạnh giả câu-hỏi/phản-hồi (App.tsx::edgesForCanvas) không
  // bám đúng cổng trái/phải của llm-step — console báo
  // `Couldn't create edge for source handle id: "test-hub-out"`. Nguyên nhân: react-flow cache vị
  // trí handle của mỗi node lúc mount; 2 handle `test-hub-in`/`test-hub-out` bên dưới chỉ render có
  // điều kiện (`data.testModeHub`, đổi SAU khi node đã mount, không phải lúc mount) — thêm/bớt
  // handle lúc đang chạy mà không gọi `updateNodeInternals` thì react-flow không biết layout đã đổi,
  // 2 cạnh giả vẫn tính theo layout CŨ (không có 2 handle đó). Phải gọi lại mỗi khi `testModeHub`
  // bật/tắt cho đúng node này (gọi dư cho node khác vô hại nhưng không cần thiết).
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, data.testModeHub, updateNodeInternals]);

  const summary = spec.fields
    .map((field) => `${field.key}=${JSON.stringify(data.params[field.key] ?? null)}`)
    .join(" · ");

  const handleStyle = (color: string) => ({
    background: color,
    width: 14,
    height: 14,
    border: "2.5px solid var(--surface)",
    boxShadow: "0 0 0 1px var(--line-strong)",
    zIndex: 10,
  });

  const testActive = data.testHighlight === "active";
  const testDone = data.testHighlight === "done";

  return (
    <div
      style={{
        minWidth: isLlmStep ? 275 : 248,
        borderRadius: 12,
        border: `2.5px solid ${
          data.invalid
            ? "var(--bad)"
            : testActive
              ? spec.color
              : selected
                ? spec.color
                : "var(--line-strong)"
        }`,
        background: "var(--surface)",
        boxShadow: data.invalid
          ? "0 0 0 4px var(--bad-soft)"
          : testActive
            ? `0 0 0 4px ${spec.color}33, var(--shadow-md)`
            : isLlmStep
              ? "0 0 0 3px rgba(61,90,128,0.22), var(--shadow-md)"
              : "var(--shadow-md)",
        opacity: testDone ? 0.75 : 1,
        overflow: "visible",
        position: "relative",
        fontSize: 13.5,
        fontFamily: "var(--font-body)",
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
      }}
    >
      {testActive && (
        <span
          style={{
            position: "absolute",
            top: -9,
            right: -9,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: spec.color,
            boxShadow: "0 0 0 3px var(--surface)",
            animation: "acs-test-pulse 1.1s ease-in-out infinite",
          }}
        />
      )}
      {testDone && (
        <span
          style={{
            position: "absolute",
            top: -9,
            right: -9,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "var(--good)",
            color: "#fff",
            fontSize: 10,
            lineHeight: "16px",
            textAlign: "center",
            boxShadow: "0 0 0 3px var(--surface)",
          }}
        >
          ✓
        </span>
      )}
      {/* ================= CỔNG KẾT NỐI (1 cổng/node, vô hướng — xem docstring đầu file) ================= */}

      {isLlmStep && (
        <Handle type="target" position={Position.Bottom} id="hub-in" style={handleStyle(spec.color)} />
      )}

      {(isKbRetrieve || isToolCall) && (
        <Handle type="source" position={Position.Top} id="spoke-out" style={handleStyle(spec.color)} />
      )}

      {/* Không có nhánh cho `data.type === "end"`: `toCanvas.ts::fromRecipe()` lọc node theo
          `isCoreNodeType` TRƯỚC KHI dựng canvas, và `CORE_NODE_TYPES` không gồm `end` — 1 node
          `end` của recipe cũ đi thẳng vào `hiddenNodeTypes`, không bao giờ trở thành `recipeNode`
          nên `RecipeNode` không bao giờ thấy `data.type === "end"` (review web#49, dholmes0207:
          nhánh cũ ở đây là dead code, comment "chỉ còn gặp khi load recipe cũ" mô tả sai đúng ca
          đã bị lọc mất). */}

      {/* Test Mode (web#35/web#45) — 2 cổng phụ trái/phải, CHỈ trên llm-step, CHỈ khi bật Test
          Mode, nối 2 node giả câu hỏi/phản hồi (`TestModeNodes.tsx`, `App.tsx::edgesForCanvas`). */}
      {isLlmStep && data.testModeHub && (
        <>
          <Handle type="target" position={Position.Left} id="test-hub-in" style={handleStyle(spec.color)} />
          <Handle type="source" position={Position.Right} id="test-hub-out" style={handleStyle(spec.color)} />
        </>
      )}

      {/* ================= HEADER ================= */}
      <div
        style={{
          background: isLlmStep
            ? "linear-gradient(135deg, #1f3a5f 0%, #345882 55%, #4a75a7 100%)"
            : isKbRetrieve
              ? "linear-gradient(135deg, #134e4a 0%, #206d64 60%, #2f8579 100%)"
              : isToolCall
                ? "linear-gradient(135deg, #5b3a8c 0%, #764fa9 60%, #8e68c4 100%)"
                : spec.color,
          color: "#fff",
          padding: "8px 12px",
          borderRadius: "10px 10px 0 0",
          fontWeight: 700,
          fontSize: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {isLlmStep && <BrainIcon size={16} />}
          {isKbRetrieve && <DatabaseIcon size={15} />}
          {isToolCall && <WrenchIcon size={15} />}
          <span>{spec.label}</span>
        </div>
        <span style={{ opacity: 0.85, fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{id}</span>
      </div>

      {/* ================= BODY ================= */}
      <div style={{ padding: "9px 12px 11px", color: "var(--ink)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-faint)" }}>
            {data.type}
          </div>

          {isLlmStep && (
            <div
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10.5,
                fontWeight: 700,
                color: "#1f3a5f",
                background: "rgba(61, 90, 128, 0.14)",
              }}
            >
              🧠 Reasoning Hub
            </div>
          )}

          {isKbRetrieve && (
            <div
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10.5,
                fontWeight: 700,
                color: "#134e4a",
                background: "rgba(32, 109, 100, 0.14)",
              }}
            >
              📚 Context Provider
            </div>
          )}

          {isToolCall && (
            <div
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10.5,
                fontWeight: 700,
                color: "#5b3a8c",
                background: "rgba(107, 79, 160, 0.14)",
              }}
            >
              ⚡ Tool Satellite
            </div>
          )}
        </div>

        {summary && (
          <div
            style={{
              marginTop: 6,
              wordBreak: "break-word",
              fontSize: 12,
              lineHeight: 1.45,
              color: "var(--ink-soft)",
            }}
          >
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Node renderer cho canvas — Hỗ trợ kết nối linh hoạt Hub-and-Spoke.
 *
 * `llm-step` đóng vai trò Reasoning Hub với các cổng đa hướng:
 *   - Top & Left: Nhận context tra cứu từ `kb-retrieve`
 *   - Right & Bottom: Gắn và điều phối các `tool-call` vệ tinh
 * `kb-retrieve` có cổng ra ở Bottom & Right để dễ dàng cấp dữ liệu sang `llm-step`.
 * `tool-call` có cổng vào ở Top & Left để dễ dàng bắt tín hiệu gọi từ `llm-step`.
 */

import { Handle, Position, type NodeProps } from "reactflow";

import { nodeSpec } from "../recipe/contract";
import type { CanvasNodeData } from "../recipe/fromCanvas";
import { BrainIcon, DatabaseIcon, WrenchIcon } from "../icons";

export default function RecipeNode({ id, data, selected }: NodeProps<CanvasNodeData>) {
  const spec = nodeSpec(data.type);
  const isLlmStep = data.type === "llm-step";
  const isKbRetrieve = data.type === "kb-retrieve";
  const isToolCall = data.type === "tool-call";

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

  return (
    <div
      style={{
        minWidth: isLlmStep ? 275 : 248,
        borderRadius: 12,
        border: `2.5px solid ${data.invalid ? "var(--bad)" : selected ? spec.color : "var(--line-strong)"}`,
        background: "var(--surface)",
        boxShadow: data.invalid
          ? "0 0 0 4px var(--bad-soft)"
          : isLlmStep
            ? "0 0 0 3px rgba(61,90,128,0.22), var(--shadow-md)"
            : "var(--shadow-md)",
        overflow: "visible",
        position: "relative",
        fontSize: 13.5,
        fontFamily: "var(--font-body)",
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
      }}
    >
      {/* ================= CÁC HANDLE KẾT NỐI (PORTS) ================= */}

      {/* Target Handles (Cổng vào) */}
      <Handle
        type="target"
        position={Position.Top}
        id="in-top"
        style={handleStyle(spec.color)}
      />

      {(isLlmStep || isToolCall) && (
        <Handle
          type="target"
          position={Position.Left}
          id="in-left"
          style={{ ...handleStyle(spec.color), top: isLlmStep ? "60%" : "50%" }}
        />
      )}

      {/* Source Handles (Cổng ra) */}
      {data.type !== "end" && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="out-bottom"
          style={handleStyle(spec.color)}
        />
      )}

      {(isLlmStep || isKbRetrieve || isToolCall) && (
        <Handle
          type="source"
          position={Position.Right}
          id="out-right"
          style={{ ...handleStyle(spec.color), top: isLlmStep ? "60%" : "50%" }}
        />
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

        {/* Port Helper Indicators on LLM Hub */}
        {isLlmStep && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--ink-faint)",
              marginTop: 6,
              padding: "2px 4px",
              background: "var(--surface-2)",
              borderRadius: 5,
            }}
          >
            <span>⮜ KB In</span>
            <span>Tools Out ⮞</span>
          </div>
        )}

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

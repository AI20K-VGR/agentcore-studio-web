/**
 * Node renderer cho canvas — mỗi node có đúng 2 cổng: 1 vào (top), 1 ra (bottom), trừ `end`
 * (chỉ có cổng vào, là node kết thúc). Từng có layout Hub-and-Spoke 4 cổng cho `llm-step`/
 * `kb-retrieve`/`tool-call`, nhưng gỡ bỏ vì `graphLint()` (`recipe/graphLint.ts` luật 4) đã chặn
 * mọi node có >1 outgoing edge — layout đa cổng chỉ là preview chưa dùng được.
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

      {/* Target Handle (Cổng vào) */}
      <Handle
        type="target"
        position={Position.Top}
        id="in-top"
        style={handleStyle(spec.color)}
      />

      {/* Source Handle (Cổng ra) */}
      {data.type !== "end" && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="out-bottom"
          style={handleStyle(spec.color)}
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

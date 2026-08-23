/**
 * Node renderer cho canvas — 1 component dùng chung cho cả 6 loại.
 *
 * Cố ý KHÔNG viết 6 component riêng: 6 loại chỉ khác nhau ở nhãn/màu/params, mà những thứ đó
 * đã nằm trong `NODE_SPECS`. Sáu component riêng nghĩa là thêm loại thứ 7 phải sửa 2 chỗ —
 * trong khi cả điểm của "palette đóng" là 6 loại này do contract quyết, không do UI quyết.
 */

import { Handle, Position, type NodeProps } from "reactflow";

import { nodeSpec } from "../recipe/contract";
import type { CanvasNodeData } from "../recipe/fromCanvas";

export default function RecipeNode({ id, data, selected }: NodeProps<CanvasNodeData>) {
  const spec = nodeSpec(data.type);
  const isLlmStep = data.type === "llm-step";

  // Tóm tắt param hiện lên thân node: người dùng nhìn canvas là biết node đang cấu hình gì,
  // không phải bấm từng node mới thấy.
  const summary = spec.fields
    .map((field) => `${field.key}=${JSON.stringify(data.params[field.key] ?? null)}`)
    .join(" · ");

  return (
    <div
      style={{
        minWidth: 252,
        borderRadius: 12,
        border: `2.5px solid ${data.invalid ? "var(--bad)" : selected ? spec.color : "var(--line-strong)"}`,
        background: "var(--surface)",
        boxShadow: data.invalid
          ? "0 0 0 4px var(--bad-soft)"
          : isLlmStep
            ? "0 0 0 3px rgba(61,90,128,0.2), var(--shadow-md)"
            : "var(--shadow-md)",
        overflow: "hidden",
        fontSize: 13.5,
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Node `end` là điểm kết thúc DAG — không có handle nguồn, nên không thể kéo cạnh ra
          khỏi nó. Chặn ở tầng UI cho đỡ vẽ nhầm; graph-lint vẫn là chỗ chặn thật. */}
      {/* Chấm nối to hơn + viền trắng nổi hẳn lên khỏi nền node (phản hồi: "cạnh nối... mờ quá,
          làm... nối cho dễ") — chấm nối là đích bấm-kéo thật (không phải trang trí góc node), nhỏ
          quá thì khó nhắm trúng, nhất là lúc phải nối 2 node xa nhau qua nhiều lần kéo thử. */}
      {data.type !== "end" && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: spec.color, width: 15, height: 15, border: "2.5px solid var(--surface)" }}
        />
      )}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: spec.color, width: 15, height: 15, border: "2.5px solid var(--surface)" }}
      />

      <div
        style={{
          background: isLlmStep
            ? "linear-gradient(135deg, #274667 0%, #3D5A80 58%, #5477A7 100%)"
            : spec.color,
          color: "#fff",
          padding: "8px 12px",
          fontWeight: 700,
          fontSize: 14.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>{spec.label}</span>
        <span style={{ opacity: 0.8, fontFamily: "var(--font-mono)", fontSize: 12 }}>{id}</span>
      </div>

      <div style={{ padding: "9px 12px 11px", color: "var(--ink)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-faint)" }}>{data.type}</div>
        {isLlmStep && (
          <div
            style={{
              marginTop: 6,
              padding: "4px 8px",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: "#274667",
              background: "rgba(61, 90, 128, 0.12)",
            }}
          >
            reasoning core
          </div>
        )}
        {summary && (
          <div style={{ marginTop: 6, wordBreak: "break-word", fontSize: 12.5, lineHeight: 1.5 }}>{summary}</div>
        )}
      </div>
    </div>
  );
}

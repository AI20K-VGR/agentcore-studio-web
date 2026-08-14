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

  // Tóm tắt param hiện lên thân node: người dùng nhìn canvas là biết node đang cấu hình gì,
  // không phải bấm từng node mới thấy.
  const summary = spec.fields
    .map((field) => `${field.key}=${JSON.stringify(data.params[field.key] ?? null)}`)
    .join(" · ");

  return (
    <div
      style={{
        minWidth: 172,
        borderRadius: 9,
        border: `2px solid ${data.invalid ? "var(--danger-text)" : selected ? spec.color : "var(--line)"}`,
        background: "var(--surface)",
        boxShadow: data.invalid
          ? "0 0 0 3px rgba(220,38,38,0.15)"
          : selected
            ? `0 0 0 3px ${spec.color}22, 0 2px 6px rgba(20,24,26,0.08)`
            : "0 1px 3px rgba(20,24,26,0.06)",
        overflow: "hidden",
        fontSize: 12,
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Node `end` là điểm kết thúc DAG — không có handle nguồn, nên không thể kéo cạnh ra
          khỏi nó. Chặn ở tầng UI cho đỡ vẽ nhầm; graph-lint vẫn là chỗ chặn thật. */}
      {data.type !== "end" && (
        <Handle type="source" position={Position.Bottom} style={{ background: spec.color }} />
      )}
      <Handle type="target" position={Position.Top} style={{ background: spec.color }} />

      {/* Màu header GIỮ NGUYÊN theo `spec.color` — thông tin chức năng thật (6 loại node),
          không phải trang trí. */}
      <div
        style={{
          background: spec.color,
          color: "#fff",
          padding: "5px 9px",
          fontWeight: 600,
          fontFamily: "var(--font-display)",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{spec.label}</span>
        <span style={{ opacity: 0.75, fontFamily: "var(--font-mono)", fontWeight: 400, fontSize: 11 }}>{id}</span>
      </div>

      <div style={{ padding: "7px 9px", color: "var(--ink)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{data.type}</div>
        {summary && (
          <div style={{ marginTop: 4, wordBreak: "break-word", fontSize: 11, fontFamily: "var(--font-mono)" }}>
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Inspector — sửa params của node đang chọn / `when` của cạnh đang chọn.
 *
 * Field render theo `NODE_SPECS[].fields`, không hardcode theo từng loại: thêm 1 param vào spec
 * là Inspector tự có ô nhập, không phải sửa component này.
 */

import type { Edge as FlowEdge, Node as FlowNode } from "reactflow";

import { nodeSpec, SECTION_ROLES } from "../recipe/contract";
import type { CanvasEdgeData, CanvasNodeData } from "../recipe/fromCanvas";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 9px",
  fontSize: 12,
  fontFamily: "var(--font-body)",
  color: "var(--ink)",
  borderRadius: 6,
  border: "1px solid var(--line)",
  boxSizing: "border-box",
  outline: "none",
};

interface Props {
  node: FlowNode<CanvasNodeData> | null;
  edge: FlowEdge<CanvasEdgeData> | null;
  /** Tool đang bật trong `agent_config.tool_whitelist` — nguồn cho dropdown của `tool-call`. */
  toolWhitelist: string[];
  onParamChange: (nodeId: string, key: string, value: unknown) => void;
  onWhenChange: (edgeId: string, when: string | null) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export default function Inspector({
  node,
  edge,
  toolWhitelist,
  onParamChange,
  onWhenChange,
  onDeleteNode,
  onDeleteEdge,
}: Props) {
  if (edge) {
    return (
      <div>
        <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>
          Cạnh <code style={{ fontSize: 11 }}>{edge.source} → {edge.target}</code>
        </h3>
        <label style={{ display: "block", fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
          when (điều kiện rẽ nhánh)
        </label>
        <input
          type="text"
          value={edge.data?.when ?? ""}
          placeholder='vd: refused == false — field tra trong output node NGUỒN, để trống = vô điều kiện'
          onChange={(event) =>
            // Chuỗi rỗng phải thành `null`, không phải `""`: contract khai `when: str | None`,
            // và `""` là một điều kiện rỗng có thật chứ không phải "không có điều kiện".
            onWhenChange(edge.id, event.target.value.trim() === "" ? null : event.target.value)
          }
          style={inputStyle}
        />
        {/* Cạnh này chỉ có tác dụng khi node NGUỒN là `condition` — `interpreter.py` chỉ đọc
            `Edge.when` để bơm vào `condition_params["when"]` lúc dispatch node `condition`
            (và chỉ khi node đó chưa tự khai `when` riêng trong Inspector của chính nó). Trên
            cạnh đi ra từ 5 loại node khác, giá trị gõ ở đây bị bỏ qua hoàn toàn — không phải
            lỗi hiển thị, executor thật sự không đọc tới. */}
        {edge.data?.when && (
          <div style={{ fontSize: 10, color: "var(--warning-text)", marginTop: 4 }}>
            ⚠ Chỉ có tác dụng nếu node nguồn (<code>{edge.source}</code>) là loại <code>condition</code> — cạnh đi ra
            từ node khác thì giá trị này bị bỏ qua, không phải lỗi hiển thị.
          </div>
        )}
        <button
          type="button"
          onClick={() => onDeleteEdge(edge.id)}
          style={{ ...inputStyle, marginTop: 8, cursor: "pointer", color: "var(--danger-text)" }}
        >
          Xoá cạnh
        </button>
      </div>
    );
  }

  if (!node) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Chọn 1 node hoặc 1 cạnh trên canvas để sửa params.
      </div>
    );
  }

  const spec = nodeSpec(node.data.type);

  return (
    <div>
      <h3 style={{ fontSize: 13, margin: "0 0 2px" }}>{spec.label}</h3>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
        {node.id} · {node.data.type}
      </div>

      {spec.fields.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Node này không có params.</div>
      )}

      {spec.fields.map((field) => {
        const value = node.data.params[field.key];

        if (field.kind === "roles") {
          const selected = Array.isArray(value) ? (value as unknown[]).map(String) : [];
          return (
            <div key={field.key} style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
                {field.label}
              </label>
              {SECTION_ROLES.map((role) => (
                <label
                  key={role}
                  style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginTop: 2 }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(role)}
                    onChange={(event) =>
                      onParamChange(
                        node.id,
                        field.key,
                        event.target.checked ? [...selected, role] : selected.filter((r) => r !== role),
                      )
                    }
                  />
                  <code>{role}</code>
                </label>
              ))}
              {selected.length === 0 && (
                <div style={{ fontSize: 10, color: "var(--danger-text)", marginTop: 2 }}>
                  Rỗng = kb-retrieve luôn trả [] (StaticKbSearch lọc section_role trước khi xếp hạng).
                </div>
              )}
            </div>
          );
        }

        if (field.kind === "tool") {
          return (
            <div key={field.key} style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
                {field.label}
              </label>
              <select
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onParamChange(node.id, field.key, event.target.value)}
                style={inputStyle}
              >
                {/* Tool ngoài whitelist vẫn chọn được — không khoá cứng dropdown theo whitelist.
                    Nếu khoá, luật 4 của graph-lint thành không-thể-vi-phạm-từ-UI và cũng
                    không-thể-demo. Ở đây chọn xong sẽ thấy panel lint đỏ ngay, đó mới là thứ
                    cần cho thấy: cổng chặn có hoạt động. */}
                <option value="">— chưa chọn —</option>
                {toolWhitelist.map((tool) => (
                  <option key={tool} value={tool}>
                    {tool} ✓ trong whitelist
                  </option>
                ))}
                <option value="tool_ngoai_whitelist">tool_ngoai_whitelist ✗ (để thử fail-closed)</option>
              </select>
            </div>
          );
        }

        return (
          <div key={field.key} style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
              {field.label}
            </label>
            <input
              type={field.kind === "number" ? "number" : "text"}
              value={value === null || value === undefined ? "" : String(value)}
              step={field.kind === "number" ? "any" : undefined}
              placeholder={field.kind === "text" ? field.placeholder : undefined}
              onChange={(event) => {
                if (field.kind === "number") {
                  const parsed = Number(event.target.value);
                  // Ô số đang gõ dở ("", "-", "1.") cho ra NaN. Giữ nguyên giá trị cũ thay vì
                  // ghi NaN vào params — NaN không serialize được sang JSON (thành `null`),
                  // recipe export ra sẽ mất param mà không báo gì.
                  onParamChange(node.id, field.key, Number.isNaN(parsed) ? value : parsed);
                } else {
                  onParamChange(node.id, field.key, event.target.value);
                }
              }}
              style={inputStyle}
            />
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onDeleteNode(node.id)}
        style={{ ...inputStyle, marginTop: 4, cursor: "pointer", color: "var(--danger-text)" }}
      >
        Xoá node
      </button>
    </div>
  );
}

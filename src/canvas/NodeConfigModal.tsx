/**
 * Modal cấu hình 1 node trên canvas — bấm vào node là mở (xem `onNodeClick` ở `App.tsx`), cùng
 * mẫu UX với `AgentConfigModal` ("bấm nút → cửa sổ nổi lên sửa → Xong là đóng, đổi gì áp dụng
 * ngay không cần nút Lưu riêng") mà người dùng đã thấy hợp lý khi dùng cho Agent — áp dụng lại
 * đúng mẫu đó cho node thay vì sửa trực tiếp trong Inspector cột phải như bản cũ.
 *
 * Field render theo `NODE_SPECS[].fields`, y hệt logic Inspector từng có (không hardcode theo
 * từng loại) — chỉ đổi CHỖ hiển thị (modal thay vì cột cố định), không đổi luật render field.
 */
import type { Node as FlowNode } from "reactflow";

import { nodeSpec, SECTION_ROLES } from "../recipe/contract";
import type { CanvasNodeData } from "../recipe/fromCanvas";
import { CloseIcon } from "../icons";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--ink-soft)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13.5,
  borderRadius: 6,
  border: "1px solid var(--line-strong)",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
};

interface Props {
  node: FlowNode<CanvasNodeData>;
  toolWhitelist: string[];
  onParamChange: (nodeId: string, key: string, value: unknown) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export default function NodeConfigModal({ node, toolWhitelist, onParamChange, onDeleteNode, onClose }: Props) {
  const spec = nodeSpec(node.data.type);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,36,34,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 96vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--paper)",
          borderRadius: 12,
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "16px 18px",
            background: spec.color,
            borderRadius: "12px 12px 0 0",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontFamily: "var(--font-display)", fontWeight: 600, color: "#fff" }}>
              {spec.label}
            </h2>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
              {node.id} · {node.data.type}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              flexShrink: 0,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div style={{ padding: "18px 20px 20px" }}>
          {spec.fields.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Node này không có params.</div>
          )}

          {spec.fields.map((field) => {
            const value = node.data.params[field.key];

            if (field.kind === "roles") {
              const selected = Array.isArray(value) ? (value as unknown[]).map(String) : [];
              return (
                <div key={field.key} style={{ marginBottom: 14 }}>
                  <div style={labelStyle}>{field.label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {SECTION_ROLES.map((role) => (
                      <label
                        key={role}
                        style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink)" }}
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
                        <code style={{ fontFamily: "var(--font-mono)" }}>{role}</code>
                      </label>
                    ))}
                  </div>
                  {selected.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--bad)", marginTop: 5 }}>
                      Rỗng = kb-retrieve luôn trả [] (StaticKbSearch lọc section_role trước khi xếp hạng).
                    </div>
                  )}
                </div>
              );
            }

            if (field.kind === "tool") {
              return (
                <div key={field.key} style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{field.label}</label>
                  <select
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) => onParamChange(node.id, field.key, event.target.value)}
                    style={inputStyle}
                  >
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
              <div key={field.key} style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{field.label}</label>
                <input
                  type={field.kind === "number" ? "number" : "text"}
                  value={value === null || value === undefined ? "" : String(value)}
                  step={field.kind === "number" ? "any" : undefined}
                  placeholder={field.kind === "text" ? field.placeholder : undefined}
                  onChange={(event) => {
                    if (field.kind === "number") {
                      const parsed = Number(event.target.value);
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

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => {
                onDeleteNode(node.id);
                onClose();
              }}
              style={{
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 7,
                border: "1px solid var(--bad)",
                background: "var(--bad-soft)",
                color: "var(--bad)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              Xoá node
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "9px 22px",
                fontSize: 13.5,
                fontWeight: 700,
                borderRadius: 7,
                border: "none",
                background: "var(--tier-admin)",
                color: "#fff",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              Xong
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

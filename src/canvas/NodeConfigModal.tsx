/**
 * Modal cấu hình 1 node trên canvas — bấm vào node là mở (xem `onNodeClick` ở `App.tsx`), cùng
 * mẫu UX với `AgentConfigModal` ("bấm nút → cửa sổ nổi lên sửa → Xong là đóng, đổi gì áp dụng
 * ngay không cần nút Lưu riêng") mà người dùng đã thấy hợp lý khi dùng cho Agent — áp dụng lại
 * đúng mẫu đó cho node thay vì sửa trực tiếp trong Inspector cột phải như bản cũ.
 *
 * Field render theo `NODE_SPECS[].fields`, y hệt logic Inspector từng có (không hardcode theo
 * từng loại) — chỉ đổi CHỖ hiển thị (modal thay vì cột cố định), không đổi luật render field.
 */
import { useEffect, useState } from "react";
import type { Node as FlowNode } from "reactflow";

import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { listSections, type SectionSummary } from "../admin/sectionsApi";
import { AVAILABLE_TOOLS, nodeSpec, SECTION_ROLES } from "../recipe/contract";
import type { CanvasNodeData } from "../recipe/fromCanvas";
import { CloseIcon } from "../icons";

/** Mô tả ngắn cho từng tool trong dropdown — thuần UI, không phải shape contract. */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  calculator: "tính biểu thức số học",
  current_datetime: "ngày giờ hiện tại / khoảng cách giữa 2 ngày",
};

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
  session: Session;
  onParamChange: (nodeId: string, key: string, value: unknown) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export default function NodeConfigModal({ node, session, onParamChange, onDeleteNode, onClose }: Props) {
  const spec = nodeSpec(node.data.type);

  // web#44 review — field `kind: "section"` (`kb-retrieve`) nguồn dữ liệu là `listSections()`,
  // per-tenant THẬT, không phải mảng tĩnh như `"tool"`/`"roles"` — fetch lúc mở modal, chỉ khi node
  // này thật sự có field loại đó (đa số node khác không cần gọi API gì cả).
  const hasSectionField = spec.fields.some((field) => field.kind === "section");
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  useEffect(() => {
    if (!hasSectionField) return;
    let cancelled = false;
    listSections(session)
      .then((result) => {
        if (!cancelled) setSections(result);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(err instanceof StudioApiError ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [hasSectionField, session]);

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

            if (field.kind === "section") {
              return (
                <div key={field.key} style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{field.label}</label>
                  <select
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) => onParamChange(node.id, field.key, event.target.value)}
                    disabled={sections.length === 0}
                    style={inputStyle}
                  >
                    <option value="">— chưa chọn —</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.name}>
                        {section.name}
                      </option>
                    ))}
                  </select>
                  {sectionsError && (
                    <div style={{ fontSize: 11, color: "var(--bad)", marginTop: 5 }}>
                      Không tải được danh sách phòng ban: {sectionsError}
                    </div>
                  )}
                  {!sectionsError && sections.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 5 }}>
                      Tenant chưa có phòng ban nào. Không chọn phòng ban thì agent vẫn chat bình
                      thường, chỉ không có bộ chấm điểm riêng theo phòng ban.
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
                    {AVAILABLE_TOOLS.map((tool) => (
                      <option key={tool} value={tool}>
                        {tool} — {TOOL_DESCRIPTIONS[tool]}
                      </option>
                    ))}
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

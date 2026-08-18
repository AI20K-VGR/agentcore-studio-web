/**
 * Modal cấu hình 1 cạnh trên canvas — bấm vào cạnh là mở (xem `onEdgeClick` ở `App.tsx`), cùng mẫu
 * "bấm → cửa sổ nổi lên sửa → Xong là đóng" với `NodeConfigModal`/`AgentConfigModal` — cột
 * "Inspector" cũ (nơi từng hiện field `when` inline) đã bỏ hẳn, cạnh giờ cũng qua modal như node.
 */
import type { Edge as FlowEdge } from "reactflow";

import type { CanvasEdgeData } from "../recipe/fromCanvas";
import { CloseIcon, WarningTriangleIcon } from "../icons";

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
  edge: FlowEdge<CanvasEdgeData>;
  onWhenChange: (edgeId: string, when: string | null) => void;
  onDeleteEdge: (edgeId: string) => void;
  onClose: () => void;
}

export default function EdgeConfigModal({ edge, onWhenChange, onDeleteEdge, onClose }: Props) {
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
          width: "min(440px, 96vw)",
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
            background: "var(--tier-admin)",
            borderRadius: "12px 12px 0 0",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontFamily: "var(--font-display)", fontWeight: 600, color: "#fff" }}>
              Cạnh
            </h2>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>
              {edge.source} → {edge.target}
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
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 4 }}>
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
              `Edge.when` để bơm vào `condition_params["when"]` lúc dispatch node `condition` (và
              chỉ khi node đó chưa tự khai `when` riêng trong params của chính nó). Trên cạnh đi ra
              từ 5 loại node khác, giá trị gõ ở đây bị bỏ qua hoàn toàn — không phải lỗi hiển thị,
              executor thật sự không đọc tới. */}
          {edge.data?.when && (
            <div style={{ display: "flex", gap: 5, alignItems: "flex-start", fontSize: 11, color: "var(--warn)", marginTop: 6 }}>
              <WarningTriangleIcon size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Chỉ có tác dụng nếu node nguồn (<code style={{ fontFamily: "var(--font-mono)" }}>{edge.source}</code>) là loại{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>condition</code> — cạnh đi ra từ node khác thì giá trị này bị
                bỏ qua, không phải lỗi hiển thị.
              </span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={() => {
                onDeleteEdge(edge.id);
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
              Xoá cạnh
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

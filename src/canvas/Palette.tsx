/**
 * Palette 6 node ĐÓNG — nguồn duy nhất để thêm node vào canvas.
 *
 * "Đóng" ở đây là thật, không phải quy ước: không có ô "custom node", không có ô nhập type tự do.
 * Cap cứng của contract (`nodes.py`: "CẤM thêm node ngoài 6 loại") được thể hiện đúng như vậy
 * trong UI — người dùng không có đường nào vẽ ra node thứ 7.
 */

import { NODE_SPECS, type NodeType } from "../recipe/contract";

/** Khoá `dataTransfer` — `onDrop` của canvas đọc đúng khoá này. */
export const DND_MIME = "application/agentcore-node-type";

interface Props {
  /** Bấm (thay vì kéo) cũng thêm được node — kéo-thả khó dùng trên máy không có chuột. */
  onAdd: (type: NodeType) => void;
}

export default function Palette({ onAdd }: Props) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
        Kéo vào canvas, hoặc bấm để thêm.
      </div>
      <div style={{ display: "grid", gap: 7 }}>
        {NODE_SPECS.map((spec) => (
          <button
            key={spec.type}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DND_MIME, spec.type);
              event.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onAdd(spec.type)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 9px",
              // Dải màu trái theo `spec.color` GIỮ NGUYÊN — đây là thông tin chức năng thật
              // (phân biệt 6 loại node), không phải trang trí thẩm mỹ.
              border: "1px solid var(--line)",
              borderLeft: `4px solid ${spec.color}`,
              borderRadius: 7,
              background: "var(--surface)",
              cursor: "grab",
              textAlign: "left",
              font: "inherit",
              fontSize: 12,
              transition: "background 0.1s ease, border-color 0.1s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface)")}
          >
            <span style={{ flexGrow: 1 }}>
              <strong style={{ fontFamily: "var(--font-body)" }}>{spec.label}</strong>
              <span
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--muted)",
                }}
              >
                {spec.type}
              </span>
            </span>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{spec.owner}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

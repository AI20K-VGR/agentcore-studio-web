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
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 6 }}>
        Kéo vào canvas, hoặc bấm để thêm.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
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
              padding: "6px 8px",
              border: "1px solid #e4e4e7",
              borderLeft: `4px solid ${spec.color}`,
              borderRadius: 6,
              background: "#fff",
              cursor: "grab",
              textAlign: "left",
              font: "inherit",
              fontSize: 12,
            }}
          >
            <span style={{ flexGrow: 1 }}>
              <strong>{spec.label}</strong>
              <span
                style={{
                  display: "block",
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: "#71717a",
                }}
              >
                {spec.type}
              </span>
            </span>
            <span style={{ fontSize: 10, color: "#a1a1aa" }}>{spec.owner}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

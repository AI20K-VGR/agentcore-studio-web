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
      {/* 1 node = 1 dòng, full-width — nhãn + slug nằm chung 1 hàng ngang (không xuống dòng) để
          mỗi nút chỉ cao đúng 1 dòng chữ, đỡ tốn chiều cao cột trái dù đã quay lại full-width.
          `spec.owner` (quadrant kỹ thuật sở hữu node, "AIE-1"/"SWE"...) CỐ Ý không hiện — quy ước
          nội bộ codebase, vô nghĩa với admin công ty đang dùng UI này. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
              alignItems: "baseline",
              gap: 7,
              padding: "9px 11px",
              border: "1px solid var(--line)",
              borderLeft: `4px solid ${spec.color}`,
              borderRadius: 7,
              background: "var(--surface)",
              cursor: "grab",
              textAlign: "left",
              font: "inherit",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--ink)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {spec.label}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 400, color: "var(--ink-faint)" }}>
              {spec.type}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

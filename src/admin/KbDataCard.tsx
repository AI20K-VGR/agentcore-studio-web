/**
 * Khung "Dữ liệu KB hiện có" — danh sách tài liệu, tích chọn, xoá theo lựa chọn.
 *
 * Tách khỏi `DocumentsTab.tsx` cùng lúc với `UploadCard`/`GoldenSetCard`: ba khung này không chia
 * sẻ state nào ngoài "danh sách vừa đổi thì tải lại", nên gộp một file chỉ làm mỗi lần sửa phải
 * đọc cả ba (gợi ý review web#26).
 */

import type { DocumentSummary } from "./documentsApi";
import { Card } from "../components/Card";

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 12px",
  fontSize: 12,
  cursor: "pointer",
};

export default function KbDataCard({
  documents,
  totalChunks,
  selected,
  onSelectedChange,
  onDelete,
  deleting,
  notice,
}: {
  documents: DocumentSummary[];
  totalChunks: number;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onDelete: () => void;
  deleting: boolean;
  notice: string | null;
}) {
  const allSelected = documents.length > 0 && documents.every((d) => selected.has(d.id));
  // "Một phần" là trạng thái thứ BA, không phải một biến thể của "chưa chọn": ô tích ba trạng thái
  // cho người dùng biết ngay là đang có lựa chọn, khỏi phải rà cả danh sách để tìm dòng đã tích.
  const someSelected = documents.some((d) => selected.has(d.id)) && !allSelected;

  const toggleAll = () => onSelectedChange(allSelected ? new Set() : new Set(documents.map((d) => d.id)));

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  };

  const byRole = documents.reduce<Record<string, number>>((acc, d) => {
    acc[d.section_role] = (acc[d.section_role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card title="Dữ liệu KB hiện có">
      {notice && <div style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>{notice}</div>}

      <div style={{ display: "flex", gap: 20, marginBottom: 12, fontSize: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{documents.length}</div>
          <div style={{ color: "var(--ink-faint)" }}>tài liệu</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{totalChunks}</div>
          <div style={{ color: "var(--ink-faint)" }}>đoạn đang dùng để trả lời</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{Object.keys(byRole).length}</div>
          <div style={{ color: "var(--ink-faint)" }}>phòng ban có tài liệu</div>
        </div>
      </div>

      {documents.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-faint)",
            border: "1px dashed var(--line-strong)",
            borderRadius: 8,
            padding: "20px 12px",
            textAlign: "center",
            lineHeight: 1.7,
          }}
        >
          Chưa có tài liệu nào.
          <br />
          Nạp tài liệu đầu tiên ở khung bên trái — bộ câu hỏi kiểm thử sẽ được dựng tự động ngay sau đó.
        </div>
      ) : (
        <>
          <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
            <label
              style={{
                ...rowStyle,
                background: "var(--surface-alt, rgba(0,0,0,.03))",
                borderBottom: "1px solid var(--line)",
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
              />
              <span style={{ flex: 1 }}>{allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</span>
              <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>
                {selected.size > 0 ? `đã chọn ${selected.size}` : ""}
              </span>
            </label>

            {documents.map((d) => (
              <label
                key={d.id}
                style={{
                  ...rowStyle,
                  borderTop: "1px solid var(--line)",
                  background: selected.has(d.id) ? "var(--warn-soft)" : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={(e) => toggleOne(d.id, e.target.checked)}
                />
                <span style={{ flex: 1 }}>{d.name}</span>
                <span
                  style={{
                    color: "var(--ink-faint)",
                    border: "1px solid var(--line-strong)",
                    borderRadius: 999,
                    padding: "1px 8px",
                    fontSize: 11,
                  }}
                >
                  {d.section_role}
                </span>
                <span style={{ color: "var(--ink-faint)", minWidth: 56, textAlign: "right" }}>
                  {d.chunk_count} đoạn
                </span>
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={onDelete}
            disabled={selected.size === 0 || deleting}
            style={{
              marginTop: 12,
              padding: "7px 16px",
              fontSize: 12,
              borderRadius: 5,
              border: "1px solid var(--line-strong)",
              background: "var(--surface)",
              fontFamily: "var(--font-body)",
              color: selected.size === 0 ? "var(--ink-faint)" : "var(--bad)",
              cursor: selected.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? "Đang xoá…" : selected.size === 0 ? "Chọn tài liệu để xoá" : `Xoá ${selected.size} tài liệu`}
          </button>
        </>
      )}
    </Card>
  );
}

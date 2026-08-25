/**
 * Tab "Tài liệu" trong `AdminConsole` — upload thật (`POST /api/admin/documents`,
 * `apps/studio/src/studio_app/routes/documents.py`), nhận `.md`/`.txt`/`.docx`, cắt bằng
 * `chunk_window.cut_window` (cửa sổ trượt, không đòi cấu trúc heading) rồi embed/index vào
 * `kb.chunks`. Đây là tính năng DUY NHẤT chạy thật của tab này hiện tại.
 *
 * Phòng ban chọn khi upload lấy từ `listSections()` (đúng danh sách "phòng ban" thật của tenant,
 * cùng nguồn `EmployeesTab.tsx` dùng để gán role nhân viên) — KHÔNG phải 1 vocab cố định, vì cơ chế
 * fence nội dung thật (`routes/chat.py` → `interpreter.run()` → `kb_search.search`) so khớp
 * `section_role` với tên phòng ban nhân viên được gán, không phải vocab riêng nào.
 *
 * Card "Quản lý dữ liệu KB" bên dưới CỐ Ý chỉ là khung hiển thị — 2 nút không gọi API nào (disabled).
 * `KbPipeline.consent_purge`/`re_index` đã implement sẵn ở backend nhưng route chưa nối tới; giữ
 * chỗ trên UI cho lúc nào tính năng đó thật sự cần, không phải nửa vời (bấm được nhưng làm sai).
 */

import { useEffect, useState } from "react";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { Card } from "../components/Card";
import { WarningTriangleIcon } from "../icons";
import { uploadDocument, type UploadDocumentResult } from "./documentsApi";
import { listSections, type SectionSummary } from "./sectionsApi";

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12,
  borderRadius: 5,
  border: "1px solid var(--line-strong)",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
};

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        border: "1px solid var(--warn)",
        background: "var(--warn-soft)",
        borderRadius: 8,
        padding: 12,
        fontSize: 12,
        color: "var(--ink)",
        lineHeight: 1.6,
        marginBottom: 14,
      }}
    >
      <WarningTriangleIcon size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
      <div>{message}</div>
    </div>
  );
}

export default function DocumentsTab({ session }: { session: Session }) {
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sectionRole, setSectionRole] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "saving" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<UploadDocumentResult | null>(null);

  useEffect(() => {
    listSections(session)
      .then((s) => {
        setSections(s);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof StudioApiError ? err.message : String(err)));
  }, [session]);

  // Khớp đúng _MAX_UPLOAD_BYTES phía server (agentcore-studio-app routes/documents.py) — chặn
  // sớm phía client thay vì để user chờ hết round-trip rồi mới nhận 422 (review web#8 gợi ý #4).
  // Server VẪN tự kiểm lại — đây chỉ là UX polish, không phải hàng rào.
  const MAX_UPLOAD_BYTES = 1 * 1024 * 1024;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !sectionRole) {
      setUploadError("Cần chọn file (.md/.txt/.docx) và phòng ban.");
      setUploadState("error");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`File vượt quá giới hạn ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB.`);
      setUploadState("error");
      return;
    }
    setUploadState("saving");
    setUploadError(null);
    try {
      const result = await uploadDocument(file, sectionRole, session);
      setLastResult(result);
      setFile(null);
      setUploadState("idle");
    } catch (err) {
      setUploadError(err instanceof StudioApiError ? err.message : String(err));
      setUploadState("error");
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px", fontFamily: "var(--font-body)" }}>
      <Card title="Tải tài liệu lên">
        {loadError && <ErrorBanner message={`Không tải được danh sách phòng ban: ${loadError}`} />}
        {sections.length === 0 && !loadError && (
          <ErrorBanner message="Tenant chưa có phòng ban nào — tạo phòng ban ở tab Nhân viên trước khi upload tài liệu." />
        )}
        {uploadState === "error" && uploadError && <ErrorBanner message={uploadError} />}

        <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            File (.md/.txt/.docx)
            <input
              type="file"
              accept=".md,.txt,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            Phòng ban
            <select value={sectionRole} onChange={(e) => setSectionRole(e.target.value)} style={inputStyle}>
              <option value="">— chọn phòng ban —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={uploadState === "saving" || sections.length === 0}
            style={{
              ...inputStyle,
              cursor: "pointer",
              background: "var(--tier-admin)",
              color: "#fff",
              border: "none",
              alignSelf: "flex-start",
              padding: "6px 16px",
            }}
          >
            {uploadState === "saving" ? "Đang tải lên…" : "Tải lên"}
          </button>
        </form>

        {lastResult && (
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: "var(--good)",
              border: "1px solid var(--good)",
              borderRadius: 8,
              padding: 10,
            }}
          >
            {/* `doc_name` (tên gốc, bỏ đuôi) — KHÔNG `doc_id` (khoá kỹ thuật đã slugify/hash, cấm
                hiển thị thẳng lên UI theo luật dữ liệu nội bộ). */}
            Đã tải lên <strong>{lastResult.doc_name}</strong> —{" "}
            {lastResult.chunk_count} đoạn, phòng ban <strong>{lastResult.section_role}</strong>.
          </div>
        )}
      </Card>

      <Card title="Quản lý dữ liệu KB (toàn bộ công ty)">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <button type="button" disabled style={{ ...inputStyle, color: "var(--bad)", padding: "6px 16px" }}>
              Xoá toàn bộ tài liệu
            </button>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
              Sắp có — hiện chỉ là khung hiển thị, chưa gọi API.
            </div>
          </div>

          <div>
            <button type="button" disabled style={{ ...inputStyle, padding: "6px 16px" }}>
              Re-index toàn bộ
            </button>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
              Sắp có — hiện chỉ là khung hiển thị, chưa gọi API.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Tab "Tài liệu" trong `AdminConsole` — upload thật (`POST /api/admin/documents`,
 * `apps/studio/src/studio_app/routes/documents.py`), chunk/embed/index vào `kb.chunks` qua
 * `KbPipeline` (`packages/kb`).
 *
 * Phòng ban chọn khi upload lấy từ `listSections()` (đúng danh sách "phòng ban" thật của tenant,
 * cùng nguồn `EmployeesTab.tsx` dùng để gán role nhân viên) — KHÔNG phải 1 vocab cố định, vì cơ chế
 * fence nội dung thật (`routes/chat.py` → `interpreter.run()` → `kb_search.search`) so khớp
 * `section_role` với tên phòng ban nhân viên được gán, không phải vocab riêng nào.
 *
 * CHƯA có danh sách TỪNG tài liệu / xoá TỪNG tài liệu — `KbPipeline` chưa có `list_documents`/
 * `delete_document`/`get_document` (cần method mới, xem kb#180 gửi team DE phụ trách
 * `packages/kb`). Sau khi upload chỉ hiện banner xác nhận tạm thời, không lưu lại lịch sử ở phía
 * client.
 *
 * CÓ 2 thao tác toàn-tenant (không cần biết doc_id, nên làm được ngay dù chưa có list/get):
 * "Xoá toàn bộ" (`KbPipeline.consent_purge`) và "Re-index toàn bộ" (`KbPipeline.re_index`) — cả
 * 2 hàm đã implement sẵn từ trước, chỉ chưa route nào gọi tới trước route `documents.py` này.
 */

import { useEffect, useState } from "react";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { Card } from "../components/Card";
import { WarningTriangleIcon } from "../icons";
import {
  purgeAllDocuments,
  reindexDocuments,
  uploadDocument,
  type PurgeDocumentsResult,
  type ReindexDocumentsResult,
  type UploadDocumentResult,
} from "./documentsApi";
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

  const [purgeState, setPurgeState] = useState<"idle" | "busy" | "error">("idle");
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeResult, setPurgeResult] = useState<PurgeDocumentsResult | null>(null);

  const [reindexState, setReindexState] = useState<"idle" | "busy" | "error">("idle");
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [reindexResult, setReindexResult] = useState<ReindexDocumentsResult | null>(null);

  useEffect(() => {
    listSections(session)
      .then((s) => {
        setSections(s);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof StudioApiError ? err.message : String(err)));
  }, [session]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !sectionRole) {
      setUploadError("Cần chọn file .md và phòng ban.");
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

  const handlePurge = async () => {
    if (!window.confirm("Xoá TOÀN BỘ tài liệu KB của công ty này? Không thể hoàn tác.")) return;
    setPurgeState("busy");
    setPurgeError(null);
    try {
      const result = await purgeAllDocuments(session);
      setPurgeResult(result);
      setReindexResult(null);
      setPurgeState("idle");
    } catch (err) {
      setPurgeError(err instanceof StudioApiError ? err.message : String(err));
      setPurgeState("error");
    }
  };

  const handleReindex = async () => {
    setReindexState("busy");
    setReindexError(null);
    try {
      const result = await reindexDocuments(session);
      setReindexResult(result);
      setReindexState("idle");
    } catch (err) {
      setReindexError(err instanceof StudioApiError ? err.message : String(err));
      setReindexState("error");
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
            File (.md)
            <input
              type="file"
              accept=".md"
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
            Đã tải lên <code style={{ fontFamily: "var(--font-mono)" }}>{lastResult.doc_id}</code> —{" "}
            {lastResult.chunk_count} đoạn, phòng ban <strong>{lastResult.section_role}</strong>.
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 11, color: "var(--ink-faint)" }}>
          Xem/xoá TỪNG tài liệu sẽ có sau khi backend hỗ trợ — xem{" "}
          <a
            href="https://github.com/AI20K-VGR/agentcore-studio-kit/issues/180"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--ink-faint)" }}
          >
            kb#180
          </a>
          .
        </div>
      </Card>

      <Card title="Quản lý dữ liệu KB (toàn bộ công ty)">
        {purgeState === "error" && purgeError && <ErrorBanner message={purgeError} />}
        {reindexState === "error" && reindexError && <ErrorBanner message={reindexError} />}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <button
              type="button"
              disabled={purgeState === "busy"}
              onClick={handlePurge}
              style={{
                ...inputStyle,
                cursor: "pointer",
                color: "var(--bad)",
                padding: "6px 16px",
              }}
            >
              {purgeState === "busy" ? "Đang xoá…" : "Xoá toàn bộ tài liệu"}
            </button>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
              Xoá SẠCH mọi tài liệu KB đã tải của công ty này — không thể hoàn tác. Dùng khi cần dọn
              sạch dữ liệu (vd yêu cầu xoá dữ liệu theo consent).
            </div>
            {purgeResult && (
              <div style={{ fontSize: 12, color: "var(--good)", marginTop: 6 }}>
                Đã xoá {purgeResult.deleted_count} đoạn.
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              disabled={reindexState === "busy"}
              onClick={handleReindex}
              style={{
                ...inputStyle,
                cursor: "pointer",
                padding: "6px 16px",
              }}
            >
              {reindexState === "busy" ? "Đang re-index…" : "Re-index toàn bộ"}
            </button>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
              Nhúng lại (embedding) toàn bộ tài liệu đã tải, giữ nguyên nội dung/phòng ban — dùng
              sau khi đổi embedding model.
            </div>
            {reindexResult && (
              <div style={{ fontSize: 12, color: "var(--good)", marginTop: 6 }}>
                Đã re-index {reindexResult.chunk_count} đoạn.
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

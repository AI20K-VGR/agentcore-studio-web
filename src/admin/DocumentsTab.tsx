/**
 * Tab "Tài liệu" trong `AdminConsole` — nạp tài liệu vào KB, xem KB đang có, xoá theo lựa chọn.
 *
 * ## Không vẽ giá trị cột DB lên màn hình
 *
 * `DocumentSummary.id` (`kb.chunks.doc_id`) chỉ đi trong body request khi gọi xoá, **không bao giờ
 * được render**. Bản trước hiện thẳng `doc_id` trong một thẻ `<code>` sau khi upload xong; người
 * quản trị công ty không có lý do gì phải đọc giá trị cột trong bảng của hệ thống, và mỗi giá trị
 * kỹ thuật lọt ra giao diện là một thứ họ sẽ chép vào ticket rồi hỏi nó nghĩa là gì.
 *
 * ## Tiến trình: đo được thì hiện số, không đo được thì nói thẳng
 *
 * Nạp một tài liệu là **một** request. Trong đó server còn cắt chunk → embed → ghi `kb.chunks` →
 * sinh lại bộ golden của phòng ban. Chỉ quãng **truyền byte** đo được thật
 * (`XMLHttpRequest.upload.onprogress`); từ byte cuối tới lúc response về là hộp đen, không có kênh
 * nào báo giữa chừng. Nên giao diện chạy thanh phần trăm THẬT cho quãng đầu, rồi đổi sang trạng
 * thái "đang xử lý" cho quãng sau — không chạy một thanh giả để trông cho đẹp. Kết quả từng chặng
 * (số đoạn, số case golden sinh ra, số case người dùng được giữ) hiện SAU khi response về, vì đó là
 * lúc đầu tiên chúng có thật.
 */

import { useCallback, useEffect, useState } from "react";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { Card } from "../components/Card";
import { WarningTriangleIcon } from "../icons";
import {
  deleteDocuments,
  listDocuments,
  uploadDocument,
  type DocumentSummary,
  type UploadDocumentResult,
  type UploadProgress,
} from "./documentsApi";
import { deleteMessage, pruneSelection, stageStates } from "./documentsView";
import GoldenSetCard from "./GoldenSetCard";
import KbDataCard from "./KbDataCard";
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

const buttonStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  background: "var(--tier-admin)",
  color: "#fff",
  border: "none",
  alignSelf: "flex-start",
  padding: "6px 16px",
};

const MAX_UPLOAD_BYTES = 1 * 1024 * 1024;

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
      <WarningTriangleIcon
        size={16}
        style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }}
      />
      <div>{message}</div>
    </div>
  );
}

/** Một chặng trong tiến trình nạp. `percent === null` nghĩa là chặng ĐANG chạy mà không đo được —
 * hiện vạch chạy vô định, không hiện số. Đó là khác biệt cố ý: một con số sai còn tệ hơn không có
 * số, vì người dùng lấy nó để ước lượng thời gian chờ. */
function Stage({
  label,
  state,
  percent,
  detail,
}: {
  label: string;
  state: "wait" | "run" | "done";
  percent?: number | null;
  detail?: string;
}) {
  const color =
    state === "done"
      ? "var(--good)"
      : state === "run"
        ? "var(--tier-admin)"
        : "var(--ink-faint)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color,
        }}
      >
        <span>
          {state === "done" ? "✓ " : state === "run" ? "• " : "  "}
          {label}
        </span>
        {state === "run" && percent != null && <span>{percent}%</span>}
      </div>
      {state === "run" && (
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: "var(--line)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: percent == null ? "40%" : `${percent}%`,
              background: "var(--tier-admin)",
              transition: "width .2s linear",
              animation:
                percent == null
                  ? "acs-indeterminate 1.1s ease-in-out infinite"
                  : undefined,
            }}
          />
        </div>
      )}
      {detail && (
        <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>{detail}</div>
      )}
    </div>
  );
}

export default function DocumentsTab({ session }: { session: Session }) {
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sectionRole, setSectionRole] = useState("");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Tên file GỐC của lần nạp vừa xong. Giữ riêng vì server không lưu tên gốc ở đâu cả — nó chỉ
   * biết `doc_id` đã slug hoá. Đây là chỗ DUY NHẤT biết đúng `"Báo Cáo Q1.docx"`, nên phải chụp lại
   * trước khi xoá `file` khỏi form. */
  const [lastName, setLastName] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<UploadDocumentResult | null>(
    null,
  );

  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);
  const [kbNotice, setKbNotice] = useState<string | null>(null);

  const refreshDocs = useCallback(() => {
    listDocuments(session)
      .then((r) => {
        setDocs(r.documents);
        setTotalChunks(r.total_chunks);
        setKbError(null);
        setSelected((prev) => pruneSelection(prev, r.documents));
      })
      .catch((err) =>
        setKbError(err instanceof StudioApiError ? err.message : String(err)),
      );
  }, [session]);

  useEffect(() => {
    listSections(session)
      .then((s) => {
        setSections(s);
        setLoadError(null);
      })
      .catch((err) =>
        setLoadError(err instanceof StudioApiError ? err.message : String(err)),
      );
    refreshDocs();
  }, [session, refreshDocs]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !sectionRole) {
      setUploadError("Cần chọn file (.md/.txt/.docx) và phòng ban.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(
        `File vượt quá giới hạn ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB.`,
      );
      return;
    }
    const name = file.name;
    setUploadError(null);
    setLastResult(null);
    setProgress({ phase: "uploading", percent: 0 });
    try {
      const result = await uploadDocument(
        file,
        sectionRole,
        session,
        setProgress,
      );
      setLastName(name);
      setLastResult(result);
      setFile(null);
      setProgress(null);
      refreshDocs();
    } catch (err) {
      setUploadError(err instanceof StudioApiError ? err.message : String(err));
      setProgress(null);
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    setKbError(null);
    setKbNotice(null);
    try {
      const r = await deleteDocuments([...selected], session);
      setSelected(new Set());
      setKbNotice(deleteMessage(r));
      refreshDocs();
    } catch (err) {
      setKbError(err instanceof StudioApiError ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const busy = progress !== null;
  const stages = stageStates(progress);

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "24px 20px 48px",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Hai cột trên màn rộng, một cột khi hẹp. `auto-fit` + `minmax` chứ không media query: bố
          cục gãy theo bề rộng THẬT của khung chứa, nên đúng cả khi trang bị nhúng vào layout hẹp
          hơn sau này. Cột trái là VIỆC (nạp tài liệu, tạo bộ câu hỏi), cột phải là TRẠNG THÁI (KB
          đang có gì): làm bên trái, thấy kết quả đổi bên phải, không phải cuộn qua lại. Bản trước
          xếp dọc trong một cột 640px nên trên màn rộng vừa trống vừa bắt cuộn. */}
      <style>{`
        @keyframes acs-indeterminate{0%{margin-left:0}50%{margin-left:60%}100%{margin-left:0}}
        .acs-doc-grid{display:grid;gap:18px;align-items:start;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
      `}</style>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          Tài liệu &amp; bộ câu hỏi kiểm thử
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-faint)",
            marginTop: 4,
            lineHeight: 1.7,
            maxWidth: 720,
          }}
        >
          Nạp tài liệu của công ty để agent có nội dung trả lời. Mỗi lần nạp, hệ
          thống tự dựng lại <strong>bộ câu hỏi kiểm thử</strong> của phòng ban
          đó — bộ này dùng để chấm agent trước khi cho phép publish, nên nó
          quyết định agent có được đưa vào dùng thật hay không.
        </div>
      </div>

      <div className="acs-doc-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card title="Tải tài liệu lên">
            {loadError && (
              <ErrorBanner
                message={`Không tải được danh sách phòng ban: ${loadError}`}
              />
            )}
            {sections.length === 0 && !loadError && (
              <ErrorBanner message="Tenant chưa có phòng ban nào — tạo phòng ban ở tab Nhân viên trước khi tải tài liệu." />
            )}
            {uploadError && <ErrorBanner message={uploadError} />}

            <form
              onSubmit={handleUpload}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <label
                style={{
                  fontSize: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                File (.md/.txt/.docx)
                <input
                  type="file"
                  accept=".md,.txt,.docx"
                  disabled={busy}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={inputStyle}
                />
              </label>
              <label
                style={{
                  fontSize: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                Phòng ban
                <select
                  value={sectionRole}
                  disabled={busy}
                  onChange={(e) => setSectionRole(e.target.value)}
                  style={inputStyle}
                >
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
                disabled={busy || sections.length === 0}
                style={buttonStyle}
              >
                {busy ? "Đang xử lý…" : "Tải lên"}
              </button>
            </form>

            {busy && (
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <Stage
                  label="Đang gửi tài liệu"
                  state={stages.sending.state}
                  percent={stages.sending.percent}
                />
                <Stage
                  label="Máy chủ đang xử lý"
                  state={stages.processing.state}
                  percent={stages.processing.percent}
                  detail={
                    stages.processing.state === "run"
                      ? "Tách đoạn, tạo chỉ mục, rồi dựng lại bộ câu hỏi kiểm thử của phòng ban."
                      : undefined
                  }
                />
              </div>
            )}

            {lastResult && lastName && (
              <div
                style={{
                  marginTop: 16,
                  fontSize: 12,
                  border: "1px solid var(--good)",
                  borderRadius: 8,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ color: "var(--good)" }}>
                  ✓ Đã tải lên <strong>{lastName}</strong> —{" "}
                  {lastResult.chunk_count} đoạn, phòng ban{" "}
                  <strong>{lastResult.section_role}</strong>.
                </div>
                <div style={{ color: "var(--ink-faint)" }}>
                  ✓ Đã dựng lại bộ câu hỏi kiểm thử của phòng ban:{" "}
                  <strong>{lastResult.golden_n_cases}</strong> câu
                  {lastResult.golden_n_human > 0 && (
                    <>
                      {" "}
                      (giữ nguyên <strong>
                        {lastResult.golden_n_human}
                      </strong>{" "}
                      câu bạn đã tự sửa)
                    </>
                  )}
                  .
                </div>
              </div>
            )}
          </Card>

          <GoldenSetCard
            session={session}
            sections={sections.map((s) => s.name)}
            tenant={session.tenantName}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <KbDataCard
            documents={docs}
            totalChunks={totalChunks}
            selected={selected}
            onSelectedChange={setSelected}
            onDelete={handleDelete}
            deleting={deleting}
            notice={kbNotice}
            error={kbError && `Không tải được danh sách: ${kbError}`}
          />
        </div>
      </div>
    </div>
  );
}

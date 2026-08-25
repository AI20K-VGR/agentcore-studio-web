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
import {
  readGoldenSetFile,
  uploadGoldenSet,
  type UploadGoldenSetResult,
} from "./goldenSetsApi";
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

  const [goldenFile, setGoldenFile] = useState<File | null>(null);
  const [goldenRef, setGoldenRef] = useState("");
  const [goldenBusy, setGoldenBusy] = useState(false);
  const [goldenError, setGoldenError] = useState<string | null>(null);
  const [goldenResult, setGoldenResult] =
    useState<UploadGoldenSetResult | null>(null);

  const refreshDocs = useCallback(() => {
    listDocuments(session)
      .then((r) => {
        setDocs(r.documents);
        setTotalChunks(r.total_chunks);
        setKbError(null);
        // Bỏ khỏi vùng chọn những id không còn tồn tại — nếu không, một lần xoá sau đó sẽ gửi lên
        // id ma và người dùng nhận `not_found` cho thứ họ không hề tích.
        setSelected(
          (prev) =>
            new Set(
              [...prev].filter((id) => r.documents.some((d) => d.id === id)),
            ),
        );
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

  const handleGoldenUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goldenFile || !goldenRef.trim()) {
      setGoldenError("Cần chọn file .json và nhập tên bộ.");
      return;
    }
    setGoldenBusy(true);
    setGoldenError(null);
    setGoldenResult(null);
    try {
      const cases = await readGoldenSetFile(goldenFile);
      setGoldenResult(await uploadGoldenSet(goldenRef.trim(), cases, session));
      setGoldenFile(null);
    } catch (err) {
      setGoldenError(err instanceof StudioApiError ? err.message : String(err));
    } finally {
      setGoldenBusy(false);
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
      // `not_found` phải được nói ra. Dòng ghi trước khi `kb.chunks` có cột `doc_id` không xoá được
      // qua đường này — báo "đã xoá" trong khi tài liệu còn nguyên là kiểu im lặng tệ nhất.
      setKbNotice(
        r.not_found.length === 0
          ? `Đã xoá ${r.deleted_documents.length} tài liệu (${r.deleted_chunks} đoạn).`
          : `Đã xoá ${r.deleted_documents.length} tài liệu (${r.deleted_chunks} đoạn). ${r.not_found.length} tài liệu KHÔNG xoá được — đây là dữ liệu nạp từ trước khi hệ thống hỗ trợ xoá theo tài liệu.`,
      );
      refreshDocs();
    } catch (err) {
      setKbError(err instanceof StudioApiError ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const busy = progress !== null;
  const uploading = progress?.phase === "uploading";
  const processing = progress?.phase === "processing";

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "24px 20px",
        fontFamily: "var(--font-body)",
      }}
    >
      <style>{`@keyframes acs-indeterminate{0%{margin-left:0}50%{margin-left:60%}100%{margin-left:0}}`}</style>

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
              state={uploading ? "run" : "done"}
              percent={progress?.percent ?? 0}
            />
            <Stage
              label="Máy chủ đang xử lý"
              state={processing ? "run" : "wait"}
              percent={null}
              detail={
                processing
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
                  (giữ nguyên <strong>{lastResult.golden_n_human}</strong> câu
                  bạn đã tự sửa)
                </>
              )}
              .
            </div>
          </div>
        )}
      </Card>

      <Card title="Bộ câu hỏi kiểm thử tự nhập">
        {goldenError && <ErrorBanner message={goldenError} />}
        <div
          style={{
            fontSize: 11,
            color: "var(--ink-faint)",
            marginBottom: 10,
            lineHeight: 1.6,
          }}
        >
          Nạp bộ câu hỏi của riêng bạn. Câu trùng với bộ máy tự sinh sẽ được{" "}
          <strong>thay bằng bản của bạn</strong>; phần còn lại của bộ cũ giữ
          nguyên — không xoá trắng.
        </div>
        <form
          onSubmit={handleGoldenUpload}
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
            Tên bộ
            <input
              value={goldenRef}
              disabled={goldenBusy}
              onChange={(e) => setGoldenRef(e.target.value)}
              placeholder="vd: kb-hr-auto-v1"
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
            File (.json)
            <input
              type="file"
              accept=".json"
              disabled={goldenBusy}
              onChange={(e) => setGoldenFile(e.target.files?.[0] ?? null)}
              style={inputStyle}
            />
          </label>
          <button type="submit" disabled={goldenBusy} style={buttonStyle}>
            {goldenBusy ? "Đang hợp nhất…" : "Nạp bộ câu hỏi"}
          </button>
        </form>

        {goldenResult && (
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              border: "1px solid var(--good)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ color: "var(--good)", marginBottom: 6 }}>
              ✓ Đã hợp nhất xong.
            </div>
            <div style={{ color: "var(--ink-faint)", lineHeight: 1.7 }}>
              Nạp lên <strong>{goldenResult.n_uploaded}</strong> câu · giữ lại{" "}
              <strong>{goldenResult.n_kept_from_existing}</strong> câu của bộ cũ
              · bộ hiện có <strong>{goldenResult.n_case}</strong> câu, trong đó{" "}
              <strong>{goldenResult.n_traps}</strong> câu kiểm hàng rào.
            </div>
          </div>
        )}
      </Card>

      <Card title="Dữ liệu KB hiện có">
        {kbError && <ErrorBanner message={kbError} />}
        {kbNotice && (
          <div
            style={{
              fontSize: 12,
              marginBottom: 12,
              color: "var(--ink)",
              lineHeight: 1.6,
            }}
          >
            {kbNotice}
          </div>
        )}

        <div style={{ fontSize: 12, marginBottom: 10 }}>
          <strong>{docs.length}</strong> tài liệu ·{" "}
          <strong>{totalChunks}</strong> đoạn đang dùng để trả lời.
        </div>

        {docs.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>
            Chưa có tài liệu nào.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            >
              {docs.map((d, i) => (
                <label
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    fontSize: 12,
                    borderTop: i === 0 ? "none" : "1px solid var(--line)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(d.id);
                        else next.delete(d.id);
                        return next;
                      })
                    }
                  />
                  <span style={{ flex: 1 }}>{d.name}</span>
                  <span style={{ color: "var(--ink-faint)" }}>
                    {d.section_role}
                  </span>
                  <span
                    style={{
                      color: "var(--ink-faint)",
                      minWidth: 56,
                      textAlign: "right",
                    }}
                  >
                    {d.chunk_count} đoạn
                  </span>
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={handleDelete}
              disabled={selected.size === 0 || deleting}
              style={{
                ...inputStyle,
                marginTop: 12,
                cursor: selected.size === 0 ? "not-allowed" : "pointer",
                color: "var(--bad)",
                padding: "6px 16px",
              }}
            >
              {deleting ? "Đang xoá…" : `Xoá ${selected.size} tài liệu đã chọn`}
            </button>
          </>
        )}
      </Card>
    </div>
  );
}

/**
 * Khung "Bộ câu hỏi kiểm thử" — ba cách tạo, người dùng chọn theo nhu cầu.
 *
 * **Vì sao ba chứ không một.** Người dùng ở đây là dân nghiệp vụ, không phải kỹ sư. Bản trước chỉ
 * có một đường: nạp file `.json`. Đó là đường **duy nhất** mà một người không biết JSON không dùng
 * được — và nó cũng là đường dễ sai nhất (đã thấy ngay lúc thử tay: người dùng chọn nhầm một file
 * `.json` khác trong máy và nhận về một thông báo lỗi nói về "mảng case").
 *
 * - **Tự động** — không gõ gì, dựng lại toàn bộ từ tài liệu đã nạp.
 * - **Nhập tay** — form bốn ô, không cần biết `GoldenCase` là gì.
 * - **Tải file** — kèm nút **tải file mẫu đã điền sẵn**, để "tự tạo rồi nạp lên" không còn nghĩa
 *   là "tự đoán hình dạng JSON".
 *
 * Ba cách **không loại trừ nhau**: bộ máy sinh + câu gõ tay sống chung trong cùng một bộ, vì cả
 * đường nạp lẫn đường dựng lại đều **giữ** case `source="human"`.
 */

import { useEffect, useState } from "react";
import type { Session } from "../auth/session";
import { Card } from "../components/Card";
import { WarningTriangleIcon } from "../icons";
import {
  goldenSetTemplate,
  readGoldenSetFile,
  regenerateGoldenSet,
  toGoldenCase,
  uploadGoldenSet,
  type DraftCase,
} from "./goldenSetsApi";
import { StudioApiError } from "../httpUtil";

type Mode = "auto" | "manual" | "file";

const input: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12,
  borderRadius: 5,
  border: "1px solid var(--line-strong)",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
  width: "100%",
};

const primary: React.CSSProperties = {
  ...input,
  width: "auto",
  cursor: "pointer",
  background: "var(--tier-admin)",
  color: "#fff",
  border: "none",
  padding: "7px 16px",
};

const ghost: React.CSSProperties = { ...input, width: "auto", cursor: "pointer", padding: "7px 14px" };

function emptyDraft(role: string): DraftCase {
  return { query: "", expected: "", askingRole: role, answerRole: role };
}

export default function GoldenSetCard({
  session,
  sections,
  tenant,
}: {
  session: Session;
  sections: string[];
  tenant: string;
}) {
  const [mode, setMode] = useState<Mode>("auto");
  const [role, setRole] = useState(sections[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftCase[]>([emptyDraft(sections[0] ?? "")]);

  // `sections` về SAU khi component mount (`listSections` là một request), mà initializer của
  // `useState` chỉ chạy ở lần render đầu — nên `role` và hai ô phòng ban của dòng nháp đầu tiên
  // **chắc chắn** khởi tạo rỗng, bất kể API trả nhanh cỡ nào. Không có bước đồng bộ này thì người
  // dùng điền hai ô chữ rồi bấm Lưu là gửi thẳng `section_roles: [""]` lên backend — đúng vào
  // luồng "form 4 ô" mà PR này dựng ra (review web#27, Dozyboy).
  //
  // Chỉ điền vào ô đang RỖNG, không ghi đè lựa chọn người dùng đã đổi: `sections` có thể nạp lại
  // (đổi tenant, thêm phòng ban) và lúc đó reset ô họ vừa chọn là mất việc đang làm.
  useEffect(() => {
    const first = sections[0];
    if (!first) return;
    setRole((r) => r || first);
    setDrafts((ds) =>
      ds.map((d) => ({
        ...d,
        askingRole: d.askingRole || first,
        answerRole: d.answerRole || first,
      })),
    );
  }, [sections]);
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState("");

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await fn());
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAuto = () =>
    run(async () => {
      const r = await regenerateGoldenSet(role, session);
      return `Đã dựng lại bộ của phòng ${role}: ${r.n_cases} câu (${r.n_ai} máy tạo${
        r.n_human > 0 ? `, giữ nguyên ${r.n_human} câu bạn tự viết` : ""
      }).`;
    });

  const handleManual = () =>
    run(async () => {
      const filled = drafts.filter((d) => d.query.trim() && d.expected.trim());
      if (filled.length === 0) throw new StudioApiError("Cần điền ít nhất một câu hỏi kèm đáp án.");
      // Chặn ở đây chứ không chỉ dựa vào `useEffect` ở trên: nếu tenant chưa có phòng ban nào thì
      // không có gì để đồng bộ, và một case mang `section_roles: [""]` đi tới backend là dữ liệu
      // hỏng nằm im trong bộ chấm — không lỗi, không cảnh báo, chỉ sai lúc chấm điểm.
      if (filled.some((d) => !d.askingRole || !d.answerRole)) {
        throw new StudioApiError("Mỗi câu cần chọn phòng ban cho cả người hỏi lẫn nơi chứa đáp án.");
      }
      // KHÔNG đọc `ref` ở đây (review web#27, Dozyboy, đợt 2, mục 4). Ô "Tên bộ" chỉ tồn tại
      // trong tab "Tải file lên", nhưng state thì dùng chung: gõ tên ở tab đó rồi chuyển sang
      // "Nhập tay" mà không nạp file, câu gõ tay sẽ âm thầm bay vào một bộ khác — không có gì
      // trên màn hình nói vì sao. Tab này luôn nhắm bộ của phòng ban người hỏi.
      const target = `kb-${filled[0].askingRole}-auto-v1`;
      const r = await uploadGoldenSet(
        target,
        filled.map((d, i) => toGoldenCase(d, tenant, i)),
        session,
      );
      // Chỉ bỏ ĐÚNG những dòng vừa gửi đi, không thay cả mảng bằng một dòng trống: người dùng bấm
      // "+ Thêm câu" trong lúc request đang chạy thì dòng mới đó cũng bị xoá, không cảnh báo
      // (review web#27, Dozyboy, đợt 2, mục 5). `busy` cũng đã khoá các ô nhập, nhưng cách này
      // đúng kể cả khi khoá đó bị gỡ về sau.
      const sent = new Set(filled);
      setDrafts((ds) => {
        const remaining = ds.filter((d) => !sent.has(d));
        return remaining.length > 0 ? remaining : [emptyDraft(role)];
      });
      return `Đã lưu ${r.n_uploaded} câu vào bộ "${target}" — bộ giờ có ${r.n_case} câu (giữ ${r.n_kept_from_existing} câu sẵn có).`;
    });

  const handleFile = () =>
    run(async () => {
      if (!file) throw new StudioApiError("Chưa chọn file.");
      const target = ref.trim() || `kb-${role}-auto-v1`;
      const r = await uploadGoldenSet(target, await readGoldenSetFile(file), session);
      setFile(null);
      return `Đã nạp ${r.n_uploaded} câu vào bộ "${target}" — bộ giờ có ${r.n_case} câu (giữ ${r.n_kept_from_existing} câu sẵn có).`;
    });

  const downloadTemplate = () => {
    const blob = new Blob([goldenSetTemplate(tenant, sections)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mau-bo-cau-hoi.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const tab = (m: Mode, label: string, hint: string) => (
    <button
      key={m}
      type="button"
      onClick={() => {
        setMode(m);
        setError(null);
        setResult(null);
      }}
      style={{
        flex: 1,
        textAlign: "left",
        padding: "9px 12px",
        fontSize: 12,
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        border: `1px solid ${mode === m ? "var(--tier-admin)" : "var(--line-strong)"}`,
        background: mode === m ? "var(--tier-admin)" : "var(--surface)",
        color: mode === m ? "#fff" : "var(--ink)",
      }}
    >
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{hint}</div>
    </button>
  );

  return (
    <Card title="Bộ câu hỏi kiểm thử">
      <div style={{ fontSize: 11, color: "var(--ink-faint)", lineHeight: 1.7, marginBottom: 12 }}>
        Đây là bộ câu dùng để chấm agent trước khi cho phép publish. Ba cách dưới đây{" "}
        <strong>dùng chung được</strong> — câu bạn tự viết luôn được giữ lại khi bộ máy tạo được dựng lại.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {tab("auto", "Tự động", "Máy tạo từ tài liệu")}
        {tab("manual", "Nhập tay", "Gõ thẳng trên đây")}
        {tab("file", "Tải file lên", "Có sẵn file mẫu")}
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            gap: 10,
            border: "1px solid var(--warn)",
            background: "var(--warn-soft)",
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          <WarningTriangleIcon size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
          <div>{error}</div>
        </div>
      )}
      {result && (
        <div
          style={{
            border: "1px solid var(--good)",
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            color: "var(--good)",
            marginBottom: 12,
          }}
        >
          ✓ {result}
        </div>
      )}

      {mode === "auto" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.7 }}>
            Đọc lại toàn bộ tài liệu của một phòng ban rồi dựng bộ câu hỏi từ đầu — gồm cả câu{" "}
            <strong>bẫy</strong> để kiểm hàng rào giữa các phòng ban. Không cần gõ gì.
          </div>
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4, maxWidth: 260 }}>
            Phòng ban
            <select value={role} onChange={(e) => setRole(e.target.value)} style={input} disabled={busy}>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleAuto} disabled={busy || !role} style={primary}>
            {busy ? "Đang dựng…" : "Dựng lại toàn bộ"}
          </button>
        </div>
      )}

      {mode === "manual" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.7 }}>
            Mỗi dòng là một câu hỏi. Nếu <strong>phòng ban chứa đáp án</strong> khác{" "}
            <strong>phòng ban của người hỏi</strong>, đó là câu <strong>bẫy</strong> — agent phải từ chối trả lời.
          </div>

          {drafts.map((d, i) => (
            <div
              key={i}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-faint)" }}>
                <span>Câu {i + 1}</span>
                {d.askingRole !== d.answerRole && <strong style={{ color: "var(--warn)" }}>câu bẫy</strong>}
              </div>
              <input
                placeholder="Câu hỏi — ví dụ: Nhân viên chính thức được bao nhiêu ngày phép năm?"
                value={d.query}
                style={input}
                disabled={busy}
                onChange={(e) =>
                  setDrafts(drafts.map((x, j) => (i === j ? { ...x, query: e.target.value } : x)))
                }
              />
              <input
                placeholder="Đáp án đúng — ví dụ: 12 ngày"
                value={d.expected}
                style={input}
                disabled={busy}
                onChange={(e) =>
                  setDrafts(drafts.map((x, j) => (i === j ? { ...x, expected: e.target.value } : x)))
                }
              />
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ fontSize: 11, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                  Người hỏi thuộc phòng
                  <select
                    value={d.askingRole}
                    style={input}
                    onChange={(e) =>
                      setDrafts(drafts.map((x, j) => (i === j ? { ...x, askingRole: e.target.value } : x)))
                    }
                  >
                    {sections.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 11, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                  Đáp án nằm ở phòng
                  <select
                    value={d.answerRole}
                    style={input}
                    onChange={(e) =>
                      setDrafts(drafts.map((x, j) => (i === j ? { ...x, answerRole: e.target.value } : x)))
                    }
                  >
                    {sections.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                {drafts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                    style={{ ...ghost, alignSelf: "flex-end", color: "var(--bad)" }}
                  >
                    Xoá
                  </button>
                )}
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setDrafts([...drafts, emptyDraft(role)])}
              disabled={busy}
              style={ghost}
            >
              + Thêm câu
            </button>
            <button type="button" onClick={handleManual} disabled={busy || sections.length === 0} style={primary}>
              {busy ? "Đang lưu…" : "Lưu vào bộ câu hỏi"}
            </button>
          </div>
        </div>
      )}

      {mode === "file" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.7 }}>
            Chưa biết file cần trông thế nào? Tải file mẫu về, sửa nội dung trong đó rồi nạp lại — cấu trúc đã
            đúng sẵn, kèm chú thích tiếng Việt ngay trong file.
          </div>
          {/* Câu này từng có ở bản trước rồi bị xoá trong lần dựng lại card mà không thay bằng gì
              (review web#27, Dozyboy, đợt 2, mục 7). Nạp một file nhỏ mà tưởng mình vừa xoá trắng
              cả bộ là hiểu nhầm đắt: người dùng sẽ không dám nạp bổ sung nữa. */}
          <div style={{ fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.7 }}>
            Nạp thêm <strong>không xoá trắng</strong> bộ đang có: câu nào trùng sẽ được thay bằng bản trong file
            của bạn, phần còn lại giữ nguyên.
          </div>
          <button type="button" onClick={downloadTemplate} style={ghost}>
            ⭳ Tải file mẫu (.json)
          </button>
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            File (.json)
            <input
              type="file"
              accept=".json"
              style={input}
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4, maxWidth: 320 }}>
            Tên bộ (để trống thì dùng bộ của phòng ban đang chọn)
            <input
              value={ref}
              placeholder={`kb-${role}-auto-v1`}
              style={input}
              disabled={busy}
              onChange={(e) => setRef(e.target.value)}
            />
          </label>
          {sections.length === 0 && !ref.trim() && (
            <div style={{ fontSize: 11, color: "var(--warn)" }}>
              Công ty chưa có phòng ban nào — gõ "Tên bộ" ở trên, hoặc nhờ superadmin tạo phòng ban trước.
            </div>
          )}
          {/* `!file` và điều kiện tên bộ: hai tab kia đều có hàng rào riêng (`!role` ở "auto",
              `sections.length === 0` ở "Nhập tay"), tab này thì không — nên công ty chưa có phòng
              ban nào mà để trống "Tên bộ" sẽ gửi đi bộ tên `kb--auto-v1`, sai định dạng, không ai
              chặn (review web#27, Dozyboy, đợt 2, mục 6). */}
          <button type="button" onClick={handleFile} disabled={busy || !file || (!ref.trim() && !role)} style={primary}>
            {busy ? "Đang nạp…" : "Nạp bộ câu hỏi"}
          </button>
        </div>
      )}
    </Card>
  );
}

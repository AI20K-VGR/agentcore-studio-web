/**
 * Danh sách bộ golden của tenant, mở ra xem được từng case.
 *
 * Trước card này `eval.golden_sets` chỉ có đường GHI (nạp tay, sinh lại) và đường đọc-lúc-chấm —
 * **không có đường nào để người dùng nhìn thấy bộ của chính họ**. Thiếu sót đó không dừng ở tiện
 * nghi: bấm Chấm điểm ra `FAIL 0.35` thì không có cách nào phân biệt *"agent trả lời kém"* với
 * *"bộ câu hỏi tự sinh đang hỏi những thứ vô nghĩa"*, mà hai kết luận đó dẫn tới hai việc phải làm
 * hoàn toàn khác nhau.
 *
 * Card CỐ Ý không cho sửa gì: nó là cửa sổ đọc. Đường sửa đã có (`GoldenSetCard` — nạp tay và sinh
 * lại), và gộp đọc với sửa vào một chỗ sẽ làm mờ ranh giới giữa "bộ máy sinh" và "bộ người viết",
 * đúng thứ nhãn `source` tồn tại để giữ rõ.
 */
import { useCallback, useEffect, useState } from "react";

import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { Card } from "../components/Card";
import { fetchGoldenSet, listGoldenSets, type GoldenCaseView, type GoldenSetDetail, type GoldenSetSummary } from "./goldenSetsApi";

const hintStyle: React.CSSProperties = { fontSize: 11, color: "var(--ink-faint)", lineHeight: 1.7 };

function errorText(err: unknown): string {
  return err instanceof StudioApiError ? err.message : String(err);
}

/** Nhãn nguồn — `null` hiện "chưa khai" chứ KHÔNG gộp vào "người viết".
 *
 * `source` vắng nghĩa là bộ sinh chưa khai nguồn (`DEC-D16-03`), và đoán hộ ở tầng hiển thị sẽ giấu
 * đúng thứ mặc định `null` tồn tại để lộ ra. */
function sourceLabel(source: string | null): string {
  if (source === "ai") return "máy sinh";
  if (source === "human") return "người viết";
  return "chưa khai";
}

function CaseRow({ item }: { item: GoldenCaseView }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "9px 0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>{item.case_id}</code>
        {item.is_trap && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--warn)",
              border: "1px solid var(--warn)",
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            BẪY
          </span>
        )}
        <span style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>{sourceLabel(item.source)}</span>
        <span style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>· {item.n_citation} trích dẫn kỳ vọng</span>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            marginLeft: "auto",
            fontSize: 11,
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
          }}
        >
          {open ? "thu gọn" : "chi tiết"}
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 4, lineHeight: 1.6 }}>{item.query}</div>
      {open && (
        <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: "2px solid var(--line)" }}>
          <div style={hintStyle}>
            Đáp án kỳ vọng — bộ chấm tính là ĐÚNG khi câu trả lời của agent CHỨA nguyên cụm này:
          </div>
          <div style={{ fontSize: 12, color: "var(--ink)", whiteSpace: "pre-wrap", margin: "4px 0 8px" }}>
            {item.expected || "(rỗng)"}
          </div>
          <div style={hintStyle}>
            Người hỏi ở vai <strong>{item.section_roles.join(", ") || "—"}</strong>, đáp án nằm ở vai{" "}
            <strong>{item.expected_section_role}</strong>.
          </div>
          {item.citations.length > 0 && (
            <div style={{ ...hintStyle, marginTop: 6 }}>
              Trích dẫn kỳ vọng:{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{item.citations.join(", ")}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GoldenSetListCard({ session, reloadKey }: { session: Session; reloadKey?: number }) {
  const [rows, setRows] = useState<GoldenSetSummary[]>([]);
  // Tách khỏi `rows.length === 0`: "chưa tải xong" và "tenant chưa có bộ nào" đều cho mảng rỗng, và
  // gộp chúng lại sẽ hiện "chưa có bộ nào" ngay trong khung hình đầu — sai với tenant CÓ bộ.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [detail, setDetail] = useState<GoldenSetDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listGoldenSets(session)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `reloadKey` để cha ép tải lại sau khi nạp tay/sinh lại — không tự dò, vì card này không biết
    // gì về hai luồng đó và một `setInterval` chỉ để bắt kịp một hành động của chính người dùng là
    // đổi một lần bấm lấy một vòng lặp chạy mãi.
  }, [session, reloadKey]);

  const toggle = useCallback(
    async (ref: string) => {
      if (openRef === ref) {
        setOpenRef(null);
        setDetail(null);
        return;
      }
      setOpenRef(ref);
      setDetail(null);
      setDetailError(null);
      try {
        setDetail(await fetchGoldenSet(ref, session));
      } catch (err) {
        setDetailError(errorText(err));
      }
    },
    [openRef, session],
  );

  return (
    <Card title="Bộ câu hỏi chấm điểm">
      <div style={{ ...hintStyle, marginBottom: 12 }}>
        Mỗi phòng ban có tài liệu sẽ có một bộ <code style={{ fontFamily: "var(--font-mono)" }}>kb-&lt;phòng ban&gt;-auto-v1</code>{" "}
        sinh tự động. Đây là bộ mà nút Chấm điểm dùng — mở ra xem để biết điểm thấp là do agent hay
        do câu hỏi.
      </div>

      {loading && <div style={hintStyle}>Đang tải…</div>}
      {!loading && error && <div style={{ fontSize: 12, color: "var(--bad)" }}>{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div style={hintStyle}>
          Chưa có bộ nào. Tải một tài liệu lên và gán phòng ban — bộ câu hỏi sẽ được sinh ngay sau đó.
        </div>
      )}

      {!loading &&
        !error &&
        rows.map((row) => (
          <div key={row.golden_set_ref} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "baseline",
                padding: "8px 0",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>
                {row.golden_set_ref}
              </code>
              <span style={hintStyle}>
                {row.n_cases} case · {row.n_ai} máy sinh · {row.n_human} người viết · {row.n_trap} bẫy
              </span>
              <button
                onClick={() => void toggle(row.golden_set_ref)}
                style={{
                  marginLeft: "auto",
                  fontSize: 11.5,
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                }}
              >
                {openRef === row.golden_set_ref ? "đóng" : "xem case"}
              </button>
            </div>

            {openRef === row.golden_set_ref && (
              <div style={{ paddingLeft: 4 }}>
                {detailError && <div style={{ fontSize: 12, color: "var(--bad)", padding: "8px 0" }}>{detailError}</div>}
                {!detailError && !detail && <div style={{ ...hintStyle, padding: "8px 0" }}>Đang tải case…</div>}
                {detail?.cases.map((item) => (
                  <CaseRow key={item.case_id} item={item} />
                ))}
              </div>
            )}
          </div>
        ))}
    </Card>
  );
}

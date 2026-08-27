/**
 * Bảng điểm dạng ĐỌC ĐƯỢC — hai nấc, kèm lý do, thay cho ba con số.
 *
 * Bản cũ in đúng một dòng `verdict=FAIL · success_rate=0.00 · citation_accuracy=0.00`. Dòng đó
 * không phân biệt nổi ba tình huống dẫn tới ba việc sửa khác hẳn nhau: hàng rào bị thủng, agent
 * không có quyền tra KB, hay bộ câu hỏi đòi sai. Đã đo trên hệ thật — `0.00` là do recipe thiếu
 * `kb_search`, và phải truy thẳng vào DB mới biết.
 */
import { useState } from "react";

import type { Scorecard } from "./api";
import { scorecardBreakdown, type OutcomeGroup } from "./scorecardBreakdown";

const SEVERITY_COLOR = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" } as const;

function Tier({ label, passed, total, note }: { label: string; passed: number; total: number; note?: string }) {
  // Không có case nào ở nấc này thì nói thẳng, thay vì hiện "0/0" — một tỷ lệ không có mẫu số đọc
  // như thất bại, trong khi sự thật là bộ câu hỏi không có case loại đó để đo.
  const empty = total === 0;
  const ok = !empty && passed === total;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, color: "var(--ink-soft)", minWidth: 132 }}>{label}</span>
      <strong style={{ fontSize: 12.5, color: empty ? "var(--ink-faint)" : ok ? "var(--good)" : "var(--warn)" }}>
        {empty ? "không có case nào để đo" : `${passed}/${total}`}
      </strong>
      {note && <span style={{ fontSize: 11, color: "var(--bad)" }}>{note}</span>}
    </div>
  );
}

function Group({ group }: { group: OutcomeGroup }) {
  const [open, setOpen] = useState(group.severity === "bad");
  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "7px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: SEVERITY_COLOR[group.severity] }}>{group.label}</span>
        <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>{group.cases.length} case</span>
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
          {open ? "thu gọn" : "xem"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-faint)", lineHeight: 1.6, marginTop: 2 }}>{group.hint}</div>
      {open && (
        <div style={{ marginTop: 6, paddingLeft: 9, borderLeft: "2px solid var(--line)" }}>
          {group.cases.map((item) => (
            <div key={item.case_id} style={{ marginBottom: 7 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink)" }}>{item.expected}</div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>
                agent trả lời: {item.actual?.slice(0, 160) || "(rỗng)"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ScorecardPanel({ scorecard }: { scorecard: Scorecard }) {
  const b = scorecardBreakdown(scorecard);
  const pass = scorecard.gate.verdict === "PASS";

  return (
    <div
      style={{
        marginTop: 6,
        padding: 10,
        borderRadius: 7,
        border: `1px solid ${pass ? "var(--good)" : "var(--warn)"}`,
        background: pass ? "var(--good-soft)" : "var(--warn-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 13, color: pass ? "var(--good)" : "var(--warn)" }}>
          {pass ? "ĐẠT" : "CHƯA ĐẠT"}
        </strong>
        <span style={{ fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
          {scorecard.golden_set_ref}
        </span>
      </div>

      {b.headline && (
        <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.6, marginBottom: 9 }}>{b.headline}</div>
      )}

      <Tier
        label="Hàng rào bảo mật"
        passed={b.fence.passed}
        total={b.fence.total}
        note={b.fence.leaked > 0 ? `${b.fence.leaked} câu bị rò rỉ` : undefined}
      />
      <Tier label="Trả lời đúng" passed={b.answer.passed} total={b.answer.total} />

      <div style={{ marginTop: 8 }}>
        {b.groups.map((group) => (
          <Group key={group.outcome} group={group} />
        ))}
      </div>
    </div>
  );
}

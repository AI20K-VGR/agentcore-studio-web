/**
 * Modal "Mở agent đã publish" — thay tab "Agent đã publish" cũ (`AgentsRollbackTab.tsx`, đã xoá).
 * Chỉ liệt kê agent + version rồi báo lại cho `App.tsx` qua `onOpen` — KHÔNG tự gọi rollback hay
 * nạp gì ở đây, nơi gọi (`App.tsx::loadAgentIntoCanvas`) mới là nơi thật sự đưa version đó lên
 * canvas dưới dạng 1 khung MỚI. "Đưa version lên live" giờ là việc của nút Publish ở sidebar phải
 * (`App.tsx::handlePublish`, nhánh `hasCleanLoadedVersion`), không còn nút Rollback riêng.
 */
import { useEffect, useState } from "react";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { BotIcon, CloseIcon, WarningTriangleIcon } from "../icons";
import { listAgents, listAgentVersions, type AgentSummary, type VersionSummary } from "../agents/api";

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

interface Props {
  session: Session;
  onOpen: (agentId: string, version: number) => void;
  onClose: () => void;
}

export default function OpenAgentModal({ session, onOpen, onClose }: Props) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, VersionSummary[]>>({});
  const [toVersion, setToVersion] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    listAgents(session)
      .then(async (list) => {
        if (cancelled) return;
        setAgents(list);
        // `allSettled` — 1 agent lỗi khi nạp version không được kéo sập cả danh sách agent đã có
        // (cùng lý do đã áp ở `AgentsRollbackTab` cũ, review web#8 TranBaDat2607 #3).
        const settled = await Promise.allSettled(
          list.map(async (a) => [a.agent_id, await listAgentVersions(a.agent_id, session)] as const),
        );
        if (cancelled) return;
        const entries = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
        setVersions(Object.fromEntries(entries));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof StudioApiError ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,36,34,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 96vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--paper)",
          borderRadius: 12,
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-display)", fontWeight: 600 }}>
            Mở agent đã publish
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-soft)" }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {loadError && (
            <p style={{ color: "var(--bad)", fontSize: 12 }} role="alert">
              {loadError}
            </p>
          )}
          {agents.length === 0 && !loadError && (
            <p style={{ fontSize: 12, color: "var(--ink-faint)" }}>Chưa có agent nào được publish.</p>
          )}
          {agents.map((a) => (
            <div
              key={a.agent_id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
                background: "var(--surface-2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600 }}>
                <BotIcon size={15} style={{ color: "var(--tier-admin)" }} />
                <code style={{ fontFamily: "var(--font-mono)" }}>{a.agent_id}</code>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                <select
                  aria-label={`version muốn mở (${a.agent_id})`}
                  value={toVersion[a.agent_id] ?? ""}
                  onChange={(e) => setToVersion((cur) => ({ ...cur, [a.agent_id]: e.target.value }))}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="">— chọn version —</option>
                  {(versions[a.agent_id] ?? []).map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version} — {v.status}
                      {v.version === a.latest_published_version ? " (đang live)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const version = Number(toVersion[a.agent_id]);
                    if (!Number.isInteger(version) || version < 1) return;
                    onOpen(a.agent_id, version);
                  }}
                  disabled={!toVersion[a.agent_id]}
                  style={{
                    ...inputStyle,
                    cursor: toVersion[a.agent_id] ? "pointer" : "default",
                    background: toVersion[a.agent_id] ? "var(--tier-admin)" : "var(--ink-faint)",
                    color: "#fff",
                    border: "none",
                  }}
                >
                  Mở
                </button>
              </div>
              {(versions[a.agent_id] ?? []).length === 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, marginTop: 6, color: "var(--warn)" }}>
                  <WarningTriangleIcon size={12} /> Không nạp được version cho agent này.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

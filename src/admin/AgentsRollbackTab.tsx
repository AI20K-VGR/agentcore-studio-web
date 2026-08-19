/**
 * Tab "Agents" trong `AdminConsole` — liệt kê agent đã publish (`GET /api/agents`) + rollback về
 * version cũ (`POST /api/agents/{agent_id}/rollback`, nối dây `studio_workbench.publish.rollback()`
 * đã implement sẵn). Admin-only ở phía server (`require_admin`).
 */

import { useCallback, useEffect, useState } from "react";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { BotIcon, CheckCircleIcon, WarningTriangleIcon } from "../icons";
import { listAgents, listAgentVersions, rollbackAgent, type AgentSummary, type VersionSummary } from "../agents/api";

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

export default function AgentsRollbackTab({ session }: { session: Session }) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, VersionSummary[]>>({});
  const [toVersion, setToVersion] = useState<Record<string, string>>({});
  const [rollbackState, setRollbackState] = useState<Record<string, "idle" | "running" | "error" | "done">>({});
  const [rollbackMessage, setRollbackMessage] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      const list = await listAgents(session);
      setAgents(list);
      setLoadError(null);
      // Nạp version THẬT cho từng agent (`wb.recipe_versions`) — dropdown chỉ hiện version có
      // thật, không để admin gõ tay số tuỳ ý rồi chờ 404.
      const entries = await Promise.all(
        list.map(async (a) => [a.agent_id, await listAgentVersions(a.agent_id, session)] as const),
      );
      setVersions(Object.fromEntries(entries));
    } catch (err) {
      setLoadError(err instanceof StudioApiError ? err.message : String(err));
    }
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleRollback = async (agentId: string) => {
    const versionStr = toVersion[agentId];
    const version = Number(versionStr);
    if (!versionStr || !Number.isInteger(version) || version < 1) {
      setRollbackState((cur) => ({ ...cur, [agentId]: "error" }));
      setRollbackMessage((cur) => ({ ...cur, [agentId]: "Chọn 1 version để rollback về." }));
      return;
    }
    setRollbackState((cur) => ({ ...cur, [agentId]: "running" }));
    try {
      const result = await rollbackAgent(agentId, version, session);
      setRollbackState((cur) => ({ ...cur, [agentId]: "done" }));
      setRollbackMessage((cur) => ({ ...cur, [agentId]: `Đã rollback về v${result.version}.` }));
      await reload();
    } catch (err) {
      setRollbackState((cur) => ({ ...cur, [agentId]: "error" }));
      setRollbackMessage((cur) => ({
        ...cur,
        [agentId]: err instanceof StudioApiError ? err.message : String(err),
      }));
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 20px", fontFamily: "var(--font-body)" }}>
      <Card title="Agent đã publish">
        {loadError && (
          <p style={{ color: "var(--bad)", fontSize: 12 }} role="alert">
            {loadError}
          </p>
        )}
        {agents.length === 0 && !loadError && (
          <p style={{ fontSize: 12, color: "var(--ink-faint)" }}>Chưa có agent nào được publish.</p>
        )}
        {agents.map((a) => {
          const state = rollbackState[a.agent_id];
          return (
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
                <Badge tone="good">đang live v{a.latest_published_version}</Badge>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                <select
                  aria-label={`version muốn rollback về (${a.agent_id})`}
                  value={toVersion[a.agent_id] ?? ""}
                  onChange={(e) => setToVersion((cur) => ({ ...cur, [a.agent_id]: e.target.value }))}
                  style={{ ...inputStyle, width: 240 }}
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
                  onClick={() => handleRollback(a.agent_id)}
                  disabled={state === "running"}
                  style={{ ...inputStyle, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none" }}
                >
                  {state === "running" ? "Đang rollback…" : "Rollback"}
                </button>
              </div>
              {rollbackMessage[a.agent_id] && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    marginTop: 6,
                    color: state === "error" ? "var(--bad)" : "var(--good)",
                  }}
                >
                  {state === "error" ? <WarningTriangleIcon size={12} /> : <CheckCircleIcon size={12} />}
                  {rollbackMessage[a.agent_id]}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

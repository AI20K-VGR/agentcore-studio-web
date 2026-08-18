/**
 * Màn hình duy nhất của superadmin (Kế hoạch RBAC 3 tầng) — 2 việc, đúng đúng phạm vi role này:
 * (1) tạo công ty mới (`POST /api/admin/companies`), (2) quản "phòng ban" theo tenant
 * (`POST/PATCH/DELETE /api/admin/sections`) — CHỈ superadmin làm được 2 việc này ở phía server.
 *
 * Không có canvas/chat/publish ở đây — superadmin tự có JWT trỏ tenant `__system__`
 * (`scripts/seed_superadmin.py`), RLS trên `wb.recipes`/`kb.chunks` khiến mọi thao tác nghiệp vụ
 * ở tenant đó vô nghĩa (0 dòng dữ liệu thật nào gắn `__system__`).
 */

import { useCallback, useEffect, useState } from "react";
import type { Session } from "../auth/session";
import { BrandBar } from "../components/BrandBar";
import { Card } from "../components/Card";
import { CheckCircleIcon, FolderIcon } from "../icons";
import { StudioApiError } from "../httpUtil";
import { createCompany, listCompanies, type CompanySummary } from "./api";
import {
  createSection,
  deleteSection,
  listSections,
  renameSection,
  type SectionSummary,
} from "../admin/sectionsApi";

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

function CreateCompanyForm({ session, onCreated }: { session: Session; onCreated: () => void }) {
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [lastCompanyName, setLastCompanyName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !adminEmail.trim() || adminPassword.length < 8) {
      setState("error");
      setMessage("Cần tên công ty, email admin, và mật khẩu >= 8 ký tự.");
      return;
    }
    setState("saving");
    setMessage(null);
    try {
      const result = await createCompany(companyName.trim(), adminEmail.trim(), adminPassword, session);
      setState("done");
      // Chỉ hiện tên công ty + email admin — KHÔNG hiện `result.tenant_id` (UUID vô nghĩa với
      // người đọc thông báo này, xem plan thiết kế).
      setLastCompanyName(companyName.trim());
      setMessage(`Đã tạo công ty "${companyName.trim()}" — admin đầu tiên: ${result.admin_email}.`);
      setCompanyName("");
      setAdminEmail("");
      setAdminPassword("");
      onCreated();
    } catch (err) {
      setState("error");
      setMessage(err instanceof StudioApiError ? err.message : String(err));
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 380 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>
        Tên công ty
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="vd: Acme Corp"
          style={{ ...inputStyle, width: "100%", marginTop: 4 }}
        />
      </label>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>
        Email admin đầu tiên
        <input
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="admin@acme.com"
          style={{ ...inputStyle, width: "100%", marginTop: 4 }}
        />
      </label>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>
        Mật khẩu admin (tối thiểu 8 ký tự)
        <input
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          style={{ ...inputStyle, width: "100%", marginTop: 4 }}
        />
      </label>
      {message && (
        <p
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            fontSize: 12,
            margin: 0,
            color: state === "error" ? "var(--bad)" : "var(--good)",
          }}
        >
          {state === "done" && <CheckCircleIcon size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>{message}</span>
        </p>
      )}
      <button
        type="submit"
        disabled={state === "saving"}
        style={{
          ...inputStyle,
          cursor: "pointer",
          width: "fit-content",
          fontWeight: 700,
          color: "#fff",
          background: "var(--accent)",
          border: "none",
          padding: "8px 16px",
        }}
      >
        {state === "saving" ? "Đang tạo…" : "Tạo công ty"}
      </button>
      {lastCompanyName && state === "done" && (
        <p style={{ fontSize: 10.5, color: "var(--ink-faint)", margin: 0 }}>
          Kéo xuống "Phòng ban theo công ty" để tạo phòng ban đầu tiên cho {lastCompanyName}.
        </p>
      )}
    </form>
  );
}

function SectionsManager({ session, tenantId }: { session: Session; tenantId: string }) {
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      setSections(await listSections(session, tenantId));
      setError(null);
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
    }
  }, [session, tenantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createSection(tenantId, newName.trim(), session);
      setNewName("");
      await reload();
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
    }
  };

  const handleRename = async (sectionId: string) => {
    const name = renaming[sectionId];
    if (!name || !name.trim()) return;
    try {
      await renameSection(sectionId, name.trim(), session);
      setRenaming((cur) => ({ ...cur, [sectionId]: "" }));
      await reload();
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
    }
  };

  const handleDelete = async (sectionId: string) => {
    try {
      await deleteSection(sectionId, session);
      await reload();
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
    }
  };

  return (
    <div>
      {error && (
        <p style={{ color: "var(--bad)", fontSize: 12 }} role="alert">
          {error}
        </p>
      )}
      <form onSubmit={handleCreate} style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Tên phòng ban mới"
          style={{ ...inputStyle, width: 200 }}
        />
        <button
          type="submit"
          style={{ ...inputStyle, cursor: "pointer", background: "var(--tier-admin)", color: "#fff", border: "none" }}
        >
          Thêm
        </button>
      </form>
      <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {sections.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "6px 6px" }}>
                <code style={{ fontFamily: "var(--font-mono)" }}>{s.name}</code>
              </td>
              <td style={{ padding: "6px 6px" }}>
                <input
                  value={renaming[s.id] ?? ""}
                  onChange={(e) => setRenaming((cur) => ({ ...cur, [s.id]: e.target.value }))}
                  placeholder="tên mới"
                  style={{ ...inputStyle, width: 130 }}
                />
              </td>
              <td style={{ padding: "6px 6px" }}>
                <button type="button" onClick={() => handleRename(s.id)} style={{ ...inputStyle, cursor: "pointer" }}>
                  Đổi tên
                </button>
              </td>
              <td style={{ padding: "6px 6px" }}>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  style={{ ...inputStyle, cursor: "pointer", color: "var(--bad)" }}
                >
                  Xoá
                </button>
              </td>
            </tr>
          ))}
          {sections.length === 0 && !error && (
            <tr>
              <td colSpan={4} style={{ padding: "10px 6px", color: "var(--ink-faint)" }}>
                Công ty này chưa có phòng ban nào.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function SuperadminConsole({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  const reloadCompanies = useCallback(async () => {
    try {
      const result = await listCompanies(session);
      setCompanies(result);
      setCompaniesError(null);
      if (selectedTenantId === "" && result.length > 0) setSelectedTenantId(result[0].tenant_id);
    } catch (err) {
      setCompaniesError(err instanceof StudioApiError ? err.message : String(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    reloadCompanies();
  }, [reloadCompanies]);

  return (
    <div className="full-viewport-min-height" style={{ background: "var(--paper)" }}>
      <BrandBar
        session={session}
        roleLabel="Superadmin"
        roleTone="var(--accent)"
        subtitle="Vận hành nền tảng"
        onLogout={onLogout}
      />

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px" }}>
        <Card title="Tạo công ty mới">
          <CreateCompanyForm session={session} onCreated={reloadCompanies} />
        </Card>

        <Card title="Phòng ban theo công ty">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--ink-faint)",
              marginBottom: 14,
            }}
          >
            <FolderIcon size={13} />
            Đây là DUY NHẤT nơi tạo/sửa/xoá phòng ban — admin công ty chỉ được xem.
          </div>
          {companiesError && (
            <p style={{ color: "var(--bad)", fontSize: 12 }} role="alert">
              {companiesError}
            </p>
          )}
          {companies.length === 0 && !companiesError && (
            <p style={{ fontSize: 12, color: "var(--ink-faint)" }}>Chưa có công ty nào — tạo 1 công ty ở trên trước.</p>
          )}
          {companies.length > 0 && (
            <>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}>
                Công ty
                <select
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  style={{ ...inputStyle, display: "block", marginTop: 4, width: 280 }}
                >
                  {companies.map((c) => (
                    <option key={c.tenant_id} value={c.tenant_id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTenantId && <SectionsManager session={session} tenantId={selectedTenantId} />}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

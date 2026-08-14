/**
 * Màn hình DUY NHẤT của superadmin (Kế hoạch 3) — tạo công ty mới + admin đầu tiên của công ty đó,
 * gọi `POST /api/admin/companies` (`auth/api.ts::createCompany`). Superadmin không thuộc công ty
 * nào (`core.tenants.name = '__system__'`, xem `apps/studio/scripts/seed_superadmin.py`) nên
 * KHÔNG có canvas/chat nào để dùng — đây là toàn bộ UI của phiên đăng nhập superadmin, không phải
 * 1 tab trong AppShell như `CreateUserForm`.
 *
 * Không tự kiểm quyền ở đây — server luôn validate lại (`require_superadmin`, 403 nếu sai), y hệt
 * `CreateUserForm`.
 */

import { useState } from "react";
import { createCompany, StudioApiError } from "../auth/api";
import { useSession } from "../auth/session";
import { LogoBadge, UserMenu } from "../components/UserMenu";
import { ThemeToggleButton } from "../theme";

export default function CreateCompanyForm() {
  const { session, logout } = useSession();
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ tenantId: string; adminEmail: string } | null>(null);

  if (session === null) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !adminEmail.trim()) {
      setError("Cần nhập tên công ty và email admin.");
      setState("error");
      return;
    }
    if (adminPassword.length < 8) {
      setError("Mật khẩu tối thiểu 8 ký tự.");
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    try {
      const result = await createCompany(session.accessToken, companyName.trim(), adminEmail.trim(), adminPassword);
      setLastCreated({ tenantId: result.tenant_id, adminEmail: result.admin_email });
      setCompanyName("");
      setAdminEmail("");
      setAdminPassword("");
      setState("done");
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
      setState("error");
    }
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 6,
  };
  const inputStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "var(--font-mono)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    outline: "none",
  };

  return (
    <div style={{ minHeight: "100%", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 20px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoBadge />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
            AgentCore Studio — Superadmin
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeToggleButton />
          <UserMenu session={session} onLogout={logout} roleLabel="superadmin" />
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px", width: "100%", boxSizing: "border-box" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
          Tạo công ty mới
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, marginBottom: 24, lineHeight: 1.55 }}>
          Tạo 1 công ty (tenant) mới + tài khoản admin đầu tiên của công ty đó. Admin này sau đó tự
          tạo tài khoản nhân viên cho công ty mình, không cần superadmin can thiệp thêm.
        </p>

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Tên công ty</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="vd: acme-corp"
            style={inputStyle}
          />

          <label style={{ ...labelStyle, marginTop: 14 }}>Email admin đầu tiên</label>
          <input
            type="text"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="vd: admin@acme-corp.com"
            style={inputStyle}
          />

          <label style={{ ...labelStyle, marginTop: 14 }}>Mật khẩu admin</label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="tối thiểu 8 ký tự"
            style={inputStyle}
          />

          {error && (
            <p style={{ color: "var(--danger-text)", fontSize: 12, marginTop: 10, marginBottom: 0 }} role="alert">
              {error}
            </p>
          )}
          {state === "done" && lastCreated && (
            <p style={{ color: "var(--accent)", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
              Đã tạo công ty (tenant {lastCreated.tenantId}) — admin: {lastCreated.adminEmail}.
            </p>
          )}

          <button
            type="submit"
            disabled={state === "loading"}
            className="btn-switch"
            style={{
              marginTop: 18,
              width: "100%",
              padding: "11px 12px",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              color: "#fff",
              background: state === "loading" ? "#93a5e8" : "var(--accent)",
              border: "none",
              borderRadius: 8,
            }}
          >
            {state === "loading" ? "Đang tạo…" : "Tạo công ty"}
          </button>
        </form>
      </div>
    </div>
  );
}

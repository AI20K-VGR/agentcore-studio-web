/**
 * Tab "Quản trị" của company-admin (Kế hoạch 3) — tạo tài khoản NHÂN VIÊN thật cho ĐÚNG công ty
 * đang đăng nhập, gọi `POST /api/admin/users` (`auth/api.ts::createUser`). Chỉ render khi
 * `isAdmin(session)` (xem `App.tsx`) — không tự kiểm quyền ở đây, vì server LUÔN validate lại
 * (403 nếu thiếu quyền, xem `routes/admin.py::require_admin`) — component này không phải hàng rào
 * bảo mật, chỉ là tiện dụng UI.
 *
 * `roles` giới hạn lựa chọn trong `SECTION_ROLES ∪ {"admin"}` — đúng `_USER_ROLE_VOCAB` phía
 * server (`routes/admin.py`), KHÔNG có "superadmin" trong danh sách chọn (company-admin không
 * được phong superadmin cho ai — server chặn 400 nếu cố tình, đây chỉ là UI không hiện lựa chọn
 * đó, không phải nơi ngăn chặn thật).
 */

import { useState } from "react";
import { createUser, StudioApiError } from "../auth/api";
import { useSession } from "../auth/session";
import { SECTION_ROLES } from "../recipe/contract";

const ROLE_OPTIONS = [...SECTION_ROLES, "admin"] as const;

export default function CreateUserForm() {
  const { session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>(["public"]);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ email: string; roles: string[] } | null>(null);

  if (session === null) return null; // AppShell không render tab này nếu chưa đăng nhập.

  const toggleRole = (role: string) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Cần nhập email.");
      setState("error");
      return;
    }
    if (password.length < 8) {
      setError("Mật khẩu tối thiểu 8 ký tự.");
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    try {
      const result = await createUser(session.accessToken, email.trim(), password, roles);
      setLastCreated({ email: result.email, roles: result.roles });
      setEmail("");
      setPassword("");
      setRoles(["public"]);
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
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
        Tạo tài khoản nhân viên
      </h2>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, marginBottom: 24, lineHeight: 1.55 }}>
        Tài khoản mới thuộc ĐÚNG công ty bạn đang đăng nhập ({session.tenantId}) — không có cách nào
        chỉ định công ty khác.
      </p>

      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Email</label>
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vd: nhanvien-moi@congty.vn"
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 14 }}>Mật khẩu</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="tối thiểu 8 ký tự"
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 14 }}>Roles</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ROLE_OPTIONS.map((role) => (
            <label
              key={role}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12.5,
                border: "1px solid var(--line)",
                borderRadius: 7,
                padding: "6px 10px",
                cursor: "pointer",
                background: roles.includes(role) ? "var(--accent)" : "transparent",
                color: roles.includes(role) ? "#fff" : "var(--ink)",
              }}
            >
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
                style={{ margin: 0 }}
              />
              {role}
            </label>
          ))}
        </div>

        {error && (
          <p style={{ color: "var(--danger-text)", fontSize: 12, marginTop: 10, marginBottom: 0 }} role="alert">
            {error}
          </p>
        )}
        {state === "done" && lastCreated && (
          <p style={{ color: "var(--accent)", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Đã tạo {lastCreated.email} — roles: {lastCreated.roles.join(", ")}.
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
          {state === "loading" ? "Đang tạo…" : "Tạo tài khoản"}
        </button>
      </form>
    </div>
  );
}

/**
 * Màn hình đăng nhập THẬT (thay `DemoLogin.tsx` — `POST /api/auth/demo-login` đã bị xoá hẳn khỏi
 * backend, commit `6de63b8`). Email + mật khẩu, không còn ô nào để tự khai tenant/roles — cả hai
 * LUÔN tra từ `core.users` theo email đã xác thực mật khẩu (bcrypt), đúng
 * `apps/studio/src/studio_app/routes/auth.py::login`.
 */

import { useState } from "react";
import { login } from "./api";
import { useSession } from "./session";
import { StudioApiError } from "../httpUtil";
import { AgentCoreMark, WarningTriangleIcon } from "../icons";

const fieldStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 5,
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--line-strong)",
  background: "var(--surface)",
  color: "var(--ink)",
  boxSizing: "border-box",
};

export default function Login() {
  const { login: setSession } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Cần nhập email và mật khẩu.");
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    try {
      const response = await login(email.trim(), password);
      setSession(response);
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
      setState("error");
      return;
    }
    setState("idle");
  };

  return (
    <div
      className="full-viewport-min-height"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--paper)",
        fontFamily: "var(--font-body)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          boxShadow: "var(--shadow-md)",
          padding: "32px 28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent)", marginBottom: 6 }}>
          <AgentCoreMark size={22} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, color: "var(--ink)" }}>
            AgentCore
          </span>
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20, margin: "10px 0 4px" }}>
          Đăng nhập
        </h1>
        <p style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 0, marginBottom: 22, lineHeight: 1.5 }}>
          Tài khoản do superadmin hoặc admin công ty tạo trước — không có tài khoản demo nào lập
          sẵn.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: 14, fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vd: admin@acme.com"
              style={fieldStyle}
            />
          </label>
          <label style={{ display: "block", marginBottom: 18, fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={fieldStyle}
            />
          </label>

          {error && (
            <p
              role="alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
                color: "var(--bad)",
                fontSize: 12,
                background: "var(--bad-soft)",
                border: "1px solid var(--bad)",
                borderRadius: 6,
                padding: "8px 10px",
                marginBottom: 14,
              }}
            >
              <WarningTriangleIcon size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={state === "loading"}
            style={{
              width: "100%",
              padding: "9px 0",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 6,
              border: "none",
              cursor: state === "loading" ? "default" : "pointer",
              color: "#fff",
              background: state === "loading" ? "var(--ink-faint)" : "var(--accent)",
            }}
          >
            {state === "loading" ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}

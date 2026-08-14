/**
 * Màn hình đăng nhập (Kế hoạch 3) — email + mật khẩu, gọi `POST /api/auth/login` (`auth/api.ts`),
 * lưu JWT ký thật vào `SessionProvider`.
 *
 * Trước đây có 2 đường song song: đây (mật khẩu thật) và "demo-login" (chỉ gõ email, không mật
 * khẩu, tra registry cứng `_DEMO_ACCOUNTS`). `demo-login` đã bị XOÁ HOÀN TOÀN khỏi backend
 * (`apps/studio/src/studio_app/routes/auth.py`) — đây giờ là đường đăng nhập DUY NHẤT. Không còn
 * bảng tài khoản demo nào để hiển thị/bấm điền sẵn — tài khoản (kể cả để dev/test) phải tạo trước
 * qua `scripts/seed_superadmin.py` -> `POST /api/admin/companies` -> `POST /api/admin/users`.
 *
 * Motif nền (vòng tròn nối bằng đường) là trang trí thuần — phản chiếu đúng việc sản phẩm làm
 * (nối node lại thành DAG), không mang dữ liệu, `aria-hidden`.
 */

import { useState } from "react";
import { login, StudioApiError } from "./api";
import { useSession } from "./session";
import { ThemeToggleButton } from "../theme";

function CircuitMotif() {
  // Nút + đường nối tĩnh, toạ độ tay — không phải hoạ tiết lặp vô nghĩa, dựng thưa để không cạnh
  // tranh với card. Copper mờ trên nền giấy-kỹ-thuật.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 800 600"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.35,
      }}
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="none" stroke="var(--accent-copper)" strokeWidth="1.2">
        <path d="M40 480 L160 480 L200 420 L340 420" />
        <path d="M340 420 L340 300 L420 260" />
        <path d="M420 260 L560 260 L600 190 L760 190" />
        <path d="M200 420 L200 540 L100 570" />
        <path d="M420 260 L420 120 L520 60" />
      </g>
      <g fill="var(--accent-copper)">
        <circle cx="40" cy="480" r="4" />
        <circle cx="200" cy="420" r="4" />
        <circle cx="340" cy="420" r="4" />
        <circle cx="420" cy="260" r="5" />
        <circle cx="600" cy="190" r="4" />
        <circle cx="760" cy="190" r="4" />
        <circle cx="100" cy="570" r="4" />
        <circle cx="520" cy="60" r="4" />
      </g>
    </svg>
  );
}

export default function LoginForm() {
  const { login: setSession } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Cần nhập email.");
      setState("error");
      return;
    }
    if (!password) {
      setError("Cần nhập mật khẩu.");
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
      style={{
        position: "relative",
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        overflow: "hidden",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <CircuitMotif />

      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 1 }}>
        <ThemeToggleButton />
      </div>

      <div style={{ position: "relative", width: "100%", maxWidth: 420 }}>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: 32,
            boxShadow: "0 1px 2px rgba(20,24,26,0.04), 0 16px 40px rgba(20,24,26,0.07)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--accent)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 16,
              marginBottom: 18,
            }}
          >
            AC
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
            }}
          >
            AgentCore Studio
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, marginBottom: 26, lineHeight: 1.55 }}>
            Đăng nhập bằng email + mật khẩu — do superadmin hoặc admin công ty tạo trước qua trang
            quản trị.
          </p>

          <form onSubmit={handleSubmit}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vd: admin@congty.vn"
              style={{
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
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginTop: 14,
                marginBottom: 6,
              }}
            >
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
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
              }}
            />

            {error && (
              <p style={{ color: "var(--danger-text)", fontSize: 12, marginTop: 8, marginBottom: 0 }} role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={state === "loading"}
              className="btn-switch"
              style={{
                marginTop: 18,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
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
              {state === "loading" ? "Đang đăng nhập…" : "Đăng nhập"}
              {state !== "loading" && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

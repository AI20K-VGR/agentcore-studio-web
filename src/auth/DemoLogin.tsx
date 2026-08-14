/**
 * Màn hình đăng nhập demo (Kế hoạch 2, B1) — CHỈ gõ email, gọi `POST /api/auth/demo-login`
 * (`auth/api.ts`), lưu JWT ký thật vào `SessionProvider`.
 *
 * KHÔNG có ô chọn tenant, KHÔNG có ô tick roles — cả 2 đều được QUY ĐỊNH SẴN lúc "tạo tài khoản"
 * (registry cứng `routes/auth.py::_DEMO_ACCOUNTS`, khoá theo email), không phải thứ người đăng
 * nhập tự chọn mỗi lần. KHÔNG có ô mật khẩu — đây là "ký danh tính", không phải "xác thực danh
 * tính" (xem docstring `apps/studio/src/studio_app/routes/auth.py`).
 *
 * Bảng tài khoản demo bên dưới CHỈ để hiển thị/tham khảo (chép đúng `_DEMO_ACCOUNTS` phía
 * server) — bấm 1 dòng chỉ ĐIỀN SẴN ô email, không tự gửi tenant/roles nào cả; request thật vẫn
 * luôn chỉ có `{user}`, server tự tra lại từ đầu, không tin bảng này.
 *
 * Motif nền (vòng tròn nối bằng đường) là trang trí thuần — phản chiếu đúng việc sản phẩm làm
 * (nối node lại thành DAG), không mang dữ liệu, `aria-hidden`.
 */

import { useState } from "react";
import { demoLogin, StudioApiError } from "./api";
import { useSession } from "./session";
import { ThemeToggleButton } from "../theme";

// Chép đúng `apps/studio/src/studio_app/routes/auth.py::_DEMO_ACCOUNTS` — CHỈ để hiển thị, đổi ở
// đây không đổi được quyền thật của ai (server không đọc file này).
const DEMO_ACCOUNTS: { email: string; tenant: string; roles: string }[] = [
  { email: "admin@ankor.vn", tenant: "ankor", roles: "admin, public, hr, finance, engineering" },
  { email: "hr@ankor.vn", tenant: "ankor", roles: "hr" },
  { email: "finance@ankor.vn", tenant: "ankor", roles: "finance" },
  { email: "guest@ankor.vn", tenant: "ankor", roles: "(không có)" },
  { email: "admin@borea.vn", tenant: "borea", roles: "admin, public, hr, finance, engineering" },
  { email: "nhanvien@borea.vn", tenant: "borea", roles: "public, hr" },
];

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

export default function DemoLogin() {
  const { login } = useSession();
  const [user, setUser] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submitEmail = async (email: string) => {
    setState("loading");
    setError(null);
    try {
      const response = await demoLogin(email.trim());
      login(response);
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
      setState("error");
      return;
    }
    setState("idle");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim()) {
      setError("Cần nhập email.");
      setState("error");
      return;
    }
    void submitEmail(user);
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

      <div style={{ position: "relative", width: "100%", maxWidth: 480 }}>
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
            Đăng nhập demo — không mật khẩu, không chọn tenant, không tick role. Tenant + roles đã
            gán sẵn cho từng email, server tự tra lại (xem bảng bên dưới).
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
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="vd: admin@ankor.vn"
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

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            marginTop: 16,
            padding: 20,
            boxShadow: "0 1px 2px rgba(20,24,26,0.04)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 2 }}>
            Tài khoản demo để test
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12 }}>
            Bấm 1 dòng để điền sẵn email — server vẫn tự tra lại tenant/roles, bảng này chỉ để
            tham khảo.
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "0 8px 8px 0", fontWeight: 600, fontSize: 11 }}>Email</th>
                  <th style={{ padding: "0 8px 8px 0", fontWeight: 600, fontSize: 11 }}>Tenant</th>
                  <th style={{ padding: "0 0 8px 0", fontWeight: 600, fontSize: 11 }}>Roles</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_ACCOUNTS.map((acc) => (
                  <tr
                    key={acc.email}
                    onClick={() => {
                      setUser(acc.email);
                      setError(null);
                      setState("idle");
                    }}
                    style={{ cursor: "pointer", borderTop: "1px solid var(--bg)" }}
                  >
                    <td style={{ padding: "8px 8px 8px 0" }}>
                      <code style={{ color: "var(--accent)" }}>{acc.email}</code>
                    </td>
                    <td style={{ padding: "8px 8px 8px 0", color: "var(--ink)" }}>{acc.tenant}</td>
                    <td style={{ padding: "8px 0", color: "var(--ink)" }}>{acc.roles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

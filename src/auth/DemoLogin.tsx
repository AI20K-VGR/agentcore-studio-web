/**
 * Màn hình đăng nhập demo (Kế hoạch 2, B1) — CHỈ gõ email, gọi `POST /api/auth/demo-login`
 * (`auth/api.ts`), lưu JWT ký thật vào `SessionProvider`.
 *
 * KHÔNG có ô chọn tenant, KHÔNG có ô tick roles — cả 2 đều được QUY ĐỊNH SẴN lúc "tạo tài khoản"
 * (registry cứng `routes/auth.py::_DEMO_ACCOUNTS`, khoá theo email), không phải thứ người đăng
 * nhập tự chọn mỗi lần. KHÔNG có ô mật khẩu — đây là "ký danh tính", không phải "xác thực danh
 * tính" (xem docstring `apps/studio/src/studio_app/routes/auth.py`).
 */

import { useState } from "react";
import { demoLogin, StudioApiError } from "./api";
import { useSession } from "./session";

export default function DemoLogin() {
  const { login } = useSession();
  const [user, setUser] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim()) {
      setError("Cần nhập email.");
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    try {
      const response = await demoLogin(user.trim());
      login(response);
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
      setState("error");
      return;
    }
    setState("idle");
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>Đăng nhập demo</h2>
      <p style={{ fontSize: 12, color: "#71717a", marginTop: 0 }}>
        Không có mật khẩu, không chọn tenant, không tick role — tenant + roles đã được gán sẵn cho
        từng email trong danh sách tài khoản demo (<code>routes/auth.py::_DEMO_ACCOUNTS</code>).
        Gõ đúng 1 email trong danh sách đó, không thì báo lỗi.
      </p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Email
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="vd: admin@ankor.vn"
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>

        {error && (
          <p style={{ color: "#dc2626", fontSize: 12 }} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={state === "loading"}>
          {state === "loading" ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}

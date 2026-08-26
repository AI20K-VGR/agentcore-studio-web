/**
 * Màn chặn: admin vừa đặt lại mật khẩu HỘ tài khoản này, nên chính chủ phải đổi trước khi vào bất
 * cứ phần nào khác (`must_change_password`, quyết định D1 app#76).
 *
 * Cần thiết vì đường tạo tài khoản hiện tại để admin tự nghĩ mật khẩu rồi nhắn cho nhân viên — nếu
 * không buộc đổi, admin biết mật khẩu của mọi người trong công ty vô thời hạn.
 *
 * Component RIÊNG, không dùng lại `ChangePasswordForm`: cái kia là một mục thu gọn trong dropdown
 * tài khoản (bung ra khi bấm, đóng lại được), còn đây là màn hình toàn trang KHÔNG có đường vòng.
 * Nhồi hai hành vi đó vào một component sẽ đẻ ra một prop `dismissible` mà mọi call-site phải nhớ.
 *
 * Đổi xong thì **đăng xuất**, không đưa thẳng vào ứng dụng: `change_own_password` ghi
 * `password_changed_at = now()`, và `authz.fetch_fresh_identity` loại mọi JWT ký TRƯỚC mốc đó — tức
 * token đang cầm đã chết ngay khi đổi xong. Cho vào tiếp sẽ là một loạt 401 khó hiểu.
 */

import { useState } from "react";
import { changePassword } from "./api";
import type { Session } from "./session";
import { StudioApiError } from "../httpUtil";
import { KeyIcon } from "../icons";
import PasswordInput from "../components/PasswordInput";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: 5,
  border: "1px solid var(--line-strong)",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
};

export default function ForcedPasswordChange({ session, onDone }: { session: Session; onDone: () => void }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      setError("Nhập mật khẩu admin vừa cấp cho bạn.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải từ 8 ký tự trở lên.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(oldPassword, newPassword, session);
      onDone();
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="full-viewport-min-height"
      style={{
        background: "var(--paper)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "80px 20px",
        fontFamily: "var(--font-body)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          boxShadow: "var(--shadow-md)",
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <KeyIcon size={16} style={{ color: "var(--accent)" }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>
            Đặt mật khẩu riêng của bạn
          </h2>
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0, lineHeight: 1.7 }}>
          Mật khẩu hiện tại do quản trị viên đặt hộ, nên họ cũng biết nó. Đổi sang mật khẩu riêng
          trước khi dùng tiếp.
        </p>

        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>
          Mật khẩu admin vừa cấp
          <div style={{ marginTop: 4 }}>
            <PasswordInput value={oldPassword} onChange={setOldPassword} style={inputStyle} autoFocus />
          </div>
        </label>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>
          Mật khẩu mới (tối thiểu 8 ký tự)
          <div style={{ marginTop: 4 }}>
            <PasswordInput value={newPassword} onChange={setNewPassword} style={inputStyle} />
          </div>
        </label>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>
          Xác nhận mật khẩu mới
          <div style={{ marginTop: 4 }}>
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} style={inputStyle} />
          </div>
        </label>

        {error !== null && (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 12, margin: 0 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            ...inputStyle,
            cursor: "pointer",
            fontWeight: 700,
            color: "#fff",
            background: "var(--accent)",
            border: "none",
            padding: "9px 16px",
          }}
        >
          {busy ? "Đang đổi…" : "Đổi mật khẩu và đăng nhập lại"}
        </button>
        <p style={{ fontSize: 10.5, color: "var(--ink-faint)", margin: 0, lineHeight: 1.6 }}>
          Đổi xong bạn sẽ được đưa về màn đăng nhập — phiên hiện tại hết hiệu lực ngay khi mật khẩu
          đổi.
        </p>
      </form>
    </div>
  );
}

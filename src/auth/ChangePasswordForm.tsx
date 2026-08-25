/**
 * Form đổi mật khẩu CỦA CHÍNH MÌNH — dùng chung cho cả 3 tầng (superadmin/admin/employee), gọi
 * `PATCH /api/auth/password` (`auth/api.ts::changePassword`). Không đặc cách cho tier nào — cùng
 * 1 component, gắn trong `UserMenu` (dropdown tài khoản ở góc phải mọi màn).
 *
 * Thu gọn mặc định (1 dòng menu "Đổi mật khẩu"), bung ra thành form dọc khi bấm — layout DỌC vì
 * nơi duy nhất còn dùng component này là 1 dropdown hẹp (~260px), không phải hàng ngang trong top
 * bar như bản trước.
 */

import { useState } from "react";
import { changePassword } from "./api";
import type { Session } from "./session";
import { StudioApiError } from "../httpUtil";
import { KeyIcon } from "../icons";
import PasswordInput from "../components/PasswordInput";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  fontSize: 12.5,
  borderRadius: 5,
  border: "1px solid var(--line-strong)",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
};

export default function ChangePasswordForm({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setState("idle");
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || newPassword.length < 8) {
      setState("error");
      setMessage("Cần mật khẩu hiện tại, và mật khẩu mới >= 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setState("error");
      setMessage("Mật khẩu xác nhận không khớp.");
      return;
    }
    setState("saving");
    setMessage(null);
    try {
      await changePassword(oldPassword, newPassword, session);
      setState("done");
      setMessage("Đã đổi mật khẩu.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setState("error");
      setMessage(err instanceof StudioApiError ? err.message : String(err));
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          width: "100%",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "8px 4px",
          textAlign: "left",
          borderRadius: 6,
        }}
      >
        <KeyIcon size={15} /> Đổi mật khẩu
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7,
        padding: "8px 4px",
      }}
    >
      <PasswordInput
        autoComplete="current-password"
        value={oldPassword}
        onChange={setOldPassword}
        placeholder="Mật khẩu hiện tại"
        style={inputStyle}
        autoFocus
      />
      <PasswordInput
        autoComplete="new-password"
        value={newPassword}
        onChange={setNewPassword}
        placeholder="Mật khẩu mới (>=8 ký tự)"
        style={inputStyle}
      />
      <PasswordInput
        autoComplete="new-password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Xác nhận mật khẩu mới"
        style={inputStyle}
      />
      {message && (
        <span style={{ fontSize: 11.5, color: state === "error" ? "var(--bad)" : "var(--good)" }}>{message}</span>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="submit"
          disabled={state === "saving"}
          style={{
            ...inputStyle,
            width: "auto",
            flex: 1,
            cursor: "pointer",
            fontWeight: 700,
            background: "var(--tier-admin)",
            color: "#fff",
            border: "none",
          }}
        >
          {state === "saving" ? "Đang lưu…" : "Lưu"}
        </button>
        <button type="button" onClick={reset} style={{ ...inputStyle, width: "auto", flex: 1, cursor: "pointer" }}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

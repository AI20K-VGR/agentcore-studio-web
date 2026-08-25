/**
 * Input mật khẩu dùng chung, có nút mắt hiện/ẩn tích hợp sẵn — tự quản lý toggle
 * `type="password"`/`"text"` nội bộ, cha chỉ cần `value`/`onChange` như 1 input thường.
 *
 * Dùng ở 3 nơi cần nhập mật khẩu: đổi mật khẩu cá nhân (`auth/ChangePasswordForm.tsx`), superadmin
 * tạo admin công ty (`superadmin/SuperadminConsole.tsx`), admin tạo nhân viên (`admin/EmployeesTab.tsx`).
 */

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "../icons";

export interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  style,
  autoFocus,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{ ...style, paddingRight: 30, boxSizing: "border-box", width: "100%" }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          padding: 2,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          color: "var(--ink-faint)",
        }}
      >
        {visible ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
      </button>
    </div>
  );
}

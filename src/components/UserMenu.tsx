/**
 * Header dùng chung giữa `AppShell` (admin, `App.tsx`) và `ChatPage` (route độc lập, user thường)
 * — trước đây badge "AC" + avatar tròn + dropdown (email/role/đăng xuất) bị viết lặp gần y hệt ở
 * 2 nơi (review AIE-1, `web#5` finding #3): mọi chỉnh sửa sau này phải đổi 2 chỗ hoặc sẽ lệch nhau.
 */

import { useState } from "react";
import type { Session } from "../auth/session";

export function LogoBadge() {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        background: "var(--accent)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 12.5,
        flexShrink: 0,
      }}
    >
      AC
    </div>
  );
}

export function UserMenu({
  session,
  onLogout,
  roleLabel,
  children,
}: {
  session: Session;
  onLogout?: () => void;
  /** Mặc định: `session.roles.join(", ")` — truyền tay khi cần hiển thị khác (vd `AppShell` chỉ
   * cho admin vào, luôn muốn in "admin" thay vì liệt kê hết mọi role nội dung KB đi kèm). */
  roleLabel?: string;
  /** Nội dung thêm giữa dòng Role và nút Đăng xuất — vd toggle "Hiện minimap" chỉ có ở `AppShell`. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={session.user}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "var(--accent-copper)",
          color: "#fff",
          border: "none",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {session.user.slice(0, 1).toUpperCase()}
      </button>

      {open && (
        <>
          {/* Lớp phủ trong suốt để bấm ra ngoài là đóng menu — nằm dưới card, trên nội dung trang. */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              zIndex: 21,
              minWidth: 220,
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(20,24,26,0.12)",
              padding: 12,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--ink)", wordBreak: "break-all" }}>{session.user}</div>
            <div style={{ color: "var(--muted)", marginTop: 4 }}>
              Role: {roleLabel ?? (session.roles.join(", ") || "không role")}
            </div>
            {children}
            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  // Đóng NGAY lúc bấm, không đợi tới lần mount tiếp theo — `open` sống bên trong
                  // component này nên nếu không tự đóng, menu vẫn "mở" khi đăng nhập lại (đăng
                  // xuất chỉ đổi `session` về null, không unmount component cha).
                  setOpen(false);
                  onLogout();
                }}
                className="btn-logout"
                style={{
                  marginTop: 10,
                  width: "100%",
                  fontSize: 11.5,
                  fontWeight: 600,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderRadius: 6,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Đăng xuất
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

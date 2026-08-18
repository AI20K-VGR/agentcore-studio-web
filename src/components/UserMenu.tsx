/**
 * Menu tài khoản góc phải mọi top bar — 1 avatar tròn (chữ cái đầu email), bấm mở dropdown chứa:
 * thông tin tài khoản (email/vai trò/công ty), chuyển giao diện sáng/tối/hệ thống, đổi mật khẩu
 * (`ChangePasswordForm`), đăng xuất. Thay cho hàng nút rời rạc "Đổi mật khẩu"/"Đăng xuất" nằm
 * thẳng trên top bar trước đây — gom về 1 chỗ quen thuộc (góc phải, giống hầu hết web) thay vì
 * mỗi màn tự bày 1 kiểu.
 */

import { useEffect, useRef, useState } from "react";
import type { Session } from "../auth/session";
import ChangePasswordForm from "../auth/ChangePasswordForm";
import { applyThemePref, getStoredThemePref, type ThemePref } from "../theme";
import { setMinimapVisible, useMinimapVisible } from "../canvas/minimapPref";
import { LogoutIcon, MapIcon, MoonIcon } from "../icons";
import { ToggleSwitch } from "./ToggleSwitch";

export function UserMenu({
  session,
  roleLabel,
  roleTone,
  onLogout,
}: {
  session: Session;
  roleLabel: string;
  roleTone: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [themePref, setThemePref] = useState<ThemePref>(() => getStoredThemePref());
  const minimapVisible = useMinimapVisible();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Bấm ra ngoài đóng menu — hành vi dropdown chuẩn, không cần thư viện (chỉ 1 listener trong
    // lúc `open`, gỡ ngay khi đóng hoặc unmount).
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const initial = (session.user.trim().charAt(0) || "?").toUpperCase();

  const setDark = (dark: boolean) => {
    const pref: ThemePref = dark ? "dark" : "light";
    applyThemePref(pref);
    setThemePref(pref);
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Tài khoản"
        aria-expanded={open}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid var(--line-strong)",
          background: `color-mix(in srgb, ${roleTone} 20%, var(--surface))`,
          color: roleTone,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 268,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            boxShadow: "var(--shadow-md)",
            zIndex: 80,
            padding: 10,
          }}
        >
          <div style={{ padding: "6px 6px 10px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", wordBreak: "break-all" }}>
              {session.user}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: `color-mix(in srgb, ${roleTone} 16%, var(--surface))`,
                  color: roleTone,
                }}
              >
                {roleLabel}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>{session.tenantName}</span>
            </div>
          </div>

          <div style={{ height: 1, background: "var(--line)", margin: "2px 0 10px" }} />

          <div style={{ padding: "0 6px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink)" }}>
                <MoonIcon size={14} style={{ color: "var(--ink-faint)", flexShrink: 0 }} />
                Chế độ tối
              </span>
              <ToggleSwitch checked={themePref === "dark"} onChange={setDark} label="Chế độ tối" />
            </div>
          </div>

          <div style={{ height: 1, background: "var(--line)", margin: "10px 0" }} />

          <div style={{ padding: "0 6px 4px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>
              Canvas
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink)" }}>
                <MapIcon size={14} style={{ color: "var(--ink-faint)", flexShrink: 0 }} />
                Minimap
              </span>
              <ToggleSwitch checked={minimapVisible} onChange={setMinimapVisible} label="Hiện minimap trên Canvas" />
            </div>
          </div>

          <div style={{ height: 1, background: "var(--line)", margin: "10px 0" }} />

          <div style={{ padding: "0 2px" }}>
            <ChangePasswordForm session={session} />
          </div>

          <div style={{ height: 1, background: "var(--line)", margin: "6px 0 8px" }} />

          <button
            type="button"
            onClick={onLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              width: "100%",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--bad)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px 6px",
              textAlign: "left",
              borderRadius: 6,
            }}
          >
            <LogoutIcon size={15} /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Theme sáng/tối — `data-theme` đặt lên `<html>` (script chống-nháy trong `index.html` đã set
 * SẴN giá trị ban đầu trước khi React mount, xem file đó). Provider này chỉ ĐỌC LẠI giá trị đã
 * có trên DOM lúc khởi tạo (không tự tính lại `prefers-color-scheme` — tránh lệch với script),
 * rồi đồng bộ 2 chiều: đổi `theme` → ghi `data-theme` + `localStorage`.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

function readInitialTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() phải gọi bên trong <ThemeProvider>");
  return ctx;
}

/** Icon mặt trời/mặt trăng — cùng bộ nét mảnh (stroke) với `SidebarToggleIcon` (App.tsx). */
export function ThemeToggleButton({ compact }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: compact ? 28 : 32,
        height: compact ? 28 : 32,
        padding: 0,
        border: "1px solid var(--line)",
        borderRadius: 7,
        background: "var(--surface)",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {isDark ? (
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="4.5" stroke="var(--accent-copper)" strokeWidth="1.5" />
          <g stroke="var(--accent-copper)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4M15.9 15.9l-1.4-1.4M5.5 5.5L4.1 4.1" />
          </g>
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M17 11.5A7 7 0 1 1 8.5 3a5.5 5.5 0 0 0 8.5 8.5Z"
            stroke="var(--muted)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

/**
 * Điều khiển `data-theme` trên `<html>` — chỉ còn 2 giá trị: "light"/"dark" (bỏ chế độ "Hệ thống"
 * theo OS — phản hồi: "không cần tạo ra 3 chế độ đâu", giờ là 1 công tắc gạt như minimap, không
 * phải 3 nút). `theme.css` đọc thuộc tính này qua `[data-theme="dark"]`, xem comment ở đó — khối
 * `@media (prefers-color-scheme: dark)` trong `theme.css` giờ chỉ còn tác dụng ĐÚNG 1 lần (lựa
 * chọn ban đầu bên dưới), không còn tự đổi theo OS sau đó nữa.
 *
 * Lưu vào `localStorage` để nhớ qua lần load lại — KHÔNG lưu theo tài khoản (chọn theme là sở
 * thích của người ngồi trước máy, không phải thuộc tính của user/tenant).
 */

export type ThemePref = "light" | "dark";

const STORAGE_KEY = "agentcore-theme";

export function getStoredThemePref(): ThemePref {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark") return raw;
  // Chưa từng chọn tay — lấy 1 LẦN theo `prefers-color-scheme` của OS lúc mở app đầu tiên (đỡ dí
  // 1 trang sáng chói vào mặt người đang dùng OS tối), từ đó về sau là lựa chọn tự bấm, không tự
  // đổi theo OS nữa.
  const prefersDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function applyThemePref(pref: ThemePref): void {
  document.documentElement.setAttribute("data-theme", pref);
  localStorage.setItem(STORAGE_KEY, pref);
}

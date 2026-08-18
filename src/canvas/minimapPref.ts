/**
 * Bật/tắt minimap trên canvas — công tắc nằm trong `UserMenu` (góc phải mọi top bar), nhưng
 * minimap chỉ render trong `Studio` — 2 nơi không lồng nhau trong cây component nên không thể
 * dùng `useState` cục bộ. Lưu `localStorage` (nhớ qua lần load lại, không theo tài khoản, cùng
 * chọn lựa đã dùng ở `theme.ts`) + `useSyncExternalStore` để 2 nơi luôn đồng bộ ngay khi bấm,
 * không cần Context/thư viện state ngoài.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "agentcore-minimap-visible";
const listeners = new Set<() => void>();

function readStored(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

let cached = readStored();

export function setMinimapVisible(visible: boolean): void {
  if (visible === cached) return;
  cached = visible;
  localStorage.setItem(STORAGE_KEY, String(visible));
  listeners.forEach((listener) => listener());
}

export function subscribeMinimapVisible(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMinimapVisibleSnapshot(): boolean {
  return cached;
}

export function useMinimapVisible(): boolean {
  return useSyncExternalStore(subscribeMinimapVisible, getMinimapVisibleSnapshot);
}

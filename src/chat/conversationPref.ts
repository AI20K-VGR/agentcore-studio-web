/**
 * Nhớ `conversation_id` gần nhất của TỪNG agent (per-agent, không phải 1 giá trị chung toàn phiên
 * — nhiều agent khác nhau không được lẫn phiên chat của nhau khi đổi ở dropdown, `ChatPage.tsx`).
 *
 * `localStorage`, cùng lựa chọn đã dùng ở `theme.ts`/`canvas/minimapPref.ts` — nhớ qua lần load
 * lại trang, không theo tài khoản. Khác `minimapPref.ts`: chỉ `ChatPage` đọc/ghi giá trị này, không
 * có 2 nơi trong cây component cần đồng bộ, nên không cần `useSyncExternalStore` — 2 hàm thẳng là
 * đủ.
 */

const STORAGE_PREFIX = "chat:conversation:";

export function getStoredConversationId(agentId: string): string | null {
  return localStorage.getItem(STORAGE_PREFIX + agentId);
}

export function setStoredConversationId(agentId: string, conversationId: string): void {
  localStorage.setItem(STORAGE_PREFIX + agentId, conversationId);
}

/**
 * Nhớ `conversation_id` gần nhất của TỪNG agent (per-agent, không phải 1 giá trị chung toàn phiên
 * — nhiều agent khác nhau không được lẫn phiên chat của nhau khi đổi ở dropdown, `ChatPage.tsx`).
 *
 * `localStorage`, cùng lựa chọn đã dùng ở `theme.ts`/`canvas/minimapPref.ts` — nhớ qua lần load
 * lại trang, không theo tài khoản. Khác `minimapPref.ts`: chỉ `ChatPage` đọc/ghi giá trị này, không
 * có 2 nơi trong cây component cần đồng bộ, nên không cần `useSyncExternalStore` — 2 hàm thẳng là
 * đủ.
 *
 * Review dholmes0207 (PR#42, finding 1) — key PHẢI khoá theo NGƯỜI ĐĂNG NHẬP, không chỉ `agentId`.
 * `localStorage` sống qua `logout()` (`session.ts` chỉ `saveSession(null)`, không đụng key khác)
 * — máy dùng chung: người kế tiếp đăng nhập trên cùng trình duyệt sẽ nhặt đúng `conversation_id`
 * của người trước, và server KHÔNG chặn được (`routes/chat.py::get_conversation` fence theo tenant
 * (RLS) + `agent_id` — cùng công ty cùng agent thì cả 2 đều khớp; `wb.conversations` không có cột
 * chủ sở hữu, gap riêng đã mở app#86, ngoài phạm vi sửa ở đây). Không xoá key lúc `logout()` thay
 * vào đó — xoá sẽ làm mất chính lịch sử của chủ nhân khi họ đăng nhập lại, phá đúng mục đích
 * web#28 sinh ra để giữ. Khoá theo người (`tenantId:user`) giữ được cả hai: đúng chủ vẫn thấy lại
 * lịch sử của mình, người khác trên cùng máy không nhặt được của người trước.
 */

import type { Session } from "../auth/session";

const STORAGE_PREFIX = "chat:conversation:";

function storageKey(session: Session, agentId: string): string {
  return `${STORAGE_PREFIX}${session.tenantId}:${session.user}:${agentId}`;
}

export function getStoredConversationId(session: Session, agentId: string): string | null {
  return localStorage.getItem(storageKey(session, agentId));
}

export function setStoredConversationId(session: Session, agentId: string, conversationId: string): void {
  localStorage.setItem(storageKey(session, agentId), conversationId);
}

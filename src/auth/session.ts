/**
 * Session của phiên đăng nhập — lưu `access_token` (JWT ký thật, xem
 * `apps/studio/src/studio_app/jwt_auth.py`) sau khi `POST /api/auth/login` thành công.
 *
 * `localStorage`, KHÔNG phải cookie/server-side session — mất khi người dùng tự xoá storage hoặc
 * token hết hạn (`STUDIO_JWT_EXPIRE_MINUTES`, mặc định 480 phút phía server) — không có
 * refresh-token, không cần cho phạm vi hiện tại.
 */

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createElement } from "react";
import type { LoginResponse } from "./api";

const STORAGE_KEY = "agentcore-studio-session";

export interface Session {
  accessToken: string;
  tenantId: string;
  /** Tên công ty thật (`core.tenants.name`) — dùng để HIỂN THỊ, `tenantId` (UUID) chỉ dùng nội
   * bộ (query param/request), không đưa ra UI (redesign: UUID vô nghĩa với người dùng thật). */
  tenantName: string;
  user: string;
  systemRoles: string[];
  /** Admin vừa đặt lại mật khẩu HỘ tài khoản này — phải đổi trước khi vào phần khác.
   *
   * Đường tạo tài khoản hiện tại để admin tự nghĩ mật khẩu rồi nhắn cho nhân viên, nên không có
   * cờ này thì admin biết mật khẩu của mọi người trong công ty vô thời hạn (quyết định D1,
   * app#76). Phiên lưu từ trước khi cờ tồn tại không có field này — `loadSession` chuẩn hoá về
   * `false`, cùng cách đã xử lý lần đổi tên `roles` → `systemRoles`. */
  mustChangePassword: boolean;
}

/** Exported for `session.test.ts` — the localStorage -> Session migration is the part worth
 * unit-testing directly, without dragging in React rendering machinery. */
export function loadSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session & { roles?: unknown };
    // Migrate pre-rename sessions (`roles` -> `systemRoles`, core.users.roles ERD gap-2):
    // a session saved by code from before this rename has `roles`, not `systemRoles` — left
    // as `undefined` here would crash every `.systemRoles.includes(...)` call site
    // (resolveRole()'s superadmin/admin routing, ChatPage's admin-panel gate) on the very
    // next page load, for every user who was logged in when this shipped (review web#22,
    // DongAnh2704 — reproduced live, not theoretical).
    if (!Array.isArray(parsed.systemRoles)) {
      parsed.systemRoles = Array.isArray(parsed.roles) ? parsed.roles : [];
    }
    // Phiên lưu TRƯỚC khi cờ này tồn tại có `undefined` — để nguyên thì `!session.mustChangePassword`
    // vẫn chạy đúng, nhưng `Session` khai `boolean` nên một `undefined` lọt vào state là kiểu nói
    // dối; và mọi chỗ ghi lại session sẽ lưu tiếp giá trị hỏng đó. Chuẩn hoá ngay tại cửa đọc,
    // cùng cách đã xử lý lần đổi tên `roles` → `systemRoles` ngay trên.
    parsed.mustChangePassword = parsed.mustChangePassword === true;
    return parsed;
  } catch {
    // JSON hỏng (vd storage bị sửa tay) — coi như chưa đăng nhập, không crash cả app.
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveSession(session: Session | null): void {
  if (session === null) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

interface SessionContextValue {
  session: Session | null;
  /** Gọi sau khi `login()` (`auth/api.ts`) thành công. */
  login: (response: LoginResponse) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      login: (response) => {
        const next: Session = {
          accessToken: response.access_token,
          tenantId: response.tenant_id,
          tenantName: response.tenant_name,
          user: response.user,
          systemRoles: response.system_roles,
          mustChangePassword: response.must_change_password,
        };
        saveSession(next);
        setSession(next);
      },
      logout: () => {
        saveSession(null);
        setSession(null);
      },
    }),
    [session],
  );

  return createElement(SessionContext.Provider, { value }, children);
}

/** Raise nếu gọi ngoài `<SessionProvider>` — cùng nguyên tắc fail-closed "present but broken must
 * be loud" đã dùng ở `apps/studio`'s `get_request_session()`, không âm thầm trả `null`. */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error("useSession() gọi ngoài <SessionProvider> — bọc App bằng SessionProvider trước.");
  }
  return ctx;
}

/** Header đính vào MỌI request tới `apps/studio` sau khi đăng nhập — khớp đúng shape
 * `middleware.py::_resolve_jwt_session` đọc (`Authorization: Bearer <token>`). */
export function authHeader(session: Session | null): Record<string, string> {
  if (session === null) return {};
  return { Authorization: `Bearer ${session.accessToken}` };
}

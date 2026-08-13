/**
 * Session của phiên đăng nhập demo — lưu `access_token` (JWT ký thật, xem
 * `apps/studio/src/studio_app/jwt_auth.py`) sau khi `POST /api/auth/demo-login` thành công.
 *
 * `localStorage`, KHÔNG phải cookie/server-side session — đúng mức "demo" đã thống nhất
 * (Kế hoạch 2): mất khi người dùng tự xoá storage hoặc token hết hạn (`STUDIO_JWT_EXPIRE_MINUTES`,
 * mặc định 480 phút phía server) — không có refresh-token, không cần cho phạm vi demo hiện tại.
 */

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createElement } from "react";
import type { DemoLoginResponse } from "./api";

const STORAGE_KEY = "agentcore-studio-demo-session";

export interface Session {
  accessToken: string;
  tenantId: string;
  user: string;
  roles: string[];
}

function loadSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
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
  /** Gọi sau khi `demoLogin()` (`auth/api.ts`) thành công. */
  login: (response: DemoLoginResponse) => void;
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
          user: response.user,
          roles: response.roles,
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

/**
 * Client gọi nhóm route superadmin ở `apps/studio/src/studio_app/routes/admin.py` — tất cả đều
 * `require_superadmin` ở phía server.
 *
 * Nhóm `/companies/{tenantId}/...` (app#75) là đường DUY NHẤT superadmin thao tác vào bên trong 1
 * công ty đã tạo. Trước chúng, mọi route quản user đều scope theo tenant của NGƯỜI GỌI, mà
 * superadmin đứng ở tenant `__system__` — nên 1 công ty mất tài khoản admin (quên mật khẩu / nghỉ
 * việc) là hỏng vĩnh viễn, chỉ chữa được bằng SQL tay.
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import { networkErrorHint, readJsonOrThrow, StudioApiError, studioBaseUrl } from "../httpUtil";

export interface CompanySummary {
  tenant_id: string;
  name: string;
  created_at: string;
  is_active: boolean;
  user_count: number;
  section_count: number;
}

export interface CompanyUser {
  user_id: string;
  email: string;
  system_roles: string[];
  is_active: boolean;
  created_at: string;
}

/** Bọc `fetch` + `readJsonOrThrow` một lần cho cả file — 6 hàm dưới đây trước đó lặp đúng khối
 * `try { fetch } catch { throw new StudioApiError(networkErrorHint()) }` không khác một chữ. */
async function call(path: string, session: Session, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...authHeader(session),
      },
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  if (res.status === 204) return null;
  return readJsonOrThrow(res);
}

export async function listCompanies(session: Session): Promise<CompanySummary[]> {
  return (await call("/api/admin/companies", session)) as CompanySummary[];
}

export interface CreateCompanyResponse {
  tenant_id: string;
  admin_email: string;
}

export async function createCompany(
  companyName: string,
  adminEmail: string,
  adminPassword: string,
  session: Session,
): Promise<CreateCompanyResponse> {
  return (await call("/api/admin/companies", session, {
    method: "POST",
    body: JSON.stringify({
      company_name: companyName,
      admin_email: adminEmail,
      admin_password: adminPassword,
    }),
  })) as CreateCompanyResponse;
}

export async function listCompanyUsers(tenantId: string, session: Session): Promise<CompanyUser[]> {
  return (await call(`/api/admin/companies/${tenantId}/users`, session)) as CompanyUser[];
}

export async function addCompanyAdmin(
  tenantId: string,
  email: string,
  password: string,
  session: Session,
): Promise<void> {
  await call(`/api/admin/companies/${tenantId}/admins`, session, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function resetCompanyUserPassword(
  tenantId: string,
  userId: string,
  newPassword: string,
  session: Session,
): Promise<void> {
  await call(`/api/admin/companies/${tenantId}/users/${userId}/reset-password`, session, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
}

/** `name`/`isActive` đều tuỳ chọn, nhưng KHÔNG được rỗng cả hai — server trả 400 cho `PATCH {}`
 * (body rỗng gần như luôn là bug phía client quên map field, để nó vỡ ra ngay còn hơn "200 nhưng
 * chẳng đổi gì"). */
export async function updateCompany(
  tenantId: string,
  patch: { name?: string; isActive?: boolean },
  session: Session,
): Promise<CompanySummary> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.isActive !== undefined) body.is_active = patch.isActive;
  return (await call(`/api/admin/companies/${tenantId}`, session, {
    method: "PATCH",
    body: JSON.stringify(body),
  })) as CompanySummary;
}

export async function deactivateCompanyUser(tenantId: string, userId: string, session: Session): Promise<CompanyUser> {
  return (await call(`/api/admin/companies/${tenantId}/users/${userId}/deactivate`, session, {
    method: "POST",
  })) as CompanyUser;
}

export async function reactivateCompanyUser(tenantId: string, userId: string, session: Session): Promise<CompanyUser> {
  return (await call(`/api/admin/companies/${tenantId}/users/${userId}/reactivate`, session, {
    method: "POST",
  })) as CompanyUser;
}

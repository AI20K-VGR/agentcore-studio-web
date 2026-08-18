/**
 * Client gọi `GET/POST /api/admin/companies` (`apps/studio/src/studio_app/routes/admin.py`) —
 * superadmin-only ở phía server.
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import { networkErrorHint, readJsonOrThrow, StudioApiError, studioBaseUrl } from "../httpUtil";

export interface CompanySummary {
  tenant_id: string;
  name: string;
  created_at: string;
}

export async function listCompanies(session: Session): Promise<CompanySummary[]> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/companies`, { headers: authHeader(session) });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as CompanySummary[];
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
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(session) },
      body: JSON.stringify({
        company_name: companyName,
        admin_email: adminEmail,
        admin_password: adminPassword,
      }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as CreateCompanyResponse;
}

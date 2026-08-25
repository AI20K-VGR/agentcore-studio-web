/**
 * Client cho `POST /api/admin/golden-sets` (`apps/studio/src/studio_app/routes/golden_sets.py`) —
 * đường thứ hai vào `eval.golden_sets`, cạnh bộ sinh máy lúc upload tài liệu (`app#61`).
 *
 * Route **hợp nhất**, không ghi đè: case vừa nạp thắng case máy sinh ở khoá trùng
 * `(tenant, câu hỏi chuẩn hoá, phòng ban)`, phần còn lại của bộ cũ giữ nguyên. Đó là lý do response
 * tách `n_uploaded` / `n_kept_from_existing` / `n_case` — ba con số trả lời ba câu khác nhau, và
 * gộp lại thành một thì người dùng không biết bộ máy sinh của mình có mất hay không.
 */

import type { Session } from "../auth/session";
import { authHeader } from "../auth/session";
import {
  networkErrorHint,
  readJsonOrThrow,
  StudioApiError,
  studioBaseUrl,
} from "../httpUtil";

export interface UploadGoldenSetResult {
  golden_set_ref: string;
  tenant_id: string;
  /** Tổng case của bộ SAU hợp nhất. */
  n_case: number;
  n_traps: number;
  /** Số case trong file vừa nạp. */
  n_uploaded: number;
  /** Case của bộ cũ sống sót qua lần hợp nhất (không trùng khoá với case vừa nạp). */
  n_kept_from_existing: number;
}

export async function uploadGoldenSet(
  goldenSetRef: string,
  cases: unknown[],
  session: Session,
  tenantId?: string,
): Promise<UploadGoldenSetResult> {
  let res: Response;
  try {
    res = await fetch(`${studioBaseUrl()}/api/admin/golden-sets`, {
      method: "POST",
      headers: { ...authHeader(session), "Content-Type": "application/json" },
      body: JSON.stringify({
        golden_set_ref: goldenSetRef,
        cases,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      }),
    });
  } catch {
    throw new StudioApiError(networkErrorHint());
  }
  return (await readJsonOrThrow(res)) as UploadGoldenSetResult;
}

/** Đọc file `.json` người dùng chọn thành mảng case, kiểm hình dạng TỐI THIỂU ở client.
 *
 * Không validate từng field ở đây — server đã làm bằng `GoldenCase` (pydantic, `extra="forbid"`) và
 * trả 422 nêu đích danh case nào/field nào. Dựng lại phép kiểm đó ở client là hai nguồn sự thật sẽ
 * lệch nhau. Chỉ chặn đúng hai ca mà server báo lỗi khó hiểu: file không phải JSON, và JSON không
 * phải mảng. */
export async function readGoldenSetFile(file: File): Promise<unknown[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new StudioApiError("File không phải JSON hợp lệ.");
  }
  const cases = Array.isArray(parsed)
    ? parsed
    : (parsed as { cases?: unknown })?.cases;
  if (!Array.isArray(cases)) {
    throw new StudioApiError(
      'File phải là một mảng case, hoặc một object có khoá "cases".',
    );
  }
  return cases;
}

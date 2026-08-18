/**
 * Tab "Phòng ban" trong `AdminConsole` — CHỈ ĐỌC (`GET /api/admin/sections`, không truyền
 * `tenantId` nên server tự scope tenant của admin đang đăng nhập). Tạo/sửa/xoá chỉ superadmin
 * làm được (`SuperadminConsole`) — cố ý, tránh company-admin tự đổi taxonomy làm role/dữ liệu đã
 * gắn theo tên cũ mồ côi (xem docstring `routes/sections.py`).
 */

import { useEffect, useState } from "react";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { FolderIcon } from "../icons";
import { listSections, type SectionSummary } from "./sectionsApi";

export default function SectionsTab({ session }: { session: Session }) {
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSections(session)
      .then(setSections)
      .catch((err) => setError(err instanceof StudioApiError ? err.message : String(err)));
  }, [session]);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px", fontFamily: "var(--font-body)" }}>
      <Card title="Phòng ban của công ty">
        <p style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 0, marginBottom: 16 }}>
          Chỉ superadmin mới thêm/sửa/xoá phòng ban — liên hệ superadmin nếu cần đổi.
        </p>
        {error && (
          <p style={{ color: "var(--bad)", fontSize: 12 }} role="alert">
            {error}
          </p>
        )}
        {sections.length === 0 && !error && (
          <p style={{ color: "var(--ink-faint)", fontSize: 12 }}>Chưa có phòng ban nào.</p>
        )}
        {sections.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <FolderIcon size={13} style={{ color: "var(--ink-faint)" }} />
            {sections.map((s) => (
              <Badge key={s.id} tone="tierAdmin" mono>
                {s.name}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Top bar thương hiệu dùng chung giữa `AdminConsole` (App.tsx), `SuperadminConsole`, `ChatPage`
 * (màn employee) — mark + TÊN CÔNG TY THẬT (`session.tenantName`), KHÔNG BAO GIỜ `tenantId`
 * (UUID vô nghĩa với người dùng thật — xem plan thiết kế redesign UI).
 *
 * Góc phải là `UserMenu` (avatar tròn, bấm mở dropdown: thông tin tài khoản/giao diện/đổi mật
 * khẩu/đăng xuất) — thay cho hàng nút rời "Đổi mật khẩu"/"Đăng xuất" trước đây (mỗi màn tự truyền
 * qua `children`). Không còn `children` — `onLogout` là prop bắt buộc duy nhất cần thêm.
 */

import type { Session } from "../auth/session";
import { AgentCoreMark } from "../icons";
import { UserMenu } from "./UserMenu";

export function BrandBar({
  session,
  roleLabel,
  roleTone,
  subtitle,
  onLogout,
}: {
  session: Session;
  roleLabel: string;
  roleTone: string;
  /** Ghi đè dòng "tên công ty" — dùng cho superadmin (không thuộc công ty nào, `session.
   * tenantName` sẽ là `"__system__"`, không nên lộ ra UI). Mặc định `session.tenantName`. */
  subtitle?: string;
  onLogout: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "8px 16px",
        borderBottom: "1px solid var(--line)",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--accent)" }}>
        <AgentCoreMark size={19} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>
          AgentCore
        </span>
      </div>
      <div style={{ width: 1, height: 20, background: "var(--line)" }} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          {subtitle ?? session.tenantName}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>{session.user}</span>
      </div>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          padding: "2px 7px",
          borderRadius: 999,
          background: `color-mix(in srgb, ${roleTone} 16%, var(--surface))`,
          color: roleTone,
        }}
      >
        {roleLabel}
      </span>
      <div style={{ marginLeft: "auto" }}>
        <UserMenu session={session} roleLabel={roleLabel} roleTone={roleTone} onLogout={onLogout} />
      </div>
    </div>
  );
}

/**
 * Pill hiển thị role/trạng thái — gom về 1 chỗ thay vì mỗi màn (`EmployeesTab`, `TraceViewer`) tự
 * viết lại style pill riêng. `tone` map thẳng sang token màu trong `theme.css`, không hardcode hex
 * ở bất kỳ nơi gọi nào.
 */

const TONE_STYLES: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: "var(--surface-2)", fg: "var(--ink-soft)" },
  admin: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  tierAdmin: { bg: "var(--tier-admin-soft)", fg: "var(--tier-admin)" },
  tierEmployee: { bg: "var(--tier-employee-soft)", fg: "var(--tier-employee)" },
  good: { bg: "var(--good-soft)", fg: "var(--good)" },
  warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  bad: { bg: "var(--bad-soft)", fg: "var(--bad)" },
};

export type BadgeTone = keyof typeof TONE_STYLES;

export function Badge({
  children,
  tone = "neutral",
  mono = false,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  mono?: boolean;
}) {
  const { bg, fg } = TONE_STYLES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.6,
        background: bg,
        color: fg,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Tick trạng thái tài khoản (`is_active`) — dùng ở `EmployeesTab`. */
export function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? "good" : "neutral"}>{active ? "Đang hoạt động" : "Đã vô hiệu hoá"}</Badge>
  );
}

/** Role → tone: "admin" luôn nổi bật riêng (brass), role nội dung dùng tone teal trung tính. */
export function RoleBadge({ role }: { role: string }) {
  return <Badge tone={role === "admin" ? "admin" : "tierAdmin"} mono>{role}</Badge>;
}

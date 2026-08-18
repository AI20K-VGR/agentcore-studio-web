/**
 * Công tắc gạt (on/off) dùng chung — thay checkbox trần ở những chỗ hành động là "bật/tắt 1 tính
 * năng ngay lập tức" (khác checkbox chọn-nhiều trong form). `role="switch"` + `aria-checked` cho
 * screen reader, không dùng `<input type="checkbox">` ẩn vì layout ở đây (nhãn bên trái, công tắc
 * bên phải, cả hàng bấm được) hợp `<button>` hơn.
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 34,
        height: 20,
        borderRadius: 999,
        border: "1px solid " + (checked ? "var(--tier-admin)" : "var(--line-strong)"),
        background: checked ? "var(--tier-admin)" : "var(--surface-2)",
        position: "relative",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
      aria-label={label}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          left: checked ? 15 : 1,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "var(--shadow-sm)",
          transition: "left 0.15s ease",
        }}
      />
    </button>
  );
}

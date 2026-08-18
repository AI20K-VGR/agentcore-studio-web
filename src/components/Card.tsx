/** Khối card tiêu đề + nội dung — dùng lặp lại ở mọi tab admin/superadmin, gom về đây thay vì
 * mỗi màn tự viết lại. */
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        padding: 18,
        marginBottom: 20,
      }}
    >
      <h3
        style={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "var(--ink-soft)",
          margin: "0 0 14px",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

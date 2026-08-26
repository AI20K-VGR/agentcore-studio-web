/**
 * Màn hình vận hành nền tảng của superadmin.
 *
 * Bố cục là **danh sách trước, form sau** (web#29): vai này vào đây để XEM đội hình công ty đang
 * có, không phải để tạo thêm — bản trước mở ra là 2 form xếp dọc trong cột 640px, không có chỗ nào
 * nhìn ra công ty nào đang tồn tại ngoài việc bấm vào 1 `<select>`. Form tạo công ty giờ nằm trong
 * modal mở từ nút.
 *
 * Cột phải là chỗ DUY NHẤT thao tác vào bên trong 1 công ty — xem tài khoản, thêm admin, đặt lại
 * mật khẩu, đổi tên, tạm khoá (4 route app#75). Chúng tồn tại vì trước đó 1 công ty mất tài khoản
 * admin là hỏng vĩnh viễn: không route nào cho superadmin nhìn vào bên trong 1 tenant khác.
 *
 * Không có canvas/chat/publish ở đây — superadmin có JWT trỏ tenant `__system__`
 * (`scripts/seed_superadmin.py`), RLS trên `wb.recipes`/`kb.chunks` khiến mọi thao tác nghiệp vụ ở
 * tenant đó vô nghĩa (0 dòng dữ liệu thật nào gắn `__system__`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "../auth/session";
import { BrandBar } from "../components/BrandBar";
import { Badge, StatusBadge } from "../components/Badge";
import { CheckCircleIcon, CloseIcon, FolderIcon, KeyIcon, PeopleIcon } from "../icons";
import PasswordInput from "../components/PasswordInput";
import {
  addCompanyAdmin,
  createCompany,
  deactivateCompanyUser,
  listCompanies,
  listCompanyUsers,
  reactivateCompanyUser,
  resetCompanyUserPassword,
  updateCompany,
  type CompanySummary,
  type CompanyUser,
} from "./api";
import {
  confirmMessage,
  deactivateUserQuestion,
  filterCompanies,
  passwordProblem,
  platformTotals,
  readableError,
} from "./companiesView";
import {
  createSection,
  deleteSection,
  listSections,
  renameSection,
  type SectionSummary,
} from "../admin/sectionsApi";

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12,
  borderRadius: 5,
  border: "1px solid var(--line-strong)",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
};

const primaryButtonStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  fontWeight: 700,
  color: "#fff",
  background: "var(--accent)",
  border: "none",
  padding: "8px 16px",
};

const quietButtonStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer", fontWeight: 600 };

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Dòng phản hồi dùng chung cho MỌI thao tác trong trang.
 *
 * Bản trước chỉ hiện lỗi, không hiện thành công — thêm/đổi tên/xoá phòng ban xong người dùng phải
 * tự soi bảng xem có gì đổi không. Và dòng đó nằm GIỮA form với nút bấm, đúng chỗ khe báo lỗi của
 * mọi form khác, nên thông báo xanh đọc như cảnh báo đỏ. */
function Feedback({ note }: { note: { tone: "good" | "bad"; text: string } | null }) {
  if (note === null) return null;
  return (
    <p
      role={note.tone === "bad" ? "alert" : "status"}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        fontSize: 12,
        margin: "10px 0 0",
        color: note.tone === "bad" ? "var(--bad)" : "var(--good)",
      }}
    >
      {note.tone === "good" && <CheckCircleIcon size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span>{note.text}</span>
    </p>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
        <h3
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: "var(--ink-soft)",
            margin: 0,
          }}
        >
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28, 36, 34, 0.35)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "60px 20px",
        zIndex: 40,
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 10,
          boxShadow: "var(--shadow-md)",
          padding: 20,
          width: "100%",
          maxWidth: 420,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--ink)" }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{ ...quietButtonStyle, border: "none", background: "transparent", padding: 4 }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)", display: "block" }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function CreateCompanyForm({ session, onCreated }: { session: Session; onCreated: (name: string) => void }) {
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !adminEmail.trim()) {
      setError("Cần tên công ty và email admin.");
      return;
    }
    const problem = passwordProblem(adminPassword, confirmAdminPassword);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCompany(companyName.trim(), adminEmail.trim(), adminPassword, session);
      onCreated(companyName.trim());
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Field label="Tên công ty">
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="vd: Acme Corp"
          autoFocus
          style={{ ...inputStyle, width: "100%" }}
        />
      </Field>
      <Field label="Email admin đầu tiên">
        <input
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="admin@acme.com"
          style={{ ...inputStyle, width: "100%" }}
        />
      </Field>
      <Field label="Mật khẩu admin (tối thiểu 8 ký tự)">
        <PasswordInput value={adminPassword} onChange={setAdminPassword} style={inputStyle} />
      </Field>
      <Field label="Xác nhận mật khẩu admin">
        <PasswordInput value={confirmAdminPassword} onChange={setConfirmAdminPassword} style={inputStyle} />
      </Field>
      <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, marginTop: 4 }}>
        {saving ? "Đang tạo…" : "Tạo công ty"}
      </button>
      <Feedback note={error === null ? null : { tone: "bad", text: error }} />
    </form>
  );
}

function CompanyList({
  companies,
  selectedId,
  onSelect,
  onCreateClick,
}: {
  companies: readonly CompanySummary[];
  selectedId: string | null;
  onSelect: (tenantId: string) => void;
  onCreateClick: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterCompanies(companies, query), [companies, query]);

  return (
    <Panel
      title={`Công ty (${companies.length})`}
      right={
        <button type="button" onClick={onCreateClick} style={primaryButtonStyle}>
          + Tạo công ty
        </button>
      }
    >
      {/* Ô tìm kiếm thay cho `<select>` của bản trước — dropdown không tìm được, quá vài chục công
          ty là không dùng nổi. */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Tìm theo tên công ty…"
        style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
      />
      {companies.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: 0 }}>
          Chưa có công ty nào — bấm "Tạo công ty" để bắt đầu.
        </p>
      )}
      {companies.length > 0 && visible.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: 0 }}>Không có công ty nào khớp "{query}".</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((c) => {
          const selected = c.tenant_id === selectedId;
          return (
            <button
              key={c.tenant_id}
              type="button"
              onClick={() => onSelect(c.tenant_id)}
              aria-pressed={selected}
              style={{
                textAlign: "left",
                cursor: "pointer",
                padding: "9px 10px",
                borderRadius: 7,
                border: "1px solid " + (selected ? "var(--accent)" : "var(--line)"),
                background: selected ? "var(--accent-soft)" : "var(--surface)",
                fontFamily: "var(--font-body)",
                color: "var(--ink)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                {!c.is_active && <Badge tone="bad">Tạm khoá</Badge>}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 3 }}>
                {c.user_count} tài khoản · {c.section_count} phòng ban · tạo {formatDate(c.created_at)}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function CompanyUsers({
  session,
  company,
  onChanged,
}: {
  session: Session;
  company: CompanySummary;
  onChanged: () => void;
}) {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [confirmNewAdminPassword, setConfirmNewAdminPassword] = useState("");
  const [resettingUser, setResettingUser] = useState<CompanyUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const reload = useCallback(async () => {
    try {
      setUsers(await listCompanyUsers(company.tenant_id, session));
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  }, [company.tenant_id, session]);

  useEffect(() => {
    setNote(null);
    reload();
  }, [reload]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(newAdminPassword, confirmNewAdminPassword);
    if (problem !== null) {
      setNote({ tone: "bad", text: problem });
      return;
    }
    try {
      await addCompanyAdmin(company.tenant_id, newAdminEmail.trim(), newAdminPassword, session);
      setNote({ tone: "good", text: `Đã thêm admin ${newAdminEmail.trim()} cho ${company.name}.` });
      setAddingAdmin(false);
      setNewAdminEmail("");
      setNewAdminPassword("");
      setConfirmNewAdminPassword("");
      await reload();
      onChanged();
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  };

  const handleToggleActive = async (user: CompanyUser) => {
    if (user.is_active && !window.confirm(deactivateUserQuestion(user.email, user.system_roles))) return;
    try {
      const action = user.is_active ? deactivateCompanyUser : reactivateCompanyUser;
      await action(company.tenant_id, user.user_id, session);
      setNote({
        tone: "good",
        text: user.is_active ? `Đã vô hiệu hoá ${user.email}.` : `Đã kích hoạt lại ${user.email}.`,
      });
      await reload();
      onChanged();
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resettingUser === null) return;
    const problem = passwordProblem(newPassword, confirmNewPassword);
    if (problem !== null) {
      setNote({ tone: "bad", text: problem });
      return;
    }
    try {
      await resetCompanyUserPassword(company.tenant_id, resettingUser.user_id, newPassword, session);
      // Nói ra hệ quả người vận hành không đoán được: route ghi `password_changed_at = now()`, nên
      // mọi phiên đang mở của tài khoản đó bị cắt ngay chứ không sống tới hết hạn JWT.
      setNote({
        tone: "good",
        text: `Đã đặt lại mật khẩu cho ${resettingUser.email}. Mọi phiên đang mở của tài khoản này đã bị cắt.`,
      });
      setResettingUser(null);
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  };

  return (
    <Panel
      title="Tài khoản"
      right={
        <button type="button" onClick={() => setAddingAdmin((v) => !v)} style={quietButtonStyle}>
          {addingAdmin ? "Huỷ" : "+ Thêm admin"}
        </button>
      }
    >
      {addingAdmin && (
        <form
          onSubmit={handleAddAdmin}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 12,
            padding: 12,
            borderRadius: 7,
            background: "var(--surface-2)",
          }}
        >
          <Field label="Email admin mới">
            <input
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="admin2@acme.com"
              autoFocus
              style={{ ...inputStyle, width: "100%" }}
            />
          </Field>
          <Field label="Mật khẩu (tối thiểu 8 ký tự)">
            <PasswordInput value={newAdminPassword} onChange={setNewAdminPassword} style={inputStyle} />
          </Field>
          {/* Ô xác nhận CÓ ở cả ba chỗ đặt mật khẩu, không chỉ ở form tạo công ty. Superadmin gõ
              mật khẩu HỘ người khác rồi nhắn cho họ — một ký tự sai thành "tài khoản mới không
              đăng nhập được", và người chịu hậu quả không phải người gõ. */}
          <Field label="Xác nhận mật khẩu">
            <PasswordInput
              value={confirmNewAdminPassword}
              onChange={setConfirmNewAdminPassword}
              style={inputStyle}
            />
          </Field>
          <button type="submit" style={{ ...primaryButtonStyle, width: "fit-content" }}>
            Thêm admin
          </button>
        </form>
      )}

      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        {/* Hàng tiêu đề: bảng nhân viên bên `admin/EmployeesTab.tsx` có, bảng này thì không — bốn
            cột không nhãn là bốn cột người đọc phải tự đoán. */}
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line-strong)" }}>
            {["Email", "Phòng ban", "Trạng thái", ""].map((label, i) => (
              <th
                key={label || i}
                style={{
                  padding: "0 6px 6px 0",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: "var(--ink-faint)",
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "7px 6px 7px 0" }}>{u.email}</td>
              <td style={{ padding: "7px 6px" }}>
                <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                  {u.system_roles.map((r) => (
                    <Badge key={r} tone={r === "admin" ? "admin" : "tierAdmin"} mono>
                      {r}
                    </Badge>
                  ))}
                </span>
              </td>
              <td style={{ padding: "7px 6px" }}>
                <StatusBadge active={u.is_active} />
              </td>
              <td style={{ padding: "7px 0 7px 6px", textAlign: "right" }}>
                <button
                  type="button"
                  onClick={() => {
                    setResettingUser(u);
                    setNewPassword("");
                    setConfirmNewPassword("");
                  }}
                  style={{
                    ...quietButtonStyle,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    marginRight: 6,
                  }}
                >
                  <KeyIcon size={12} />
                  Đặt lại mật khẩu
                </button>
                {/* Trạng thái `is_active` hiện ra ở cột bên trái từ bản đầu, nhưng không có nút nào
                    đổi nó — một badge chỉ để nhìn. Đặt lại mật khẩu MỞ tài khoản, không đóng; ca
                    "admin công ty nghỉ việc" cần đúng chiều ngược lại. */}
                <button
                  type="button"
                  onClick={() => handleToggleActive(u)}
                  style={{ ...quietButtonStyle, color: u.is_active ? "var(--bad)" : "var(--good)" }}
                >
                  {u.is_active ? "Vô hiệu hoá" : "Kích hoạt lại"}
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: "10px 0", color: "var(--ink-faint)" }}>
                Công ty này chưa có tài khoản nào.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {resettingUser !== null && (
        <Modal title={`Đặt lại mật khẩu — ${resettingUser.email}`} onClose={() => setResettingUser(null)}>
          <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Mật khẩu mới (tối thiểu 8 ký tự)">
              <PasswordInput value={newPassword} onChange={setNewPassword} style={inputStyle} autoFocus />
            </Field>
            <Field label="Xác nhận mật khẩu mới">
              <PasswordInput value={confirmNewPassword} onChange={setConfirmNewPassword} style={inputStyle} />
            </Field>
            <p style={{ fontSize: 11, color: "var(--ink-faint)", margin: 0 }}>
              Người dùng đăng nhập lại bằng mật khẩu này. Mọi phiên đang mở của họ sẽ bị cắt ngay.
            </p>
            <button type="submit" style={{ ...primaryButtonStyle, width: "fit-content" }}>
              Đặt lại
            </button>
          </form>
        </Modal>
      )}

      <Feedback note={note} />
    </Panel>
  );
}

function SectionsManager({ session, tenantId }: { session: Session; tenantId: string }) {
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  // `null` = không hàng nào đang sửa. Bản trước phơi sẵn ô nhập + nút "Đổi tên" trên MỌI hàng —
  // bốn phòng ban là bốn ô trống nằm chờ, và bấm "Đổi tên" lúc ô rỗng thì im lặng không làm gì.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setSections(await listSections(session, tenantId));
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  }, [session, tenantId]);

  useEffect(() => {
    setNote(null);
    setEditing(null);
    reload();
  }, [reload]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createSection(tenantId, newName.trim(), session);
      setNote({ tone: "good", text: `Đã thêm phòng ban "${newName.trim()}".` });
      setNewName("");
      await reload();
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing === null) return;
    const name = editing.name.trim();
    if (!name) {
      setNote({ tone: "bad", text: "Tên mới không được để trống." });
      return;
    }
    try {
      await renameSection(editing.id, name, session);
      setNote({ tone: "good", text: `Đã đổi tên phòng ban thành "${name}".` });
      setEditing(null);
      await reload();
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  };

  const handleDelete = async (section: SectionSummary) => {
    const question = confirmMessage({ kind: "delete-section", sectionName: section.name });
    if (question !== null && !window.confirm(question)) return;
    try {
      await deleteSection(section.id, session);
      setNote({ tone: "good", text: `Đã xoá phòng ban "${section.name}".` });
      await reload();
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  };

  return (
    <Panel title="Phòng ban">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--ink-faint)",
          marginBottom: 12,
        }}
      >
        <FolderIcon size={13} />
        Đây là DUY NHẤT nơi tạo/sửa/xoá phòng ban — admin công ty chỉ được xem.
      </div>

      <form onSubmit={handleCreate} style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Tên phòng ban mới"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="submit"
          style={{ ...quietButtonStyle, background: "var(--tier-admin)", color: "#fff", border: "none" }}
        >
          Thêm
        </button>
      </form>

      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <tbody>
          {sections.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "7px 6px 7px 0" }}>
                {editing?.id === s.id ? (
                  <form onSubmit={handleRename} style={{ display: "flex", gap: 6 }}>
                    <input
                      value={editing.name}
                      onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                      autoFocus
                      style={{ ...inputStyle, width: 150 }}
                    />
                    <button type="submit" style={quietButtonStyle}>
                      Lưu
                    </button>
                    <button type="button" onClick={() => setEditing(null)} style={quietButtonStyle}>
                      Huỷ
                    </button>
                  </form>
                ) : (
                  <code style={{ fontFamily: "var(--font-mono)" }}>{s.name}</code>
                )}
              </td>
              <td style={{ padding: "7px 0 7px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                {editing?.id !== s.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: s.id, name: s.name })}
                      style={{ ...quietButtonStyle, marginRight: 6 }}
                    >
                      Đổi tên
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      style={{ ...quietButtonStyle, color: "var(--bad)" }}
                    >
                      Xoá
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {sections.length === 0 && (
            <tr>
              <td colSpan={2} style={{ padding: "10px 0", color: "var(--ink-faint)" }}>
                Công ty này chưa có phòng ban nào.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Feedback note={note} />
    </Panel>
  );
}

function CompanyDetail({
  session,
  company,
  onChanged,
}: {
  session: Session;
  company: CompanySummary;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(company.name);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useEffect(() => {
    setRenaming(false);
    setDraftName(company.name);
    setNote(null);
  }, [company.tenant_id, company.name]);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draftName.trim();
    if (!name) {
      setNote({ tone: "bad", text: "Tên công ty không được để trống." });
      return;
    }
    try {
      await updateCompany(company.tenant_id, { name }, session);
      setNote({ tone: "good", text: `Đã đổi tên thành "${name}".` });
      setRenaming(false);
      onChanged();
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  };

  const handleToggleActive = async () => {
    const question = confirmMessage(
      company.is_active
        ? { kind: "suspend-company", companyName: company.name, userCount: company.user_count }
        : { kind: "activate-company" },
    );
    if (question !== null && !window.confirm(question)) return;
    try {
      await updateCompany(company.tenant_id, { isActive: !company.is_active }, session);
      setNote({
        tone: "good",
        text: company.is_active ? `Đã tạm khoá "${company.name}".` : `Đã mở lại "${company.name}".`,
      });
      onChanged();
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel
        title="Công ty"
        right={
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setRenaming((v) => !v)} style={quietButtonStyle}>
              {renaming ? "Huỷ" : "Đổi tên"}
            </button>
            <button
              type="button"
              onClick={handleToggleActive}
              style={{ ...quietButtonStyle, color: company.is_active ? "var(--bad)" : "var(--good)" }}
            >
              {company.is_active ? "Tạm khoá" : "Mở lại"}
            </button>
          </div>
        }
      >
        {renaming ? (
          <form onSubmit={handleRename} style={{ display: "flex", gap: 6 }}>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="submit" style={primaryButtonStyle}>
              Lưu
            </button>
          </form>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display)" }}>{company.name}</span>
            {company.is_active ? <Badge tone="good">Đang hoạt động</Badge> : <Badge tone="bad">Tạm khoá</Badge>}
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Tạo {formatDate(company.created_at)}</span>
          </div>
        )}
        {!company.is_active && (
          <p style={{ fontSize: 11, color: "var(--ink-faint)", margin: "10px 0 0" }}>
            Công ty đang tạm khoá: {company.user_count} tài khoản không đăng nhập được, và phiên đang mở của họ cũng
            đã bị cắt.
          </p>
        )}
        <Feedback note={note} />
      </Panel>

      <CompanyUsers session={session} company={company} onChanged={onChanged} />
      <SectionsManager session={session} tenantId={company.tenant_id} />
    </div>
  );
}

function TotalsStrip({ companies }: { companies: readonly CompanySummary[] }) {
  const totals = platformTotals(companies);
  const cells: { label: string; value: number; tone?: "bad" }[] = [
    { label: "Công ty", value: totals.companies },
    { label: "Tài khoản", value: totals.users },
    { label: "Phòng ban", value: totals.sections },
    ...(totals.suspended > 0 ? [{ label: "Đang tạm khoá", value: totals.suspended, tone: "bad" as const }] : []),
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 28,
        padding: "14px 18px",
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      {cells.map((cell) => (
        <div key={cell.label}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "var(--font-display)",
              color: cell.tone === "bad" ? "var(--bad)" : "var(--ink)",
            }}
          >
            {cell.value}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            {cell.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SuperadminConsole({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [banner, setBanner] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const reloadCompanies = useCallback(async () => {
    try {
      setCompanies(await listCompanies(session));
      setLoadError(null);
    } catch (err) {
      setLoadError(readableError(err));
    }
  }, [session]);

  useEffect(() => {
    reloadCompanies();
  }, [reloadCompanies]);

  // Giữ vùng chọn khớp với danh sách vừa tải lại — công ty đang chọn có thể vừa bị đổi tên (vẫn
  // cùng `tenant_id`) hoặc danh sách vừa từ rỗng thành có. Không đặt mặc định ở đây thì màn hình
  // mở ra là một cột phải trống trơn dù đã có công ty.
  const selected = companies.find((c) => c.tenant_id === selectedTenantId) ?? companies[0] ?? null;

  return (
    <div className="full-viewport-min-height" style={{ background: "var(--paper)" }}>
      <BrandBar
        session={session}
        roleLabel="Superadmin"
        roleTone="var(--accent)"
        subtitle="Vận hành nền tảng"
        onLogout={onLogout}
      />

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 20px 40px" }}>
        {loadError !== null && (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 12 }}>
            {loadError}
          </p>
        )}

        <TotalsStrip companies={companies} />
        <Feedback note={banner} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
            marginTop: 14,
          }}
        >
          <CompanyList
            companies={companies}
            selectedId={selected?.tenant_id ?? null}
            onSelect={setSelectedTenantId}
            onCreateClick={() => setCreating(true)}
          />

          {selected !== null ? (
            <CompanyDetail session={session} company={selected} onChanged={reloadCompanies} />
          ) : (
            <Panel title="Chi tiết công ty">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--ink-faint)",
                  padding: "24px 0",
                }}
              >
                <PeopleIcon size={16} />
                Chọn một công ty ở cột trái để xem tài khoản và phòng ban của nó.
              </div>
            </Panel>
          )}
        </div>
      </div>

      {creating && (
        <Modal title="Tạo công ty mới" onClose={() => setCreating(false)}>
          <CreateCompanyForm
            session={session}
            onCreated={(name) => {
              setCreating(false);
              setBanner({ tone: "good", text: `Đã tạo công ty "${name}". Thêm phòng ban đầu tiên ở cột phải.` });
              reloadCompanies();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

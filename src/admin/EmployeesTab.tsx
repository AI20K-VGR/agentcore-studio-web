/**
 * Tab "Nhân viên" — nơi admin công ty vận hành đội ngũ của mình.
 *
 * Bố cục **danh sách trước, form sau** (web#30): vai này vào đây để xem và sửa đội ngũ đang có,
 * không phải để tạo thêm. Bản trước mở ra là hai form xếp dọc trong một cột 760px, còn bảng thì
 * chỉ có email — nhìn `nv.thu@ankor.vn` và `nv.thu2@ankor.vn` không biết ai là ai.
 *
 * Khối "Phòng ban" ở đầu trang gộp vào cột trái dưới dạng một dòng chip, kèm **một câu nói ai tạo/
 * sửa phòng ban được**. Câu đó là thứ gỡ ngõ cụt của ngày đầu tiên: công ty mới mở chưa có phòng
 * ban nào thì không tạo được nhân viên, mà admin cũng không tạo được phòng ban (quyền đó thuộc
 * superadmin — `routes/sections.py`, có lý do: đổi tên cascade sang `core.users.system_roles`), và
 * bản trước không nói ra điều đó ở đâu cả.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { Badge, RoleBadge, StatusBadge } from "../components/Badge";
import { CheckCircleIcon, CloseIcon, FolderIcon, KeyIcon, PeopleIcon } from "../icons";
import PasswordInput from "../components/PasswordInput";
import {
  createUser,
  deactivateUser,
  grantAdmin,
  listUsers,
  reactivateUser,
  resetEmployeePassword,
  revokeAdmin,
  updateUser,
  type UserSummary,
} from "./usersApi";
import { listSections, type SectionSummary } from "./sectionsApi";
import { bulkSummary, parseBulkRows, splitRows, type BulkOutcome } from "./bulkImport";
import {
  displayNameOf,
  employeeActionQuestion,
  filterEmployees,
  formatDate,
  lastLoginLabel,
  teamTotals,
  type StatusFilter,
} from "./employeesView";

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
  background: "var(--tier-admin)",
  border: "none",
  padding: "8px 16px",
};

const quietButtonStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer", fontWeight: 600 };

type Note = { tone: "good" | "bad"; text: string } | null;

function readableError(err: unknown): string {
  return err instanceof StudioApiError ? err.message : String(err);
}

/** Dòng phản hồi dùng chung. Bản trước chỉ hiện lỗi — sửa phòng ban, vô hiệu hoá, kích hoạt lại
 * xong đều im lặng, người dùng phải tự soi lại bảng xem có gì đổi không. */
function Feedback({ note }: { note: Note }) {
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

function RoleCheckboxes({
  availableRoles,
  selected,
  onChange,
  disabled,
}: {
  availableRoles: string[];
  selected: string[];
  onChange: (roles: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {availableRoles.map((r) => (
        <label key={r} style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center", color: "var(--ink-soft)" }}>
          <input
            type="checkbox"
            checked={selected.includes(r)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? [...selected, r] : selected.filter((x) => x !== r))}
          />
          <code style={{ fontFamily: "var(--font-mono)" }}>{r}</code>
        </label>
      ))}
    </div>
  );
}

function CreateEmployeeForm({
  session,
  availableRoles,
  onCreated,
}: {
  session: Session;
  availableRoles: string[];
  onCreated: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || roles.length === 0) {
      setError("Cần email và ít nhất một phòng ban.");
      return;
    }
    if (password.length < 8) {
      setError("Mật khẩu phải từ 8 ký tự trở lên.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createUser(email.trim(), password, roles, session);
      // Đặt tên là bước RIÊNG (`create_user` không nhận `display_name`). Nếu nó hỏng — mất mạng,
      // timeout — thì tài khoản ĐÃ được tạo; báo lỗi chung rồi không gọi `onCreated` sẽ khiến admin
      // thử lại với cùng email và vướng "email đã tồn tại" mà không hiểu vì sao (review web#38).
      //
      // Nên: coi lượt tạo là THÀNH CÔNG ngay khi `createUser` xong, và nói riêng phần tên nếu nó
      // hỏng. Tài khoản dùng được, tên sửa lại được ở panel Chi tiết.
      let nameWarning = "";
      if (displayName.trim()) {
        try {
          await updateUser(created.user_id, { displayName: displayName.trim() }, session);
        } catch {
          nameWarning = " (chưa đặt được tên — sửa lại ở panel Chi tiết)";
        }
      }
      onCreated(email.trim() + nameWarning);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Field label="Email">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nv.thu@ankor.vn"
          autoFocus
          disabled={busy}
          style={{ ...inputStyle, width: "100%" }}
        />
      </Field>
      <Field label="Tên (không bắt buộc)">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nguyễn Thị Thu"
          disabled={busy}
          style={{ ...inputStyle, width: "100%" }}
        />
      </Field>
      <Field label="Mật khẩu (tối thiểu 8 ký tự)">
        <PasswordInput value={password} onChange={setPassword} style={inputStyle} />
      </Field>
      <Field label="Xác nhận mật khẩu">
        <PasswordInput value={confirmPassword} onChange={setConfirmPassword} style={inputStyle} />
      </Field>
      <Field label="Phòng ban">
        <RoleCheckboxes availableRoles={availableRoles} selected={roles} onChange={setRoles} disabled={busy} />
      </Field>
      <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, marginTop: 4 }}>
        {busy ? "Đang tạo…" : "Tạo nhân viên"}
      </button>
      <Feedback note={error === null ? null : { tone: "bad", text: error }} />
    </form>
  );
}

function BulkImportForm({
  session,
  availableRoles,
  onDone,
}: {
  session: Session;
  availableRoles: string[];
  onDone: (summary: string) => void;
}) {
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => parseBulkRows(text, availableRoles), [text, availableRoles]);
  const { ready, broken } = useMemo(() => splitRows(rows), [rows]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ready.length === 0) {
      setError("Chưa có dòng nào hợp lệ để tạo.");
      return;
    }
    if (password.length < 8) {
      setError("Mật khẩu ban đầu phải từ 8 ký tự trở lên.");
      return;
    }
    setBusy(true);
    setError(null);

    // Chạy TUẦN TỰ và **không dừng ở dòng lỗi**: một email trùng ở dòng 7 không phải lý do để 8
    // dòng còn lại không được tạo. Người dán 15 dòng mà mất cả lô vì một dòng sẽ phải tự dò xem
    // dòng nào đã vào — đúng thứ tính năng này sinh ra để tránh.
    const outcomes: BulkOutcome[] = [];
    for (const row of ready) {
      try {
        const created = await createUser(row.email, password, row.roles, session);
        if (row.displayName) {
          // Đặt tên hỏng KHÔNG làm hỏng dòng: tài khoản đã tạo và dùng được, tên sửa lại được ở
          // panel Chi tiết — cùng lý do đã áp cho form tạo đơn.
          try {
            await updateUser(created.user_id, { displayName: row.displayName }, session);
          } catch {
            /* bỏ qua có chủ đích — xem trên */
          }
        }
        outcomes.push({ line: row.line, email: row.email, status: "created", detail: null });
      } catch (err) {
        outcomes.push({ line: row.line, email: row.email, status: "failed", detail: readableError(err) });
      }
    }

    setBusy(false);
    onDone(bulkSummary(outcomes, broken));
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Field label="Mỗi dòng một người: email, tên, phòng ban">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          disabled={busy}
          placeholder={"thu@ankor.vn, Nguyễn Thị Thu, hr\nnam@ankor.vn, Trần Văn Nam, finance"}
          style={{ ...inputStyle, width: "100%", fontFamily: "var(--font-mono)", resize: "vertical" }}
        />
      </Field>
      <p style={{ fontSize: 11, color: "var(--ink-faint)", margin: 0, lineHeight: 1.6 }}>
        Ngăn cách bằng dấu phẩy, tab hoặc chấm phẩy — dán thẳng từ Excel cũng được. Tên để trống
        cũng được. Dòng bắt đầu bằng <code>#</code> bị bỏ qua.
      </p>

      <Field label="Mật khẩu ban đầu, dùng chung cho cả lô (tối thiểu 8 ký tự)">
        <PasswordInput value={password} onChange={setPassword} style={inputStyle} />
      </Field>

      {rows.length > 0 && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 7, maxHeight: 200, overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }}>
            <tbody>
              {rows.map((row) => (
                <tr key={row.line} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "5px 8px", color: "var(--ink-faint)", width: 28 }}>{row.line}</td>
                  <td style={{ padding: "5px 8px" }}>{row.email || <em>(trống)</em>}</td>
                  <td style={{ padding: "5px 8px", color: "var(--ink-soft)" }}>{row.displayName}</td>
                  <td style={{ padding: "5px 8px" }}>
                    {row.error === null ? (
                      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                        {row.roles.map((r) => (
                          <Badge key={r} tone="tierAdmin" mono>
                            {r}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <span style={{ color: "var(--bad)" }}>{row.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p style={{ fontSize: 12, color: broken.length > 0 ? "var(--warn)" : "var(--ink-soft)", margin: 0 }}>
          {ready.length} dòng sẽ được tạo
          {broken.length > 0 ? ` · ${broken.length} dòng bị bỏ qua (sửa ở trên rồi dán lại)` : ""}
        </p>
      )}

      <button type="submit" disabled={busy || ready.length === 0} style={{ ...primaryButtonStyle, marginTop: 4 }}>
        {busy ? `Đang tạo ${ready.length} tài khoản…` : `Tạo ${ready.length} tài khoản`}
      </button>
      <Feedback note={error === null ? null : { tone: "bad", text: error }} />
    </form>
  );
}


function EmployeeList({
  users,
  sections,
  selectedId,
  onSelect,
  onCreateClick,
}: {
  users: readonly UserSummary[];
  sections: readonly SectionSummary[];
  selectedId: string | null;
  onSelect: (userId: string) => void;
  onCreateClick: () => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const visible = useMemo(
    () => filterEmployees(users, { query, role: role || null, status }),
    [users, query, role, status],
  );
  const noSections = sections.length === 0;

  return (
    <Panel
      title={`Nhân viên (${users.length})`}
      right={
        <button type="button" onClick={onCreateClick} disabled={noSections} style={primaryButtonStyle}>
          + Thêm nhân viên
        </button>
      }
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên hoặc email…"
          style={{ ...inputStyle, flex: 1, minWidth: 150 }}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
          <option value="">Mọi phòng ban</option>
          {sections.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} style={inputStyle}>
          <option value="all">Mọi trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Đã vô hiệu hoá</option>
        </select>
      </div>

      {users.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: 0 }}>
          {noSections ? "Cần có phòng ban trước khi thêm nhân viên." : "Chưa có nhân viên nào."}
        </p>
      )}
      {users.length > 0 && visible.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: 0 }}>Không có ai khớp bộ lọc này.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((u) => {
          const selected = u.user_id === selectedId;
          return (
            <button
              key={u.user_id}
              type="button"
              onClick={() => onSelect(u.user_id)}
              aria-pressed={selected}
              style={{
                textAlign: "left",
                cursor: "pointer",
                padding: "9px 10px",
                borderRadius: 7,
                border: "1px solid " + (selected ? "var(--tier-admin)" : "var(--line)"),
                background: selected ? "var(--tier-admin-soft)" : "var(--surface)",
                fontFamily: "var(--font-body)",
                color: "var(--ink)",
                opacity: u.is_active ? 1 : 0.6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{displayNameOf(u)}</span>
                {u.system_roles.includes("admin") && <Badge tone="admin">admin</Badge>}
                {!u.is_active && <Badge tone="bad">đã khoá</Badge>}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 3 }}>
                {u.display_name ? `${u.email} · ` : ""}
                {u.system_roles.filter((r) => r !== "admin").join(", ") || "chưa có phòng ban"} ·{" "}
                {lastLoginLabel(u.last_login_at)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Câu gỡ ngõ cụt. Nói CẢ việc tạo lẫn việc sửa tên: gõ sai tên phòng ban là chuyện xảy ra
          ngay lần đầu, và bản trước không cho người dùng biết đường nào để gỡ. */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          <FolderIcon size={13} style={{ color: "var(--ink-faint)" }} />
          {sections.length > 0 ? (
            sections.map((s) => (
              <Badge key={s.id} tone="tierAdmin" mono>
                {s.name}
              </Badge>
            ))
          ) : (
            <span style={{ fontSize: 12, color: "var(--warn)" }}>Công ty chưa có phòng ban nào.</span>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--ink-faint)", margin: 0, lineHeight: 1.6 }}>
          Phòng ban do <strong>superadmin</strong> quản — cần thêm hoặc sửa tên thì liên hệ họ. Bạn chỉ được xem.
        </p>
      </div>
    </Panel>
  );
}

function EmployeeDetail({
  session,
  user,
  availableRoles,
  isSelf,
  onChanged,
}: {
  session: Session;
  user: UserSummary;
  availableRoles: string[];
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [note, setNote] = useState<Note>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(user.display_name ?? "");
  const [draftEmail, setDraftEmail] = useState(user.email);
  const [draftRoles, setDraftRoles] = useState<string[]>(user.system_roles.filter((r) => r !== "admin"));
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Lỗi của modal đặt lại mật khẩu phải sống TRONG modal. `Modal` là `position: fixed; inset: 0`,
  // nên một `<Feedback>` ở cấp `Panel` bị nó phủ kín — người dùng bấm "Đặt lại" với mật khẩu sai
  // sẽ không thấy phản hồi nào và tưởng app treo (review web#38, Dozyboy).
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    setNote(null);
    setEditing(false);
    setDraftName(user.display_name ?? "");
    setDraftEmail(user.email);
    setDraftRoles(user.system_roles.filter((r) => r !== "admin"));
  }, [user]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      setNote({ tone: "good", text: success });
    } catch (err) {
      setNote({ tone: "bad", text: readableError(err) });
    } finally {
      // Tải lại KỂ CẢ khi lỗi (review web#38, Dozyboy). Một request có thể ghi được một phần rồi
      // mới hỏng — `PATCH` gộp ba field là ca rõ nhất. Chỉ tải lại ở nhánh thành công nghĩa là
      // panel bên phải tiếp tục hiện dữ liệu cũ trong khi server đã đổi, và người dùng không có
      // cách nào biết.
      //
      // (app#83 đã làm `PATCH` thành atomic nên ca đó không còn ghi nửa vời — nhưng "server không
      // bao giờ ghi một phần" là một sự thật về bản cài đặt hiện tại, không phải một bất biến mà
      // giao diện được phép dựa vào.)
      onChanged();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draftRoles.length === 0) {
      setNote({ tone: "bad", text: "Cần ít nhất một phòng ban." });
      return;
    }
    const isAdmin = user.system_roles.includes("admin");
    const patch: { roles?: string[]; email?: string; displayName?: string } = {};
    if (draftName !== (user.display_name ?? "")) patch.displayName = draftName;
    if (!isSelf && draftEmail.trim() !== user.email) patch.email = draftEmail.trim();
    // `admin` KHÔNG nằm trong ô tick — nó có nút riêng bên dưới. Nhưng khi gửi roles thì phải giữ
    // lại nó, nếu không một lần "Lưu" sẽ âm thầm thu quyền quản trị của người đang giữ.
    const nextRoles = isAdmin ? [...draftRoles, "admin"] : draftRoles;
    if (!isSelf && nextRoles.join() !== user.system_roles.join()) patch.roles = nextRoles;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    await run(() => updateUser(user.user_id, patch, session), "Đã lưu thay đổi.");
    setEditing(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setResetError("Mật khẩu phải từ 8 ký tự trở lên.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setResetError(null);
    try {
      await resetEmployeePassword(user.user_id, newPassword, session);
      // Nói ra hai hệ quả người bấm không đoán được: phiên đang mở bị cắt, và chính chủ bị buộc
      // đổi mật khẩu ở lần đăng nhập kế tiếp.
      setNote({
        tone: "good",
        text: `Đã đặt lại mật khẩu cho ${displayNameOf(user)}. Phiên đang mở của họ bị cắt, và họ phải tự đổi lại ở lần đăng nhập kế tiếp.`,
      });
      setResetting(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setResetError(readableError(err));
    }
  };

  const isAdmin = user.system_roles.includes("admin");

  const toggleActive = async () => {
    const question = employeeActionQuestion(user.is_active ? { kind: "deactivate", user } : { kind: "reactivate" });
    if (question !== null && !window.confirm(question)) return;
    await run(
      () => (user.is_active ? deactivateUser(user.user_id, session) : reactivateUser(user.user_id, session)),
      user.is_active ? `Đã vô hiệu hoá ${displayNameOf(user)}.` : `Đã kích hoạt lại ${displayNameOf(user)}.`,
    );
  };

  const toggleAdmin = async () => {
    const question = employeeActionQuestion(isAdmin ? { kind: "revoke-admin", user } : { kind: "grant-admin" });
    if (question !== null && !window.confirm(question)) return;
    await run(
      () => (isAdmin ? revokeAdmin(user.user_id, session) : grantAdmin(user.user_id, session)),
      isAdmin ? `Đã thu quyền quản trị của ${displayNameOf(user)}.` : `Đã phong quyền quản trị cho ${displayNameOf(user)}.`,
    );
  };

  return (
    <Panel
      title="Chi tiết"
      right={
        !isSelf && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setEditing((v) => !v)} style={quietButtonStyle}>
              {editing ? "Huỷ" : "Sửa"}
            </button>
            <button
              type="button"
              onClick={() => {
                setResetting(true);
                setNewPassword("");
                setConfirmPassword("");
                setResetError(null);
              }}
              style={{ ...quietButtonStyle, display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <KeyIcon size={12} />
              Đặt lại mật khẩu
            </button>
            <button type="button" onClick={toggleAdmin} style={quietButtonStyle}>
              {isAdmin ? "Thu quyền quản trị" : "Phong quản trị"}
            </button>
            <button
              type="button"
              onClick={toggleActive}
              style={{ ...quietButtonStyle, color: user.is_active ? "var(--bad)" : "var(--good)" }}
            >
              {user.is_active ? "Vô hiệu hoá" : "Kích hoạt lại"}
            </button>
          </div>
        )
      }
    >
      {editing ? (
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Tên (để trống là bỏ tên, hiển thị bằng email)">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
              style={{ ...inputStyle, width: "100%" }}
            />
          </Field>
          <Field label="Email">
            <input
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            />
          </Field>
          <Field label="Phòng ban">
            <RoleCheckboxes availableRoles={availableRoles} selected={draftRoles} onChange={setDraftRoles} />
          </Field>
          <button type="submit" style={{ ...primaryButtonStyle, width: "fit-content" }}>
            Lưu
          </button>
        </form>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display)" }}>
              {displayNameOf(user)}
            </span>
            <StatusBadge active={user.is_active} />
            {isSelf && <Badge tone="neutral">tài khoản của bạn</Badge>}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>{user.email}</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
            {user.system_roles.map((r) => (
              <RoleBadge key={r} role={r} />
            ))}
          </div>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "6px 14px",
              fontSize: 11.5,
              color: "var(--ink-faint)",
              margin: "14px 0 0",
            }}
          >
            <dt>Đăng nhập gần nhất</dt>
            <dd style={{ margin: 0, color: "var(--ink-soft)" }}>{lastLoginLabel(user.last_login_at)}</dd>
            <dt>Tạo lúc</dt>
            <dd style={{ margin: 0, color: "var(--ink-soft)" }}>{formatDate(user.created_at)}</dd>
          </dl>
          {isSelf && (
            <p style={{ fontSize: 11, color: "var(--ink-faint)", margin: "12px 0 0", lineHeight: 1.6 }}>
              Không sửa được tài khoản của chính mình từ đây — đổi mật khẩu ở menu Tài khoản góc trên phải.
            </p>
          )}
        </>
      )}

      {resetting && (
        <Modal title={`Đặt lại mật khẩu — ${displayNameOf(user)}`} onClose={() => setResetting(false)}>
          <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Mật khẩu mới (tối thiểu 8 ký tự)">
              <PasswordInput value={newPassword} onChange={setNewPassword} style={inputStyle} autoFocus />
            </Field>
            <Field label="Xác nhận mật khẩu mới">
              <PasswordInput value={confirmPassword} onChange={setConfirmPassword} style={inputStyle} />
            </Field>
            <p style={{ fontSize: 11, color: "var(--ink-faint)", margin: 0, lineHeight: 1.6 }}>
              Phiên đang mở của họ bị cắt ngay, và họ phải tự đổi mật khẩu ở lần đăng nhập kế tiếp.
            </p>
            <button type="submit" style={{ ...primaryButtonStyle, width: "fit-content" }}>
              Đặt lại
            </button>
            <Feedback note={resetError === null ? null : { tone: "bad", text: resetError }} />
          </form>
        </Modal>
      )}

      <Feedback note={note} />
    </Panel>
  );
}

function TotalsStrip({ users, sections }: { users: readonly UserSummary[]; sections: readonly SectionSummary[] }) {
  const totals = teamTotals(users);
  const cells: { label: string; value: number; tone?: "bad" }[] = [
    { label: "Nhân viên", value: totals.total },
    { label: "Đang hoạt động", value: totals.active },
    ...(totals.inactive > 0 ? [{ label: "Đã khoá", value: totals.inactive, tone: "bad" as const }] : []),
    { label: "Quản trị viên", value: totals.admins },
    { label: "Phòng ban", value: sections.length },
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

export default function EmployeesTab({ session }: { session: Session }) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // `null` = modal đóng. Hai chế độ tạo dùng CHUNG một modal thay vì hai nút riêng trên thanh:
  // đây là hai cách làm cùng một việc, và tách thành hai lối vào sẽ bắt người dùng chọn trước khi
  // biết mình đang chọn gì.
  const [creating, setCreating] = useState<"one" | "bulk" | null>(null);
  const [banner, setBanner] = useState<Note>(null);

  const reload = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([listUsers(session), listSections(session)]);
      setUsers(u);
      setSections(s);
      setLoadError(null);
    } catch (err) {
      // Câu mở đầu gắn ở NGUỒN. Bản trước gắn cứng một tiền tố ở chỗ hiển thị cho MỌI lỗi đổ vào
      // cùng một biến, nên lỗi thao tác hiện ra thành lỗi tải danh sách (cùng lớp lỗi đã sửa ở
      // web#27 mục 2). Giờ lỗi thao tác ở lại đúng khối thao tác của nó.
      setLoadError(`Không tải được danh sách: ${readableError(err)}`);
    }
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  const availableRoles = useMemo(() => sections.map((s) => s.name), [sections]);
  const selected = users.find((u) => u.user_id === selectedId) ?? users[0] ?? null;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 20px 40px", fontFamily: "var(--font-body)" }}>
      {loadError !== null && (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 12 }}>
          {loadError}
        </p>
      )}

      <TotalsStrip users={users} sections={sections} />
      <Feedback note={banner} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
          marginTop: 14,
        }}
      >
        <EmployeeList
          users={users}
          sections={sections}
          selectedId={selected?.user_id ?? null}
          onSelect={setSelectedId}
          onCreateClick={() => setCreating("one")}
        />

        {selected !== null ? (
          <EmployeeDetail
            session={session}
            user={selected}
            availableRoles={availableRoles}
            isSelf={selected.email === session.user}
            onChanged={reload}
          />
        ) : (
          <Panel title="Chi tiết">
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
              Chọn một nhân viên ở cột trái để xem và sửa thông tin của họ.
            </div>
          </Panel>
        )}
      </div>

      {creating !== null && (
        <Modal title="Thêm nhân viên" onClose={() => setCreating(null)}>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {(
              [
                ["one", "Từng người"],
                ["bulk", "Dán danh sách"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCreating(mode)}
                aria-pressed={creating === mode}
                style={{
                  ...quietButtonStyle,
                  flex: 1,
                  border: "1px solid " + (creating === mode ? "var(--tier-admin)" : "var(--line)"),
                  background: creating === mode ? "var(--tier-admin-soft)" : "var(--surface)",
                  color: creating === mode ? "var(--tier-admin)" : "var(--ink-soft)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {creating === "one" ? (
            <CreateEmployeeForm
              session={session}
              availableRoles={availableRoles}
              onCreated={(email) => {
                setCreating(null);
                setBanner({ tone: "good", text: `Đã tạo tài khoản ${email}.` });
                reload();
              }}
            />
          ) : (
            <BulkImportForm
              session={session}
              availableRoles={availableRoles}
              onDone={(summary) => {
                setCreating(null);
                // Câu tổng kết mang cả số tạo được lẫn mẫu số và tên dòng lỗi, nên nó là `good`
                // kể cả khi có dòng hỏng — lô chạy xong thật, chỉ là chưa trọn vẹn.
                setBanner({ tone: "good", text: summary });
                reload();
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

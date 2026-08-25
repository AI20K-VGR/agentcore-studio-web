/**
 * Tab "Nhân viên" trong `AdminConsole` — admin tạo (`POST`), sửa roles (`PATCH`), vô hiệu hoá
 * (`DELETE` — KHÔNG xoá cứng, xem docstring `routes/admin.py::deactivate_user`)/kích hoạt lại
 * (`POST .../reactivate`) tài khoản nhân viên. `roles` chọn qua checkbox từ danh sách phòng ban
 * THẬT của tenant (`listSections`), không gõ tay — tránh lỗi chính tả tạo ra role không ai với
 * tới được (đúng lý do `core.sections` tồn tại).
 */

import { useCallback, useEffect, useState } from "react";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";
import { Card } from "../components/Card";
import { RoleBadge, StatusBadge } from "../components/Badge";
import {
  createUser,
  deactivateUser,
  listUsers,
  reactivateUser,
  updateUserRoles,
  type UserSummary,
} from "./usersApi";
import { listSections, type SectionSummary } from "./sectionsApi";
import PasswordInput from "../components/PasswordInput";

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

function RoleCheckboxes({
  availableRoles,
  selected,
  onChange,
}: {
  availableRoles: string[];
  selected: string[];
  onChange: (roles: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {availableRoles.map((r) => (
        <label key={r} style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center", color: "var(--ink-soft)" }}>
          <input
            type="checkbox"
            checked={selected.includes(r)}
            onChange={(e) => onChange(e.target.checked ? [...selected, r] : selected.filter((x) => x !== r))}
          />
          <code style={{ fontFamily: "var(--font-mono)" }}>{r}</code>
        </label>
      ))}
    </div>
  );
}

function EmployeeRow({
  user,
  availableRoles,
  session,
  onChanged,
  onError,
}: {
  user: UserSummary;
  availableRoles: string[];
  session: Session;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftRoles, setDraftRoles] = useState<string[]>(user.roles);
  const [busy, setBusy] = useState(false);
  // Server chặn cứng (400) tự vô hiệu hoá chính tài khoản đang đăng nhập — `routes/admin.py::
  // deactivate_user`. Ẩn nút ở ĐÚNG dòng của chính mình thay vì để bấm rồi nhận lỗi: UI ẩn nút
  // không thay được kiểm tra server, nhưng hiện 1 nút LUÔN thất bại cũng là UX tệ, không phải
  // "an toàn hơn" — 2 việc khác nhau.
  const isSelf = user.email === session.user;

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onChanged();
      setEditing(false);
    } catch (err) {
      onError(err instanceof StudioApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr style={{ borderBottom: "1px solid var(--line)", opacity: user.is_active ? 1 : 0.55 }}>
      <td style={{ padding: "8px 6px" }}>{user.email}</td>
      <td style={{ padding: "8px 6px" }}>
        {editing ? (
          <RoleCheckboxes availableRoles={availableRoles} selected={draftRoles} onChange={setDraftRoles} />
        ) : (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {user.roles.map((r) => (
              <RoleBadge key={r} role={r} />
            ))}
          </div>
        )}
      </td>
      <td style={{ padding: "8px 6px" }}>
        <StatusBadge active={user.is_active} />
      </td>
      <td style={{ padding: "8px 6px", color: "var(--ink-faint)" }}>{new Date(user.created_at).toLocaleString()}</td>
      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
        {isSelf ? (
          // Server chặn cứng (400) cả 2 hành động trên CHÍNH tài khoản đang đăng nhập — ẩn nút
          // ở đây thay vì để bấm rồi luôn nhận lỗi, xem comment `isSelf` ở trên.
          <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>tài khoản của bạn</span>
        ) : editing ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction(() => updateUserRoles(user.user_id, draftRoles, session))}
              style={{ ...inputStyle, cursor: "pointer", marginRight: 4, background: "var(--tier-admin)", color: "#fff", border: "none" }}
            >
              Lưu
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraftRoles(user.roles);
                setEditing(false);
              }}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              Huỷ
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              style={{ ...inputStyle, cursor: "pointer", marginRight: 4 }}
            >
              Sửa
            </button>
            {user.is_active ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(() => deactivateUser(user.user_id, session))}
                style={{ ...inputStyle, cursor: "pointer", color: "var(--bad)" }}
              >
                Vô hiệu hoá
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(() => reactivateUser(user.user_id, session))}
                style={{ ...inputStyle, cursor: "pointer", color: "var(--good)" }}
              >
                Kích hoạt lại
              </button>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

export default function EmployeesTab({ session }: { session: Session }) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [createState, setCreateState] = useState<"idle" | "saving" | "error">("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([listUsers(session), listSections(session)]);
      setUsers(u);
      setSections(s);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof StudioApiError ? err.message : String(err));
    }
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || roles.length === 0) {
      setCreateError("Cần email, mật khẩu, và ít nhất 1 role.");
      setCreateState("error");
      return;
    }
    if (password !== confirmPassword) {
      setCreateError("Mật khẩu xác nhận không khớp.");
      setCreateState("error");
      return;
    }
    setCreateState("saving");
    setCreateError(null);
    try {
      await createUser(email.trim(), password, roles, session);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setRoles([]);
      await reload();
      setCreateState("idle");
    } catch (err) {
      setCreateError(err instanceof StudioApiError ? err.message : String(err));
      setCreateState("error");
    }
  };

  // KHÔNG đưa "admin" vào danh sách role được chọn ở màn này — dù server (`routes/admin.py::
  // create_user`/`update_user_roles`) vẫn CHO PHÉP company-admin tự phong "admin" cho nhân viên
  // khác (cố ý, để công ty không bị khoá cứng nếu admin duy nhất rời đi — xem docstring 2 route
  // đó), riêng UI phía admin công ty ẩn lựa chọn này đi để tránh tự tay tạo thêm admin ngoài ý
  // muốn. Phong admin thêm (nếu công ty thật sự cần) vẫn làm được thẳng qua API, chỉ là không có
  // nút bấm sẵn ở đây nữa.
  const availableRoles = sections.map((s) => s.name);
  // Không hiện chính tài khoản đang đăng nhập trong danh sách này — họ không phải 1 "nhân viên"
  // cần quản lý qua bảng này (đổi mật khẩu của mình đã có ở menu Tài khoản), và mọi nút hành động
  // ở dòng đó vốn cũng đã bị khoá (xem `isSelf` trong `EmployeeRow`).
  const otherUsers = users.filter((u) => u.email !== session.user);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px", fontFamily: "var(--font-body)" }}>
      <Card title="Tạo nhân viên mới">
        {sections.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--warn)" }}>Công ty chưa có phòng ban nào.</p>
        )}
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 380 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" style={inputStyle} />
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="mật khẩu (>=8 ký tự)"
            style={inputStyle}
          />
          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="xác nhận mật khẩu"
            style={inputStyle}
          />
          <RoleCheckboxes availableRoles={availableRoles} selected={roles} onChange={setRoles} />
          {createError && (
            <p style={{ color: "var(--bad)", fontSize: 12, margin: 0 }} role="alert">
              {createError}
            </p>
          )}
          <button
            type="submit"
            disabled={createState === "saving"}
            style={{ ...inputStyle, cursor: "pointer", width: "fit-content", fontWeight: 700, color: "#fff", background: "var(--tier-admin)", border: "none", padding: "8px 16px" }}
          >
            {createState === "saving" ? "Đang tạo…" : "Tạo nhân viên"}
          </button>
        </form>
      </Card>

      <Card title="Nhân viên hiện có">
        {loadError && (
          <p style={{ color: "var(--bad)", fontSize: 12 }} role="alert">
            {loadError}
          </p>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line-strong)" }}>
                <th style={{ padding: "6px", color: "var(--ink-faint)", fontSize: 11, textTransform: "uppercase" }}>Email</th>
                <th style={{ padding: "6px", color: "var(--ink-faint)", fontSize: 11, textTransform: "uppercase" }}>Roles</th>
                <th style={{ padding: "6px", color: "var(--ink-faint)", fontSize: 11, textTransform: "uppercase" }}>Trạng thái</th>
                <th style={{ padding: "6px", color: "var(--ink-faint)", fontSize: 11, textTransform: "uppercase" }}>Tạo lúc</th>
                <th style={{ padding: "6px" }}></th>
              </tr>
            </thead>
            <tbody>
              {otherUsers.map((u) => (
                <EmployeeRow
                  key={u.user_id}
                  user={u}
                  availableRoles={availableRoles}
                  session={session}
                  onChanged={reload}
                  onError={setLoadError}
                />
              ))}
              {otherUsers.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "12px 6px", color: "var(--ink-faint)" }}>
                    Chưa có nhân viên nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

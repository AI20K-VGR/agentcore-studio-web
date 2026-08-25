/**
 * `GoldenSetCard` — form "Nhập tay".
 *
 * Bài ở đây tồn tại vì một blocker **lọt qua 49 bài thuần** (review web#27, Dozyboy): `sections`
 * về SAU khi component mount, mà initializer của `useState` chỉ chạy lần render đầu — nên hai ô
 * phòng ban khởi tạo rỗng và người dùng gửi được `section_roles: [""]` lên backend.
 *
 * Không phép thử thuần nào chạm tới được lớp lỗi đó: nó nằm ở **vòng đời render**, không ở phép
 * biến đổi dữ liệu. Đó là lý do file này dùng `@testing-library/react` thay vì gọi hàm.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploadGoldenSet = vi.fn();
vi.mock("./goldenSetsApi", async (orig) => ({
  ...(await orig<typeof import("./goldenSetsApi")>()),
  uploadGoldenSet: (...args: unknown[]) => uploadGoldenSet(...args),
}));

const { default: GoldenSetCard } = await import("./GoldenSetCard");

const session = {
  token: "t",
  tenantId: "x",
  tenantName: "Acme",
  user: "u",
  systemRoles: ["admin"],
} as never;

// Vitest ở repo này KHÔNG bật `globals`, nên testing-library không tự gắn cleanup — thiếu dòng
// này thì component của bài trước còn nằm trong document và mọi truy vấn theo vai/nhãn đều khớp
// hai lần. Bài đỏ khi đó chỉ tay vào "multiple elements", không chỉ vào lỗi thật.
afterEach(cleanup);

beforeEach(() => {
  uploadGoldenSet.mockReset();
  uploadGoldenSet.mockResolvedValue({
    golden_set_ref: "kb-hr-auto-v1",
    tenant_id: "x",
    n_case: 1,
    n_traps: 0,
    n_uploaded: 1,
    n_kept_from_existing: 0,
  });
});

function fillAndSave() {
  fireEvent.click(screen.getByRole("button", { name: /Nhập tay/ }));
  const inputs = screen.getAllByRole("textbox");
  fireEvent.change(inputs[0], {
    target: { value: "Nghỉ phép bao nhiêu ngày?" },
  });
  fireEvent.change(inputs[1], { target: { value: "12 ngày" } });
  fireEvent.click(screen.getByRole("button", { name: /Lưu vào bộ câu hỏi/ }));
}

describe("form nhập tay", () => {
  it("phòng ban về SAU khi mount vẫn được điền vào case gửi lên", async () => {
    // Đúng ca blocker: render lần đầu với `sections` rỗng (chưa có phản hồi `listSections`), rồi
    // mới có danh sách. Nếu thiếu bước đồng bộ, hai ô phòng ban đứng rỗng vĩnh viễn.
    const { rerender } = render(
      <GoldenSetCard session={session} sections={[]} tenant="Acme" />,
    );
    rerender(
      <GoldenSetCard
        session={session}
        sections={["hr", "finance"]}
        tenant="Acme"
      />,
    );

    fillAndSave();

    await waitFor(() => expect(uploadGoldenSet).toHaveBeenCalled());
    const cases = uploadGoldenSet.mock.calls[0][1] as {
      section_roles: string[];
      expected_section_role: string;
    }[];
    expect(cases[0].section_roles).toEqual(["hr"]);
    expect(cases[0].expected_section_role).toBe("hr");
  });

  it("tenant CHƯA có phòng ban nào thì không gửi gì lên", async () => {
    // `useEffect` không cứu được ca này (không có gì để đồng bộ), nên chốt phải nằm ở chỗ gửi.
    // Một case mang `section_roles: [""]` đi tới backend là dữ liệu hỏng nằm im trong bộ chấm —
    // không lỗi, không cảnh báo, chỉ sai lúc chấm điểm.
    render(<GoldenSetCard session={session} sections={[]} tenant="Acme" />);
    fireEvent.click(screen.getByRole("button", { name: /Nhập tay/ }));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], {
      target: { value: "Nghỉ phép bao nhiêu ngày?" },
    });
    fireEvent.change(inputs[1], { target: { value: "12 ngày" } });

    const save = screen.getByRole("button", {
      name: /Lưu vào bộ câu hỏi/,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    await Promise.resolve();
    expect(uploadGoldenSet).not.toHaveBeenCalled();
  });
});

describe("ranh giới giữa ba tab (review web#27 đợt 2)", () => {
  it("mục 4 — 'Tên bộ' gõ ở tab Tải file KHÔNG kéo theo câu gõ tay", async () => {
    // `ref` là state dùng chung nhưng ô nhập chỉ có ở tab "Tải file lên". Bản trước, gõ tên bộ ở
    // đó rồi chuyển sang "Nhập tay" mà không nạp file sẽ khiến câu gõ tay bay vào một bộ khác —
    // im lặng, không có gì trên màn hình giải thích.
    render(<GoldenSetCard session={session} sections={["hr"]} tenant="Acme" />);

    fireEvent.click(screen.getByRole("button", { name: /Tải file/ }));
    const refInput = screen.getByPlaceholderText("kb-hr-auto-v1");
    fireEvent.change(refInput, { target: { value: "kb-hr-audit-v3" } });

    fillAndSave();

    await waitFor(() => expect(uploadGoldenSet).toHaveBeenCalled());
    expect(uploadGoldenSet.mock.calls[0][0]).toBe("kb-hr-auto-v1");
  });

  it("mục 6 — tab Tải file chưa chọn file thì nút nạp còn khoá", () => {
    // Hai tab kia đều có hàng rào riêng (`!role` ở auto, `sections.length === 0` ở nhập tay), tab
    // này thì không: công ty chưa có phòng ban nào mà để trống "Tên bộ" sẽ gửi đi bộ tên
    // `kb--auto-v1`, sai định dạng, không ai chặn.
    render(<GoldenSetCard session={session} sections={[]} tenant="Acme" />);
    fireEvent.click(screen.getByRole("button", { name: /Tải file/ }));
    const load = screen.getByRole("button", { name: /Nạp bộ câu hỏi/ }) as HTMLButtonElement;
    expect(load.disabled).toBe(true);
  });

  it("mục 7 — tab Tải file nói rõ nạp thêm KHÔNG xoá trắng bộ đang có", () => {
    // Câu này từng có rồi bị xoá trong lần dựng lại card. Thiếu nó, người dùng nạp một file nhỏ
    // sẽ tưởng mình vừa ghi đè cả bộ, và không dám nạp bổ sung nữa.
    render(<GoldenSetCard session={session} sections={["hr"]} tenant="Acme" />);
    fireEvent.click(screen.getByRole("button", { name: /Tải file/ }));
    expect(screen.getByText(/không xoá trắng/i)).toBeTruthy();
  });

  it("mục 5 — câu thêm vào TRONG LÚC đang lưu không bị xoá mất", async () => {
    let resolveUpload: (v: unknown) => void = () => {};
    uploadGoldenSet.mockImplementation(
      () =>
        new Promise((res) => {
          resolveUpload = res;
        }),
    );

    render(<GoldenSetCard session={session} sections={["hr"]} tenant="Acme" />);
    fillAndSave();

    // Request chưa xong. Bản trước `setDrafts([emptyDraft(role)])` thay CẢ mảng, nên mọi dòng
    // thêm vào lúc này biến mất khi request trả về. Giờ nút đó khoá trong lúc bận — chốt thứ nhất.
    const add = screen.getByRole("button", { name: /\+ Thêm câu/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);

    resolveUpload({
      golden_set_ref: "kb-hr-auto-v1",
      tenant_id: "x",
      n_case: 1,
      n_traps: 0,
      n_uploaded: 1,
      n_kept_from_existing: 0,
    });
    await waitFor(() => expect(screen.getByText(/Đã lưu/)).toBeTruthy());
  });
});

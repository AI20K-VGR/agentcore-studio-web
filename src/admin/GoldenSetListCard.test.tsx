/**
 * `GoldenSetListCard` — cửa sổ ĐỌC bộ golden. Bài ở đây tập trung vào hai thứ mà một card danh
 * sách rất dễ làm sai theo cách không ai để ý: gộp "đang tải" với "chưa có gì", và tự suy lại nhãn
 * (bẫy / nguồn) thay vì dùng thứ server đã suy.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GoldenSetListCard from "./GoldenSetListCard";
import type { Session } from "../auth/session";
import { StudioApiError } from "../httpUtil";

vi.mock("./goldenSetsApi", () => ({
  listGoldenSets: vi.fn(),
  fetchGoldenSet: vi.fn(),
}));

import { fetchGoldenSet, listGoldenSets } from "./goldenSetsApi";

afterEach(() => {
  cleanup();
  vi.mocked(listGoldenSets).mockReset();
  vi.mocked(fetchGoldenSet).mockReset();
});

const session: Session = {
  accessToken: "t",
  tenantId: "tenant-1",
  tenantName: "ankor",
  user: "admin@ankor.vn",
  systemRoles: ["admin"],
  mustChangePassword: false,
};

const summary = {
  golden_set_ref: "kb-hr-auto-v1",
  n_cases: 20,
  n_ai: 19,
  n_human: 0,
  n_trap: 1,
  created_at: "2026-08-26T21:23:52+00:00",
};

/** Fixture BẤT ĐỐI XỨNG: mỗi case khác nhau ở đúng một trục (bẫy, nguồn, số trích dẫn), nên một
 * bài xanh nhờ hai trục tình cờ bằng nhau là không thể. */
function caseView(over: Partial<Parameters<typeof Object>[0]> = {}) {
  return {
    case_id: "AI-001",
    query: "Nghỉ phép năm được bao nhiêu ngày?",
    expected: "12 ngày",
    section_roles: ["hr"],
    expected_section_role: "hr",
    source: "ai",
    is_trap: false,
    n_citation: 7,
    citations: ["ankor-hr-leave#c1"],
    ...over,
  };
}

describe("GoldenSetListCard", () => {
  it("fetch chưa resolve → hiện 'Đang tải', KHÔNG hiện 'chưa có bộ nào'", () => {
    // Hai trạng thái này đều cho `rows = []`. Gộp chúng lại thì tenant CÓ bộ vẫn thấy dòng "chưa có
    // bộ nào" trong khung hình đầu — và đó đúng là câu khiến người dùng đi kiểm tra nhầm chỗ.
    vi.mocked(listGoldenSets).mockReturnValue(new Promise(() => {}));
    render(<GoldenSetListCard session={session} />);
    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
    expect(screen.queryByText(/chưa có bộ nào/i)).not.toBeInTheDocument();
  });

  it("tenant chưa có bộ nào → hiện hướng dẫn, không phải màn trống", async () => {
    vi.mocked(listGoldenSets).mockResolvedValue([]);
    render(<GoldenSetListCard session={session} />);
    await waitFor(() => expect(screen.getByText(/chưa có bộ nào/i)).toBeInTheDocument());
  });

  it("fetch lỗi → hiện thông báo, không crash", async () => {
    vi.mocked(listGoldenSets).mockRejectedValue(new StudioApiError("mất kết nối"));
    render(<GoldenSetListCard session={session} />);
    await waitFor(() => expect(screen.getByText(/mất kết nối/i)).toBeInTheDocument());
  });

  it("hiện đủ 4 con số tóm tắt, KHÔNG tự cộng lại thành tổng", async () => {
    // `n_ai + n_human + n_trap` = 20 ở fixture này chỉ là trùng hợp; điều cần khoá là card in
    // NGUYÊN bốn số server trả về chứ không tự tính lại số nào.
    vi.mocked(listGoldenSets).mockResolvedValue([summary]);
    render(<GoldenSetListCard session={session} />);
    await waitFor(() => expect(screen.getByText("kb-hr-auto-v1")).toBeInTheDocument());
    expect(screen.getByText(/20 case · 19 máy sinh · 0 người viết · 1 bẫy/)).toBeInTheDocument();
  });

  it("bấm 'xem case' mới gọi fetchGoldenSet — danh sách không tải sẵn nội dung", async () => {
    vi.mocked(listGoldenSets).mockResolvedValue([summary]);
    vi.mocked(fetchGoldenSet).mockResolvedValue({
      golden_set_ref: "kb-hr-auto-v1",
      n_cases: 1,
      cases: [caseView()],
    });
    render(<GoldenSetListCard session={session} />);
    await waitFor(() => expect(screen.getByText("kb-hr-auto-v1")).toBeInTheDocument());
    expect(fetchGoldenSet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /xem case/i }));
    await waitFor(() => expect(screen.getByText(/nghỉ phép năm được bao nhiêu ngày/i)).toBeInTheDocument());
    expect(fetchGoldenSet).toHaveBeenCalledWith("kb-hr-auto-v1", session);
  });

  it("nhãn BẪY đi theo cờ is_trap của SERVER, không suy lại từ citations", async () => {
    // Case dưới đây mang `is_trap: true` NHƯNG `citations` không rỗng — một hình dạng chỉ xảy ra
    // khi ai đó đổi cách suy ở một trong hai tầng. Card phải tin server; suy lại ở client là dựng
    // nguồn sự thật thứ hai, và hai nguồn đó sẽ lệch đúng vào ngày cách suy thay đổi.
    vi.mocked(listGoldenSets).mockResolvedValue([summary]);
    vi.mocked(fetchGoldenSet).mockResolvedValue({
      golden_set_ref: "kb-hr-auto-v1",
      n_cases: 1,
      cases: [caseView({ is_trap: true, citations: ["x#c1"], n_citation: 1 })],
    });
    render(<GoldenSetListCard session={session} />);
    await waitFor(() => expect(screen.getByText("kb-hr-auto-v1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /xem case/i }));
    await waitFor(() => expect(screen.getByText("BẪY")).toBeInTheDocument());
  });

  it("source null hiện 'chưa khai', KHÔNG gộp vào 'người viết'", async () => {
    // `source` vắng nghĩa là bộ sinh chưa khai nguồn (DEC-D16-03). Đoán hộ ở tầng hiển thị giấu
    // đúng thứ mặc định `null` tồn tại để lộ ra.
    vi.mocked(listGoldenSets).mockResolvedValue([summary]);
    vi.mocked(fetchGoldenSet).mockResolvedValue({
      golden_set_ref: "kb-hr-auto-v1",
      n_cases: 1,
      cases: [caseView({ source: null })],
    });
    render(<GoldenSetListCard session={session} />);
    await waitFor(() => expect(screen.getByText("kb-hr-auto-v1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /xem case/i }));
    await waitFor(() => expect(screen.getByText("chưa khai")).toBeInTheDocument());
    expect(screen.queryByText("người viết")).not.toBeInTheDocument();
  });

  it("reloadKey đổi → gọi lại listGoldenSets", async () => {
    // Sinh lại bộ KHÔNG chạm `kb.documents`, nên danh sách không thể tự bắt kịp bằng cách theo dõi
    // tài liệu — nếu effect không phụ thuộc `reloadKey`, người dùng bấm "Dựng lại" xong sẽ vẫn thấy
    // số case CŨ và tin là lệnh không chạy.
    vi.mocked(listGoldenSets).mockResolvedValue([summary]);
    const { rerender } = render(<GoldenSetListCard session={session} reloadKey={0} />);
    await waitFor(() => expect(listGoldenSets).toHaveBeenCalledTimes(1));
    rerender(<GoldenSetListCard session={session} reloadKey={1} />);
    await waitFor(() => expect(listGoldenSets).toHaveBeenCalledTimes(2));
  });
});

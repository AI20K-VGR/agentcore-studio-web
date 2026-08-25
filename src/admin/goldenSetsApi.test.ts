/**
 * `readGoldenSetFile` — phần DUY NHẤT trong `goldenSetsApi.ts` có nhánh thật ở client.
 *
 * Cố ý KHÔNG kiểm từng field của case ở đây: server đã làm bằng `GoldenCase` (pydantic,
 * `extra="forbid"`) và trả 422 nêu đích danh case nào/field nào. Dựng lại phép kiểm đó ở client là
 * hai nguồn sự thật rồi sẽ lệch nhau — bài này chỉ canh đúng hai ca mà lỗi từ server khó đọc.
 */

import { describe, expect, it } from "vitest";
import {
  goldenSetTemplate,
  readGoldenSetFile,
  toGoldenCase,
} from "./goldenSetsApi";
import { StudioApiError } from "../httpUtil";

function asFile(text: string): File {
  return new File([text], "golden.json", { type: "application/json" });
}

describe("readGoldenSetFile", () => {
  it("nhận mảng case trần", async () => {
    await expect(
      readGoldenSetFile(asFile('[{"case_id":"A-1"}]')),
    ).resolves.toEqual([{ case_id: "A-1" }]);
  });

  it('nhận cả object bọc ngoài có khoá "cases"', async () => {
    // Bộ xuất từ chính hệ thống mang hình dạng này; bắt người dùng tự bóc lớp ngoài ra trước khi
    // nạp lại là một bước thủ công không có lý do gì tồn tại.
    await expect(
      readGoldenSetFile(
        asFile('{"golden_set_ref":"r","cases":[{"case_id":"A-1"}]}'),
      ),
    ).resolves.toEqual([{ case_id: "A-1" }]);
  });

  it("báo lỗi đọc được khi file không phải JSON", async () => {
    await expect(readGoldenSetFile(asFile("khong phai json"))).rejects.toThrow(
      StudioApiError,
    );
  });

  it("báo lỗi khi JSON hợp lệ nhưng không phải danh sách case", async () => {
    // Ca dễ gặp nhất: người dùng nạp nhầm file cấu hình. Không chặn thì payload đi tới server và
    // quay về một lỗi 422 nói về `GoldenCase`, chẳng liên quan gì tới thứ họ vừa chọn.
    await expect(
      readGoldenSetFile(asFile('{"golden_set_ref":"r"}')),
    ).rejects.toThrow(/mảng case/);
  });
});

describe("toGoldenCase", () => {
  const draft = {
    query: " Nghỉ phép bao nhiêu ngày? ",
    expected: " 12 ngày ",
    askingRole: "hr",
    answerRole: "hr",
  };

  it('LUÔN gắn source: "human"', () => {
    // Hợp đồng, không phải chi tiết. `golden_autogen` sinh lại phần máy và CHỈ giữ case
    // `source === "human"`. Thiếu nhãn này thì mọi câu người dùng vừa gõ biến mất ở lần nạp tài
    // liệu (hoặc bấm "dựng lại") kế tiếp — im lặng, và họ chỉ phát hiện khi mở bộ ra xem.
    expect(toGoldenCase(draft, "Acme", 0).source).toBe("human");
  });

  it("hai phòng ban GIỐNG nhau ⇒ case trả-lời-được", () => {
    const c = toGoldenCase(draft, "Acme", 0);
    expect(c.section_roles).toEqual(["hr"]);
    expect(c.expected_section_role).toBe("hr");
  });

  it("hai phòng ban KHÁC nhau ⇒ case bẫy (đáp án nằm ở phòng khác người hỏi)", () => {
    // Không có cờ `is_trap`: bộ chấm suy `expects_refusal` từ hai trục tenant/vai. Nên điều DUY
    // NHẤT form phải làm đúng là đặt hai trường này lệch nhau — thêm một cờ riêng ở đây sẽ tạo
    // nguồn sự thật thứ hai cho cùng một điều.
    const c = toGoldenCase({ ...draft, answerRole: "finance" }, "Acme", 0);
    expect(c.section_roles).toEqual(["hr"]);
    expect(c.expected_section_role).toBe("finance");
  });

  it("cắt khoảng trắng thừa và đánh số case_id từ 1", () => {
    const c = toGoldenCase(draft, "Acme", 0);
    expect(c.query).toBe("Nghỉ phép bao nhiêu ngày?");
    expect(c.expected).toBe("12 ngày");
    expect(c.case_id).toBe("HUMAN-001");
  });
});

describe("goldenSetTemplate", () => {
  it('file mẫu mang sẵn source: "human" ở MỌI case', () => {
    // Cùng lý do như trên. Người dùng tải mẫu về rồi sửa nội dung — nếu mẫu thiếu nhãn thì họ
    // không có cách nào biết là cần thêm, và mất công gõ ở lần nạp tài liệu kế tiếp.
    const cases = (
      JSON.parse(goldenSetTemplate("Acme", ["hr", "finance"])) as {
        cases: { source?: string }[];
      }
    ).cases;
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every((c) => c.source === "human")).toBe(true);
  });

  it("có CẢ câu thường lẫn câu bẫy làm ví dụ", () => {
    // Chỉ đưa một ví dụ thì người dùng không biết khái niệm "câu agent phải từ chối" tồn tại — mà
    // đó lại là loại câu đáng giá nhất, vì nó kiểm hàng rào giữa các phòng ban.
    const cases = (
      JSON.parse(goldenSetTemplate("Acme", ["hr", "finance"])) as {
        cases: { section_roles: string[]; expected_section_role: string }[];
      }
    ).cases;
    expect(
      cases.some((c) => c.section_roles[0] === c.expected_section_role),
    ).toBe(true);
    expect(
      cases.some((c) => c.section_roles[0] !== c.expected_section_role),
    ).toBe(true);
  });
});

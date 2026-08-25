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

  it("cắt khoảng trắng thừa và đánh số case_id từ 1 trong một lần lưu", () => {
    const c = toGoldenCase(draft, "Acme", 0, "b");
    expect(c.query).toBe("Nghỉ phép bao nhiêu ngày?");
    expect(c.expected).toBe("12 ngày");
    expect(c.case_id).toBe("HUMAN-b-001");
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

describe("toGoldenCase — case_id duy nhất qua nhiều lần lưu", () => {
  const draft = {
    query: "q?",
    expected: "a",
    askingRole: "hr",
    answerRole: "hr",
  };

  it("hai lần lưu ĐỘC LẬP không ra cùng case_id", () => {
    // Không phải chuyện thẩm mỹ. Phép phủ ở backend khoá theo (tenant, câu hỏi chuẩn hoá, phòng
    // ban) chứ không theo `case_id`, nên hai case khác câu hỏi mà trùng id đều được giữ — rồi
    // `select_core` ném `CoreSelectionError` vì Core có case_id trùng, và cổng Publish CHẶN HẲN.
    // Thông báo lỗi bảo người dùng "đặt lại id", thứ họ không đặt được vì form tự sinh.
    const a = toGoldenCase(draft, "Acme", 0, "batch1");
    const b = toGoldenCase(
      { ...draft, query: "câu khác" },
      "Acme",
      0,
      "batch2",
    );
    expect(a.case_id).not.toBe(b.case_id);
  });

  it("trong CÙNG một lần lưu thì vẫn đánh số theo thứ tự", () => {
    const batch = "b";
    expect(toGoldenCase(draft, "Acme", 0, batch).case_id).toBe("HUMAN-b-001");
    expect(toGoldenCase(draft, "Acme", 1, batch).case_id).toBe("HUMAN-b-002");
  });

  it("không truyền batch thì tự sinh, và hai lời gọi cách nhau vẫn khác nhau", () => {
    const ids = new Set(
      [0, 1, 2].map((i) => toGoldenCase(draft, "Acme", i).case_id),
    );
    expect(ids.size).toBe(3);
  });
});

describe("goldenSetTemplate — case_id trong file mẫu (review web#27 đợt 2, mục 3)", () => {
  it("hai lần tải mẫu ra case_id KHÁC nhau", () => {
    // Mẫu là thứ tab "Tải file lên" bảo người dùng bắt đầu từ đó. Bản trước sửa đụng-id ở đường gõ
    // tay rồi để nguyên đường này — hai người tải mẫu về, sửa nội dung, nạp lên là dựng lại đúng
    // va chạm cũ: `select_core` ném `CoreSelectionError`, cổng Publish chặn hẳn.
    const first = JSON.parse(goldenSetTemplate("Ankor", ["hr", "finance"], "aaa"));
    const second = JSON.parse(goldenSetTemplate("Ankor", ["hr", "finance"], "bbb"));
    const idsOf = (t: { cases: { case_id: string }[] }) => t.cases.map((c) => c.case_id);
    expect(idsOf(first)).not.toEqual(idsOf(second));
    expect(new Set([...idsOf(first), ...idsOf(second)]).size).toBe(4);
  });

  it("hai case TRONG CÙNG một mẫu cũng không trùng id nhau", () => {
    const ids = JSON.parse(goldenSetTemplate("Ankor", ["hr"], "aaa")).cases.map(
      (c: { case_id: string }) => c.case_id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hướng dẫn trong file nói rõ case_id phải khác nhau", () => {
    // Không có câu này thì người dùng sửa `query`/`expected` mà giữ nguyên id — đúng cái bẫy mà
    // batch ở trên chỉ đỡ được một nửa.
    const guide: string[] = JSON.parse(goldenSetTemplate("Ankor", ["hr"])) ._huong_dan;
    expect(guide.some((line) => line.includes("case_id"))).toBe(true);
  });
});

describe("trường `tenant` mang TÊN công ty, không mang UUID", () => {
  it("toGoldenCase ghi thẳng giá trị `tenant` được truyền vào cả hai field", () => {
    // Ghim có chủ đích, sau một finding review đề nghị đổi sang `session.tenantId` (web#27 đợt 2,
    // mục 1). Đổi như vậy mới là hỏng: bộ máy sinh ghi `tenant = tenant_slug` lấy từ
    // `SELECT name FROM core.tenants` (`apps/studio/src/studio_app/core/golden_autogen.py`), và
    // khoá gộp ở backend là `(tenant, câu hỏi chuẩn hoá, section_roles)`. Câu gõ tay mang UUID sẽ
    // không bao giờ khớp khoá với câu máy sinh, tức phép phủ/gộp vỡ đúng chỗ nó cần hoạt động.
    const c = toGoldenCase(
      { query: "q", expected: "a", askingRole: "hr", answerRole: "hr" },
      "Ankor",
      0,
      "aaa",
    );
    expect(c.tenant).toBe("Ankor");
    expect(c.expected_tenant).toBe("Ankor");
  });

  it("goldenSetTemplate cũng dùng đúng giá trị đó, để file mẫu gộp được với bộ máy sinh", () => {
    const t = JSON.parse(goldenSetTemplate("Ankor", ["hr"], "aaa"));
    expect(t.cases.every((c: { tenant: string }) => c.tenant === "Ankor")).toBe(true);
  });
});

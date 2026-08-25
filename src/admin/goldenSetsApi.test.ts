/**
 * `readGoldenSetFile` — phần DUY NHẤT trong `goldenSetsApi.ts` có nhánh thật ở client.
 *
 * Cố ý KHÔNG kiểm từng field của case ở đây: server đã làm bằng `GoldenCase` (pydantic,
 * `extra="forbid"`) và trả 422 nêu đích danh case nào/field nào. Dựng lại phép kiểm đó ở client là
 * hai nguồn sự thật rồi sẽ lệch nhau — bài này chỉ canh đúng hai ca mà lỗi từ server khó đọc.
 */

import { describe, expect, it } from "vitest";
import { readGoldenSetFile } from "./goldenSetsApi";
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

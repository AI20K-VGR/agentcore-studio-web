/**
 * Luật hiển thị của tab Tài liệu. Ba hàm này quyết định người dùng **đọc được gì** sau một thao
 * tác — sai ở đây không làm gì đỏ cả, chỉ làm họ tin sai (review web#26, TranBaDat2607).
 */

import { describe, expect, it } from "vitest";
import { deleteMessage, pruneSelection, stageStates } from "./documentsView";
import type { DocumentSummary } from "./documentsApi";

function doc(id: string): DocumentSummary {
  return { id, name: id, section_role: "hr", chunk_count: 1 };
}

describe("pruneSelection", () => {
  it("bỏ id không còn trong danh sách vừa tải lại", () => {
    // Không có bước này thì lần xoá kế tiếp gửi lên id đã biến mất, và người dùng nhận `not_found`
    // cho thứ họ KHÔNG hề tích — một lỗi về hành động họ không làm thì họ không tự gỡ được.
    expect(pruneSelection(new Set(["a", "b"]), [doc("a")])).toEqual(
      new Set(["a"]),
    );
  });

  it("giữ nguyên khi mọi id đã chọn vẫn còn", () => {
    expect(pruneSelection(new Set(["a", "b"]), [doc("a"), doc("b")])).toEqual(
      new Set(["a", "b"]),
    );
  });

  it("danh sách rỗng thì bỏ sạch vùng chọn", () => {
    expect(pruneSelection(new Set(["a"]), [])).toEqual(new Set());
  });
});

describe("deleteMessage", () => {
  it("xoá trọn vẹn thì chỉ báo con số", () => {
    expect(
      deleteMessage({
        deleted_chunks: 7,
        deleted_documents: ["a", "b"],
        not_found: [],
      }),
    ).toBe("Đã xoá 2 tài liệu (7 đoạn).");
  });

  it("NÓI RA phần không xoá được", () => {
    // Vế đắt. Dòng ghi trước khi `kb.chunks` có cột `doc_id` mang NULL nên `delete_by_doc_id` không
    // đụng tới được. Báo "đã xoá" trong khi tài liệu còn nguyên là kiểu im lặng tệ nhất trong cả
    // trang: người dùng tải lại, thấy nó vẫn ở đó, và không có đường nào biết vì sao.
    const msg = deleteMessage({
      deleted_chunks: 3,
      deleted_documents: ["a"],
      not_found: ["b", "c"],
    });
    expect(msg).toContain("Đã xoá 1 tài liệu (3 đoạn).");
    expect(msg).toContain("2 tài liệu KHÔNG xoá được");
  });

  it("xoá được 0 tài liệu vẫn phải nói ra phần trượt", () => {
    expect(
      deleteMessage({
        deleted_chunks: 0,
        deleted_documents: [],
        not_found: ["a"],
      }),
    ).toContain("KHÔNG xoá được");
  });
});

describe("stageStates", () => {
  it("chưa chạy thì cả hai chặng đều chờ", () => {
    const s = stageStates(null);
    expect(s.sending.state).toBe("wait");
    expect(s.processing.state).toBe("wait");
  });

  it("đang gửi byte: chặng đầu chạy KÈM phần trăm thật", () => {
    const s = stageStates({ phase: "uploading", percent: 42 });
    expect(s.sending).toEqual({ state: "run", percent: 42 });
    expect(s.processing.state).toBe("wait");
  });

  it("server đang xử lý: chặng đầu XONG hẳn, chặng sau chạy KHÔNG phần trăm", () => {
    // Hai vế, cả hai đều cố ý. Chặng đầu không được đứng ở 100% dạng đang-chạy — người ta đọc
    // "100%" là "xong" rồi tự hỏi sao vẫn quay. Chặng sau không được có số: quãng server xử lý
    // không có kênh báo về, nên mọi con số ở đó đều là bịa.
    const s = stageStates({ phase: "processing", percent: 100 });
    expect(s.sending.state).toBe("done");
    expect(s.processing).toEqual({ state: "run", percent: null });
  });

  it("xong thì cả hai chặng đều xong", () => {
    const s = stageStates({ phase: "done", percent: 100 });
    expect(s.sending.state).toBe("done");
    expect(s.processing.state).toBe("done");
  });
});

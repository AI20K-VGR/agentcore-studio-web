/**
 * `documentsApi.ts` — phần đổi sang `XMLHttpRequest` để có tiến trình thật, cộng hai hàm mới
 * `listDocuments`/`deleteDocuments` (review web#26, TranBaDat2607).
 *
 * Bài đáng giá nhất ở đây là chuỗi chặng của `uploadDocument`: nó là chỗ DUY NHẤT quyết định giao
 * diện nói *"đang gửi 42%"* hay *"máy chủ đang xử lý"*, và sai thứ tự thì người dùng đọc một tiến
 * trình không mô tả thứ đang xảy ra.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDocuments,
  listDocuments,
  uploadDocument,
  type UploadProgress,
} from "./documentsApi";
import { StudioApiError } from "../httpUtil";

const session = {
  token: "t",
  tenantId: "x",
  tenantName: "X",
  user: "u",
  systemRoles: ["admin"],
} as never;

/** `XMLHttpRequest` giả: cho bài tự bấm từng mốc theo đúng thứ tự trình duyệt bắn ra. */
class FakeXhr {
  static last: FakeXhr;
  upload = {
    onprogress: null as
      | ((e: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | null,
    onload: null as (() => void) | null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;
  responseText = "{}";
  headers: Record<string, string> = {};
  constructor() {
    FakeXhr.last = this;
  }
  open(): void {}
  setRequestHeader(k: string, v: string): void {
    this.headers[k] = v;
  }
  send(): void {}
}

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

describe("uploadDocument — chuỗi chặng", () => {
  it("gửi byte ra phần trăm THẬT, xong byte thì đổi sang chặng xử lý, rồi done", async () => {
    const seen: UploadProgress[] = [];
    const done = uploadDocument(new File(["x"], "a.md"), "hr", session, (p) =>
      seen.push(p),
    );

    const xhr = FakeXhr.last;
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
    xhr.upload.onload?.();
    xhr.responseText = JSON.stringify({
      doc_id: "hr-a",
      section_role: "hr",
      chunk_count: 1,
    });
    xhr.onload?.();
    await done;

    expect(seen).toEqual([
      { phase: "uploading", percent: 50 },
      { phase: "processing", percent: 100 },
      { phase: "done", percent: 100 },
    ]);
  });

  it("bỏ qua mốc không đo được độ dài thay vì báo phần trăm bịa", () => {
    const seen: UploadProgress[] = [];
    void uploadDocument(new File(["x"], "a.md"), "hr", session, (p) =>
      seen.push(p),
    );
    FakeXhr.last.upload.onprogress?.({
      lengthComputable: false,
      loaded: 0,
      total: 0,
    });
    expect(seen).toEqual([]);
  });

  it("lỗi HTTP trả `detail` của FastAPI, không phải mã số trần", async () => {
    // Cùng hình dạng lỗi mà `readJsonOrThrow` dựng cho đường `fetch` — hai đường không được hiện
    // hai kiểu thông báo cho cùng một lỗi server.
    const p = uploadDocument(new File(["x"], "a.md"), "hr", session);
    const xhr = FakeXhr.last;
    xhr.status = 422;
    xhr.responseText = JSON.stringify({ detail: "đuôi file không hỗ trợ" });
    xhr.onload?.();
    await expect(p).rejects.toThrow("đuôi file không hỗ trợ");
  });

  it("response không phải JSON thì báo đọc được, không vỡ", async () => {
    const p = uploadDocument(new File(["x"], "a.md"), "hr", session);
    FakeXhr.last.responseText = "<html>502</html>";
    FakeXhr.last.onload?.();
    await expect(p).rejects.toThrow(StudioApiError);
  });
});

describe("listDocuments / deleteDocuments", () => {
  it("deleteDocuments gửi mảng ids trong body JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            deleted_chunks: 2,
            deleted_documents: ["a"],
            not_found: [],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await deleteDocuments(["a", "b"], session);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ ids: ["a", "b"] });
  });

  it("listDocuments gọi GET và trả nguyên payload", async () => {
    const payload = {
      documents: [{ id: "a", name: "A", section_role: "hr", chunk_count: 3 }],
      total_chunks: 3,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(payload), { status: 200 }),
        ),
    );
    await expect(listDocuments(session)).resolves.toEqual(payload);
  });
});

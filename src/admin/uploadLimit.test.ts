/**
 * Hạn mức kích thước upload phía client phải khớp phía server.
 *
 * Client giữ một bản sao để báo lỗi NGAY, không phải chờ đẩy hết file lên rồi mới nhận 422 — đúng
 * việc của nó. Nhưng bản sao đó lệch khỏi server thì sinh ra một trong hai chế độ hỏng:
 *
 * - client CHẶT hơn: file hợp lệ bị từ chối, và người dùng không có cách nào biết vì sao — đo được
 *   đúng ca này, server đã nâng lên 10 MiB mà client vẫn báo "vượt quá giới hạn 1 MiB";
 * - client LỎNG hơn: đẩy hết file lên rồi mới bị 422, tốn băng thông và một vòng chờ.
 */

import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "./DocumentsTab";

describe("MAX_UPLOAD_BYTES", () => {
  it("khớp `_MAX_UPLOAD_BYTES` của apps/studio (10 MiB)", () => {
    // Con số này là BẢN SAO của `apps/studio/src/studio_app/routes/documents.py::_MAX_UPLOAD_BYTES`.
    // Hai tầng không dùng chung hằng số được, nên bài này là chỗ duy nhất bắt được lúc chúng lệch.
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

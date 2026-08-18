/**
 * Tab "Tài liệu" trong `AdminConsole` — placeholder TĨNH, KHÔNG gọi API nào.
 *
 * `packages/kb/src/studio_kb/pipeline.py::KbPipeline` (chunker/embed_invoke/index/consent_purge/
 * re_index) hiện 100% `NotImplementedError` — chưa route nào ở `apps/studio` gọi tới nó, và không
 * có cách nào để 1 company thật upload tài liệu rồi hệ thống tự chunk/embed/index vào DB. Toàn bộ
 * nội dung KB demo hiện tại đến từ 1 bộ tài liệu tĩnh viết sẵn (`packages/kb/docs/callisto/*.md`),
 * nạp bằng script `ingest_callisto.py`, không phải qua pipeline sản xuất.
 *
 * Tab này CHỈ ghi rõ giới hạn đó — không giả vờ có tính năng chưa tồn tại.
 */

import { Card } from "../components/Card";
import { WarningTriangleIcon } from "../icons";

export default function DocumentsPlaceholderTab() {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px", fontFamily: "var(--font-body)" }}>
      <Card title="Tài liệu">
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            border: "1px solid var(--warn)",
            background: "var(--warn-soft)",
            borderRadius: 8,
            padding: 14,
            fontSize: 12,
            color: "var(--ink)",
            lineHeight: 1.6,
          }}
        >
          <WarningTriangleIcon size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ color: "var(--warn)" }}>Chưa hỗ trợ.</strong> Pipeline nạp tài liệu
            (chunk → embed → index vào DB) chưa được implement (
            <code>packages/kb/src/studio_kb/pipeline.py::KbPipeline</code>, hiện toàn{" "}
            <code>NotImplementedError</code>). Nội dung KB dùng để test/chat hiện tại đến từ dữ
            liệu mẫu nạp sẵn qua script, không phải upload thật.
          </div>
        </div>
      </Card>
    </div>
  );
}

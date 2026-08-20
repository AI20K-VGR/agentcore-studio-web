/**
 * Node "khung agent" — đóng khung 1 vùng canvas thành 1 agent riêng. 1 canvas giờ có thể có
 * NHIỀU khung, mỗi khung là 1 recipe/agent độc lập (xem `nodesForFrame`/`edgesForFrame` ở
 * `recipe/fromCanvas.ts`). Node DAG bên trong thuộc khung nào qua `parentId` chuẩn react-flow —
 * component này chỉ vẽ viền + thanh tiêu đề, KHÔNG tự quản node con.
 *
 * Chỉ thanh tiêu đề bắt sự kiện (click = chọn active, kéo = di chuyển cả khung) — phần thân để
 * `pointerEvents: "none"`, không thì khung (nằm DƯỚI node con trong DOM) sẽ chặn mất click/kéo
 * nhắm vào node DAG bên trong nó.
 */
import { BotIcon } from "../icons";

/** Class dùng làm `dragHandle` của node khung (set ở nơi tạo node, `App.tsx`) — giới hạn kéo-thả
 * cả khung chỉ qua thanh tiêu đề, không phải bấm đâu trên khung cũng kéo được (dễ kéo nhầm khi
 * đang thao tác với node con). */
export const AGENT_FRAME_DRAG_HANDLE = "agent-frame-drag-handle";

export default function AgentFrameNode({
  data,
  selected,
}: {
  data: { agentId: string; version?: number };
  selected?: boolean;
}) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", pointerEvents: "none" }}>
      {/* Nền và viền tách 2 lớp riêng, KHÔNG dùng chung 1 `opacity` như bản trước — `opacity` áp
          lên cả div làm viền (vốn đã đủ đậm sẵn nhờ `--line-strong`/`--tier-admin`) bị pha loãng
          theo luôn, viền mờ gần như biến mất trên nền `--paper` (phản hồi: "khung mờ quá không
          rõ... có lẽ do độ trong suốt"). Lớp nền vẫn mờ (nó CẦN mờ — chỉ để phân biệt "vùng thuộc
          khung" với canvas trống, không được che khuất node con phía trên); lớp viền luôn đục
          hoàn toàn nên khung nhìn rõ dù bên trong mờ. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 12,
          background: selected ? "var(--tier-admin-soft)" : "var(--surface-2)",
          opacity: selected ? 0.4 : 0.28,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 12,
          border: `2.5px dashed ${selected ? "var(--tier-admin)" : "var(--ink-faint)"}`,
        }}
      />
      <div
        className={AGENT_FRAME_DRAG_HANDLE}
        title="Kéo để di chuyển khung — bấm để chọn agent này làm agent đang sửa"
        style={{
          position: "absolute",
          top: -1,
          left: -1,
          pointerEvents: "auto",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: "10px 10px 10px 0",
          border: `2px solid ${selected ? "var(--tier-admin)" : "var(--line-strong)"}`,
          background: selected ? "var(--tier-admin)" : "var(--surface)",
          color: selected ? "#fff" : "var(--ink-soft)",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          fontSize: 12.5,
        }}
      >
        <BotIcon size={14} />
        {data.agentId || "(chưa đặt tên)"}
        {/* Version đang xem trên canvas — `undefined` = khung mới tạo tay, chưa từng publish
            (phản hồi: canvas không cho biết đang ở version nào sau khi rollback/nạp lại). */}
        {data.version !== undefined && (
          <span
            style={{
              opacity: 0.85,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            v{data.version}
          </span>
        )}
      </div>
    </div>
  );
}

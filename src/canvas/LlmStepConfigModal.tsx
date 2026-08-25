/**
 * Modal cấu hình riêng cho node `llm-step` — node CỐ ĐỊNH, duy nhất mỗi agent (xem `App.tsx::
 * createFrame`/`deleteNode`/`addNode`). Khác `NodeConfigModal` (generic, theo `NODE_SPECS[].fields`):
 * `llm-step` cần gộp CẢ `system_prompt` (sống ở cấp Agent — `AgentFrameData.systemPrompt`, KHÔNG
 * phải `node.params`) LẪN `temperature` (node params thật) vào 1 chỗ, vì với kiến trúc mới (1 LLM
 * node cố định) đây chính là "cấu hình LLM" duy nhất của agent — không còn ý nghĩa tách 2 nơi.
 *
 * Có validate (yêu cầu của user): `system_prompt` không rỗng, `temperature` trong [0, 2] (khớp
 * `AgentConfig.temperature` backend, `ge=0.0, le=2.0`) — báo lỗi inline, chặn đóng modal khi invalid
 * thay vì lặng lẽ chấp nhận giá trị hỏng rồi 400 tận lúc Test/Chấm điểm.
 */
import { useState } from "react";
import type { Node as FlowNode } from "reactflow";

import type { CanvasNodeData } from "../recipe/fromCanvas";
import { nodeSpec } from "../recipe/contract";
import { CloseIcon } from "../icons";

// Nguồn DUY NHẤT của `min`/`max`/`step`/giá trị mặc định — `NODE_SPECS` (`recipe/contract.ts`),
// không hardcode lại ở đây để tránh 2 nơi cùng khai 1 ràng buộc rồi lệch nhau âm thầm.
const TEMPERATURE_FIELD = nodeSpec("llm-step").fields[0];
if (TEMPERATURE_FIELD.kind !== "number") {
  throw new Error("LlmStepConfigModal: nodeSpec('llm-step').fields[0] phải là field 'temperature' kind=number");
}
// Rút ra hằng số nguyên thuỷ NGAY tại module scope (không destructure lại trong component) — TS
// không giữ narrowing của `TEMPERATURE_FIELD.kind` xuyên qua closure của component bên dưới.
const { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX, step: TEMPERATURE_STEP, default: TEMPERATURE_DEFAULT, label: TEMPERATURE_LABEL } =
  TEMPERATURE_FIELD;

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--ink-soft)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13.5,
  borderRadius: 6,
  border: "1px solid var(--line-strong)",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
};

interface Props {
  node: FlowNode<CanvasNodeData>;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  onTemperatureChange: (nodeId: string, value: number) => void;
  onClose: () => void;
}

export default function LlmStepConfigModal({
  node,
  systemPrompt,
  onSystemPromptChange,
  onTemperatureChange,
  onClose,
}: Props) {
  const rawTemperature = node.data.params.temperature;
  const temperature =
    typeof rawTemperature === "number" ? rawTemperature : Number(rawTemperature ?? TEMPERATURE_DEFAULT);
  const [temperatureText, setTemperatureText] = useState(String(temperature));

  const promptError = systemPrompt.trim().length === 0 ? "System prompt không được để trống." : null;
  const parsedTemperature = Number(temperatureText);
  const temperatureError =
    temperatureText.trim() === "" || Number.isNaN(parsedTemperature)
      ? "Temperature phải là 1 số."
      : (TEMPERATURE_MIN !== undefined && parsedTemperature < TEMPERATURE_MIN) ||
          (TEMPERATURE_MAX !== undefined && parsedTemperature > TEMPERATURE_MAX)
        ? `Temperature phải trong khoảng ${TEMPERATURE_MIN} – ${TEMPERATURE_MAX}.`
        : null;
  const hasError = promptError !== null || temperatureError !== null;

  return (
    <div
      onClick={hasError ? undefined : onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,36,34,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 96vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--paper)",
          borderRadius: 12,
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "16px 18px",
            background: "#3D5A80",
            borderRadius: "12px 12px 0 0",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontFamily: "var(--font-display)", fontWeight: 600, color: "#fff" }}>
              LLM Step
            </h2>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
              {node.id} · llm-step
            </div>
          </div>
          <button
            type="button"
            onClick={hasError ? undefined : onClose}
            disabled={hasError}
            aria-label="Đóng"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              flexShrink: 0,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              cursor: hasError ? "not-allowed" : "pointer",
              opacity: hasError ? 0.5 : 1,
            }}
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div style={{ padding: "18px 20px 20px" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>System prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              rows={6}
              placeholder="Hướng dẫn hành vi của agent — bắt buộc, không được để trống."
              style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-body)" }}
            />
            {promptError && (
              <div style={{ fontSize: 11, color: "var(--bad)", marginTop: 5 }}>{promptError}</div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              {TEMPERATURE_LABEL} ({TEMPERATURE_MIN} – {TEMPERATURE_MAX})
            </label>
            <input
              type="number"
              min={TEMPERATURE_MIN}
              max={TEMPERATURE_MAX}
              step={TEMPERATURE_STEP}
              value={temperatureText}
              onChange={(e) => {
                setTemperatureText(e.target.value);
                const parsed = Number(e.target.value);
                const inRange =
                  (TEMPERATURE_MIN === undefined || parsed >= TEMPERATURE_MIN) &&
                  (TEMPERATURE_MAX === undefined || parsed <= TEMPERATURE_MAX);
                if (e.target.value.trim() !== "" && !Number.isNaN(parsed) && inRange) {
                  onTemperatureChange(node.id, parsed);
                }
              }}
              style={inputStyle}
            />
            {temperatureError && (
              <div style={{ fontSize: 11, color: "var(--bad)", marginTop: 5 }}>{temperatureError}</div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={hasError ? undefined : onClose}
              disabled={hasError}
              title={hasError ? "Sửa lỗi bên trên trước khi đóng" : undefined}
              style={{
                padding: "9px 22px",
                fontSize: 13.5,
                fontWeight: 700,
                borderRadius: 7,
                border: "none",
                background: hasError ? "var(--ink-faint)" : "var(--tier-admin)",
                color: "#fff",
                cursor: hasError ? "not-allowed" : "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              Xong
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";

/**
 * AgentCore Studio canvas & Agent Form — SWE (Thiệu Quang Minh) Day 3.
 *
 * Form tạo Agent xuất ra `agent_config` đúng chuẩn Recipe v0:
 * - instructions: prompt dặn dò AI
 * - model: gemini-2.5-flash / gpt-4o-mini
 * - tool_whitelist: danh sách tool cấp phép (kb_search, etc.)
 */
const CLOSED_NODE_TYPES = [
  { type: "kb-retrieve", owner: "AIE-1 / DE" },
  { type: "llm-step", owner: "AIE-1" },
  { type: "condition", owner: "AIE-1 / SWE" },
  { type: "tool-call", owner: "AIE-1 / SWE" },
  { type: "hitl-pause", owner: "SWE / AIE-1" },
  { type: "end", owner: "AIE-1" },
] as const;

function AgentConfigForm() {
  const [instructions, setInstructions] = useState(
    "Hãy tra cứu tài liệu Callisto và trả lời thắc mắc của người dùng."
  );
  const [model, setModel] = useState("gemini-2.5-flash");
  const [kbSearchEnabled, setKbSearchEnabled] = useState(true);
  const [exportedConfig, setExportedConfig] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tool_whitelist = [];
    if (kbSearchEnabled) tool_whitelist.push("kb_search");

    const agent_config = {
      instructions,
      model,
      tool_whitelist,
    };

    setExportedConfig(JSON.stringify(agent_config, null, 2));
  };

  return (
    <div
      style={{
        width: 320,
        borderRight: "1px solid #ddd",
        padding: "16px",
        fontFamily: "sans-serif",
        fontSize: 13,
        overflowY: "auto",
        backgroundColor: "#f9f9f9",
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 12 }}>
        Form Tạo Agent (SWE v0)
      </h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
            Instructions (Prompt):
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: "6px", fontSize: 12, borderRadius: 4, border: "1px solid #ccc" }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
            Model LLM:
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ width: "100%", padding: "6px", fontSize: 12, borderRadius: 4, border: "1px solid #ccc" }}
          >
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
            Tool Whitelist:
          </label>
          <label style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={kbSearchEnabled}
              onChange={(e) => setKbSearchEnabled(e.target.checked)}
            />{" "}
            kb_search (Callisto KB)
          </label>
        </div>

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "8px",
            backgroundColor: "#0066cc",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Xuất agent_config (JSON)
        </button>
      </form>

      {exportedConfig && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13, marginBottom: 4 }}>agent_config Output:</h3>
          <pre
            style={{
              backgroundColor: "#222",
              color: "#00ffcc",
              padding: "8px",
              borderRadius: 4,
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {exportedConfig}
          </pre>
        </div>
      )}

      <hr style={{ margin: "16px 0", border: "0", borderTop: "1px solid #ddd" }} />

      <h3 style={{ fontSize: 13, marginBottom: 8 }}>Node Palette (6 closed)</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {CLOSED_NODE_TYPES.map((node) => (
          <li
            key={node.type}
            style={{
              border: "1px solid #ccc",
              borderRadius: 4,
              padding: "4px 8px",
              marginBottom: 4,
              backgroundColor: "#fff",
            }}
          >
            <strong>{node.type}</strong>
            <span style={{ color: "#666", fontSize: 11, float: "right" }}>{node.owner}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <AgentConfigForm />
      <div style={{ flexGrow: 1 }}>
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

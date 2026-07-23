import { useState } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";

/**
 * AgentCore Studio canvas & Agent Form — Workbench Recipe v0 / Day 4.
 *
 * Form tạo Agent xuất ra `Recipe` JSON chuẩn gồm:
 * - agent_id & tenant
 * - agent_config (instructions, model, tool_whitelist)
 * - kb_binding (kb_id, scope)
 * - dag (nodes, edges)
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
  const [agentId, setAgentId] = useState("agent-callisto-d4");
  const [tenant, setTenant] = useState("ankor");
  const [instructions, setInstructions] = useState(
    "Hãy tra cứu tài liệu Callisto và trả lời thắc mắc của người dùng."
  );
  const [model, setModel] = useState("gemini-2.5-flash");
  const [kbSearchEnabled, setKbSearchEnabled] = useState(true);
  const [kbId, setKbId] = useState("kb-callisto-v1");
  const [scope, setScope] = useState("ankor/public");
  const [exportedConfig, setExportedConfig] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tool_whitelist = [];
    if (kbSearchEnabled) tool_whitelist.push("kb_search");

    const full_recipe = {
      agent_id: agentId,
      tenant: tenant,
      agent_config: {
        instructions,
        model,
        tool_whitelist,
      },
      kb_binding: {
        kb_id: kbId,
        scope: scope,
      },
      dag: {
        nodes: [
          { id: "n1", type: "kb-retrieve", params: { query: instructions, tenant, top_k: 3 } },
          { id: "n2", type: "llm-step", params: { temperature: 0.0 } },
          { id: "n3", type: "tool-call", params: { tool: "kb_search" } },
          { id: "n4", type: "end", params: {} },
        ],
        edges: [
          { from: "n1", to: "n2" },
          { from: "n2", to: "n3" },
          { from: "n3", to: "n4" },
        ],
      },
    };

    setExportedConfig(JSON.stringify(full_recipe, null, 2));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    fontSize: 12,
    borderRadius: 4,
    border: "1px solid #ccc",
    boxSizing: "border-box",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0066cc",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: 8,
    borderBottom: "1px dashed #cce0ff",
    paddingBottom: 4,
  };

  return (
    <div
      style={{
        width: 360,
        borderRight: "1px solid #e0e0e0",
        padding: "16px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 13,
        overflowY: "auto",
        backgroundColor: "#fafafa",
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 16, color: "#111" }}>
        Form Tạo Agent (Workbench v0.4)
      </h2>

      <form onSubmit={handleSubmit}>
        {/* SECTION 1: IDENTITY */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHeaderStyle}>1. Định danh Agent & Tenant</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 2 }}>Agent ID:</label>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 2 }}>Tenant:</label>
            <input
              type="text"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* SECTION 2: KB BINDING */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHeaderStyle}>2. Tích hợp Kho tri thức (KB Binding)</div>
          
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 2 }}>
              Kho tri thức (KB ID):
            </label>
            <select
              value={kbId}
              onChange={(e) => setKbId(e.target.value)}
              style={inputStyle}
            >
              <option value="kb-callisto-v1">kb-callisto-v1 (Callisto Knowledge Base)</option>
              <option value="kb-hr-policy-v1">kb-hr-policy-v1 (Quy định & Nghỉ phép Ankor)</option>
              <option value="kb-tech-docs-v1">kb-tech-docs-v1 (Tài liệu Kỹ thuật Studio)</option>
              <option value="custom">+ Nhập KB ID tùy chỉnh...</option>
            </select>
            {kbId === "custom" && (
              <input
                type="text"
                placeholder="Nhập ID kho tri thức..."
                onChange={(e) => setKbId(e.target.value)}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            )}
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 2 }}>
              Phạm vi truy cập (Scope):
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              style={inputStyle}
            >
              <option value="ankor/public">ankor/public (Công khai Tenant)</option>
              <option value="ankor/internal">ankor/internal (Nội bộ Tenant)</option>
              <option value="ankor/confidential">ankor/confidential (Bảo mật Cao)</option>
              <option value="custom">+ Nhập Scope tùy chỉnh...</option>
            </select>
            {scope === "custom" && (
              <input
                type="text"
                placeholder="Nhập scope e.g. tenant/role..."
                onChange={(e) => setScope(e.target.value)}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            )}
          </div>
        </div>

        {/* SECTION 3: AGENT CONFIG */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHeaderStyle}>3. Cấu hình AI Agent</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 2 }}>
              Instructions (Prompt):
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              style={{ ...inputStyle, fontFamily: "inherit" }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 2 }}>
              Model LLM:
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={inputStyle}
            >
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 2 }}>
              Tool Whitelist:
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={kbSearchEnabled}
                onChange={(e) => setKbSearchEnabled(e.target.checked)}
              />
              kb_search (Callisto KB)
            </label>
          </div>
        </div>

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "#0066cc",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: "bold",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Xuất Recipe JSON (Gồm KB Binding)
        </button>
      </form>

      {exportedConfig && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13, marginBottom: 4, color: "#333" }}>Recipe Output (JSON):</h3>
          <pre
            style={{
              backgroundColor: "#1e1e1e",
              color: "#4ec9b0",
              padding: "10px",
              borderRadius: 6,
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {exportedConfig}
          </pre>
        </div>
      )}

      <hr style={{ margin: "16px 0", border: "0", borderTop: "1px solid #e0e0e0" }} />

      <h3 style={{ fontSize: 12, marginBottom: 8, color: "#555" }}>Node Palette (6 closed types)</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {CLOSED_NODE_TYPES.map((node) => (
          <li
            key={node.type}
            style={{
              border: "1px solid #ddd",
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


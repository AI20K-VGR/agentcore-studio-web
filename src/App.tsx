import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";

/**
 * AgentCore Studio canvas — EMPTY scaffold (Decision #11, R-SPEC A2).
 *
 * This renders an empty React Flow canvas plus a static palette of the 6 CLOSED node-types the
 * interpreter (AIE-1) supports. There is NO business logic here: no drag-to-add, no DAG
 * validation, no recipe wiring, no API calls. Mentor owns this file; the SWE quadrant grows the
 * real canvas UX (form, drag/drop, graph-lint feedback, publish flow) once Workbench wiring lands
 * (packages/workbench, P7).
 *
 * The 6 node-types are a hard cap (R-SPEC A2, umbrella-contract.md:62-73) — CANNOT add a 7th, no
 * turing-complete DSL. This palette is display-only; it exists so the empty canvas still
 * communicates the closed set to whoever opens this scaffold first.
 */
const CLOSED_NODE_TYPES = [
  { type: "kb-retrieve", owner: "AIE-1 / DE" },
  { type: "llm-step", owner: "AIE-1" },
  { type: "condition", owner: "AIE-1 / SWE" },
  { type: "tool-call", owner: "AIE-1 / SWE" },
  { type: "hitl-pause", owner: "SWE / AIE-1" },
  { type: "end", owner: "AIE-1" },
] as const;

function NodeTypePalette() {
  return (
    <aside
      style={{
        width: 220,
        borderRight: "1px solid #ddd",
        padding: "12px",
        fontFamily: "sans-serif",
        fontSize: 13,
      }}
    >
      <h2 style={{ fontSize: 14, marginBottom: 8 }}>Node palette (6, closed)</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {CLOSED_NODE_TYPES.map((node) => (
          <li
            key={node.type}
            style={{
              border: "1px solid #ccc",
              borderRadius: 4,
              padding: "6px 8px",
              marginBottom: 6,
            }}
          >
            <strong>{node.type}</strong>
            <div style={{ color: "#666", fontSize: 11 }}>{node.owner}</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default function App() {
  // No nodes/edges seeded — canvas starts genuinely empty. SWE wires form -> canvas creation.
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <NodeTypePalette />
      <div style={{ flexGrow: 1 }}>
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

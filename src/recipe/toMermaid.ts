/**
 * DAG → chuỗi sơ đồ Mermaid — NẤC 2 của descope-ladder (`DESCOPE.md`).
 *
 * INV-7: "cắt độ bóng, không cắt nhịp demo". Nếu React Flow hỏng render (hoặc chạy trên máy
 * không dựng nổi canvas), tab Mermaid vẫn cho người xem thấy đúng đồ thị đó dưới dạng text —
 * dán vào bất kỳ chỗ nào render Mermaid (GitHub, docs) là ra hình. Luồng walking-skeleton không
 * đứt vì UI.
 *
 * Quan trọng: nguồn của hàm này là `recipe.dag` — CÙNG một dữ liệu mà `graphLint()` soi và mà
 * export ghi ra. Mermaid ở đây là 1 cách NHÌN khác của cùng recipe, không phải nhánh dữ liệu
 * thứ hai có thể lệch với canvas.
 */

import type { NodeType, WireRecipe } from "./contract";

/** Hình khối Mermaid theo từng loại node — để nhìn hình là đoán được loại. */
const SHAPE: Record<NodeType, (label: string) => string> = {
  "kb-retrieve": (label) => `[(${label})]`,
  "llm-step": (label) => `[${label}]`,
  condition: (label) => `{${label}}`,
  "tool-call": (label) => `[[${label}]]`,
  "hitl-pause": (label) => `([${label}])`,
  end: (label) => `((${label}))`,
};

/**
 * Mermaid không nhận `"` trong nhãn và coi nhiều ký tự là cú pháp. Nhãn được bọc trong `"…"`
 * nên chỉ cần khử dấu nháy kép; `#quot;` là entity Mermaid hiểu được.
 */
function escapeLabel(text: string): string {
  return text.replace(/"/g, "#quot;");
}

/**
 * Id node của recipe là chuỗi tự do, Mermaid thì chỉ nhận id kiểu định danh. Ánh xạ sang
 * `n0, n1, …` theo thứ tự khai báo — ổn định giữa các lần gọi trên cùng recipe.
 */
function safeIds(ids: string[]): Map<string, string> {
  return new Map(ids.map((id, index) => [id, `n${index}`]));
}

export function toMermaid(recipe: WireRecipe): string {
  const { nodes, edges } = recipe.dag;

  if (nodes.length === 0) {
    return "flowchart TD\n  %% canvas trống — chưa có node nào";
  }

  const alias = safeIds(nodes.map((node) => node.id));
  const lines: string[] = ["flowchart TD"];

  for (const node of nodes) {
    const shape = SHAPE[node.type];
    const label = escapeLabel(`${node.id} · ${node.type}`);
    // Node có type ngoài 6 loại (recipe import vào) không có hình khối nào khớp — vẽ hộp vuông
    // kèm dấu ⚠ thay vì bỏ qua, để cái sai hiện ra trong sơ đồ chứ không biến mất khỏi nó.
    lines.push(`  ${alias.get(node.id)}${shape ? shape(`"${label}"`) : `["⚠ ${label}"]`}`);
  }

  for (const edge of edges) {
    const from = alias.get(edge.from);
    const to = alias.get(edge.to);
    if (!from || !to) {
      // Cạnh treo (luật 3 sẽ chặn). Ghi thành comment để sơ đồ vẫn render được, đồng thời
      // không giấu việc recipe đang có cạnh hỏng.
      lines.push(`  %% ⚠ cạnh treo: ${edge.from} --> ${edge.to}`);
      continue;
    }
    const label = edge.when ? `|"${escapeLabel(edge.when)}"|` : "";
    lines.push(`  ${from} -->${label} ${to}`);
  }

  return lines.join("\n");
}

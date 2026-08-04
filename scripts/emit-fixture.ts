/**
 * Sinh fixture cho test Python từ CHÍNH code của canvas.
 *
 *     pnpm emit-fixture      # ghi thẳng vào packages/workbench/tests/fixtures/
 *
 * Chạy qua `scripts/run.mjs` (xem docstring ở đó) chứ không `node scripts/…ts` trực tiếp.
 *
 * Vì sao cần script này thay vì chép tay JSON: fixture bên Python tồn tại để chứng minh
 * "output thật của canvas đi lọt qua `Recipe` + `graph_lint()`". Nếu fixture là bản chép tay,
 * nó sẽ đứng yên khi canvas đổi hình dạng, và test vẫn xanh trong khi khe web↔Python đã gãy —
 * tức là test khẳng định một điều không còn đúng. Sinh từ `buildRecipe()` + `sampleGraph()` thì
 * không có chỗ cho việc đó xảy ra.
 */

import { buildRecipe } from "../src/recipe/fromCanvas.ts";
import { DEFAULT_HEADER, sampleGraph } from "../src/recipe/sample.ts";

const { nodes, edges } = sampleGraph();
const recipe = buildRecipe(DEFAULT_HEADER, nodes, edges);

process.stdout.write(JSON.stringify(recipe, null, 2) + "\n");

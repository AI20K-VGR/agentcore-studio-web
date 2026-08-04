/**
 * Chạy 1 module TypeScript trong `src/` bằng Node.
 *
 *     node scripts/run.mjs scripts/emit-fixture.ts
 *
 * ## Vì sao không gọi thẳng `node scripts/….ts`
 * Node chạy được `.ts`, nhưng ESM của Node đòi đuôi file tường minh trong MỌI import, còn `src/`
 * viết import không đuôi theo lối Vite (`from "./contract"`). Chạy thẳng sẽ ERR_MODULE_NOT_FOUND.
 *
 * ## Vì sao không gọi bundler (`rolldown`/`esbuild`)
 * Cả hai đều chỉ là dependency GIÁN TIẾP của vite. npm hoist nên `node_modules/.bin/rolldown`
 * tình cờ có mặt; pnpm (thứ CI repo này dùng — xem README) chỉ link bin của dependency TRỰC
 * TIẾP, nên script sẽ chết trên máy người khác. `vite` thì là devDependency trực tiếp, luôn có.
 *
 * `ssrLoadModule` chính là đường Vite dùng để chạy code người dùng phía Node — nó áp đúng bộ
 * resolver mà `vite dev`/`vite build` áp, nên thứ script thấy y hệt thứ app thấy.
 */

import { createServer } from "vite";

const entry = process.argv[2];
if (!entry) {
  console.error("dùng: node scripts/run.mjs <đường-dẫn-file-ts>");
  process.exit(2);
}

// `logLevel: silent` để log của vite không lẫn vào stdout — `emit-fixture` ghi JSON ra stdout và
// được redirect thẳng vào file fixture.
const server = await createServer({
  configFile: false,
  logLevel: "silent",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  await server.ssrLoadModule(entry);
} finally {
  await server.close();
}

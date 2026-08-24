import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest config tách riêng khỏi `vite.config.ts` (file đó do mentor sở hữu, không đụng vào —
// xem comment ở đầu `vite.config.ts`). Vitest tự nhận file này mà không cần khai báo gì thêm
// ở `vite.config.ts`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});

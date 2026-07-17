import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Empty scaffold (Decision #11) — no business logic here. Mentor owns this file; SWE grows the
// canvas UX in later sprints without needing to touch build config.
export default defineConfig({
  plugins: [react()],
});

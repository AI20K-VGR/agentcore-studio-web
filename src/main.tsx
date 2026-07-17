import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

// Empty scaffold entrypoint (Decision #11) — no business logic. Mentor owns; SWE grows the
// canvas UX in later sprints.
const container = document.getElementById("root");
if (!container) {
  throw new Error("root container '#root' not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

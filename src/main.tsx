import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./theme.css";
import App from "./App";
import { applyThemePref, getStoredThemePref } from "./theme";

// Áp `data-theme` TRƯỚC render đầu tiên — tránh 1 khung hình vẽ sai theme (mặc định) rồi mới
// đổi đúng theme đã lưu, gây nháy màu lúc load trang.
applyThemePref(getStoredThemePref());

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

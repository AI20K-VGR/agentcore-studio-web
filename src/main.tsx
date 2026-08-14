import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Font tự host (review AIE-1, web#5 finding #4) — thay `<link>` tới fonts.googleapis.com/
// fonts.gstatic.com trong index.html: sản phẩm multi-tenant (admin/hr/finance...) không nên gửi
// IP người dùng cho Google mỗi lần tải trang mà không có lựa chọn nào khác. Đúng 3 family + đúng
// weight index.css đang dùng (Space Grotesk 500/600/700, IBM Plex Sans 400/500/600, IBM Plex
// Mono 400/500) — không import thừa weight không dùng tới.
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import "./index.css";
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

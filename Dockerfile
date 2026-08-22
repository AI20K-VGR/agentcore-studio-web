# Dev-mode image cho apps/web (Vite dev server, KHÔNG phải production build) — mục đích DUY NHẤT
# là cho máy chỉ có Docker (không Node/pnpm cài sẵn) vẫn chạy được `pnpm dev`. Không có Dockerfile
# nào khác trong repo cho apps/web trước bản này — CI hiện chưa build/deploy image này, chỉ dùng
# cho `docker compose --profile app up` (scripts/dev-up.ps1).
#
# Không dùng `corepack enable` để lấy pnpm: package.json (apps/web) chưa khai `packageManager`
# (không pin version), corepack cần version cố định để prepare — cài thẳng qua npm cho đơn giản,
# ổn định, không phụ thuộc field chưa có.
FROM node:22-slim

WORKDIR /app

RUN npm install -g pnpm

# Copy lockfile trước (cache layer riêng, khớp pattern layer-order của root Dockerfile) — sửa
# source sau này không invalidate lại bước install.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173

# `--host 0.0.0.0` BẮT BUỘC: Vite mặc định chỉ bind localhost bên TRONG container — cổng publish
# ra ngoài (`ports: 5173:5173`) sẽ không match được gì nếu thiếu cờ này.
#
# Gọi thẳng `pnpm exec vite` (KHÔNG qua script `dev` + `--`) — thực nghiệm xác nhận
# `pnpm dev -- --host 0.0.0.0` chuyển nguyên literal `--` vào argv của vite (log in ra
# `$ vite -- --host 0.0.0.0 --port 5173`), khiến vite bỏ qua `--host` và chỉ bind localhost —
# cổng publish ra ngoài không match được gì (curl từ host: connection refused).
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173"]

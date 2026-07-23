# agentcore-studio-web

> Vite + React Flow frontend (empty-canvas scaffold, Decision #11).

**Owner:** mentor (SWE — Thiệu Quang Minh mở rộng canvas ở sprint sau) · **Loại:** app JS/TS **độc lập** (KHÔNG thuộc uv workspace) · **Repo cha:** [agentcore-studio-kit](https://github.com/AI20K-VGR/agentcore-studio-kit)

## Repo này là gì
Submodule `apps/web`. Frontend độc lập, nói chuyện với studio API qua HTTP — **không** import contracts Python, **không** nằm trong uv.lock (root pyproject `[tool.uv.workspace].exclude = ["apps/web"]`).

## Build / dev (chạy độc lập được)
```bash
pnpm install
pnpm dev      # vite dev server
pnpm build    # tsc --noEmit && vite build
```

## CI
Standalone `.github/workflows/ci.yml`: `pnpm install --frozen-lockfile` + `pnpm build`.
**KHÁC 6 repo Python:** không cần PAT, không reconstruct workspace (web không thuộc uv workspace).

📖 Phân quyền + luồng thao tác: [GITFLOWS.md](https://github.com/AI20K-VGR/agentcore-studio-kit/blob/main/GITFLOWS.md)

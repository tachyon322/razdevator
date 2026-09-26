# syntax=docker/dockerfile:1

# --- base: Node + bun (bun только для установки зависимостей) ------------
FROM node:22-bookworm-slim AS base
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://bun.sh/install | bash

ENV BUN_INSTALL=/root/.bun
ENV PATH="/root/.bun/bin:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1

# --- deps ---------------------------------------------------------------
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- builder ------------------------------------------------------------
# Сборка запускается через Node (bun run build падает с SIGILL в контейнере).
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner -------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# better-sqlite3 — нативный модуль с prebuilds (страховка от file tracing)
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# инициализация схемы БД на старте
COPY docker/schema.sql ./docker/schema.sql
COPY docker/init-db.mjs ./docker/init-db.mjs

RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node docker/init-db.mjs && node server.js"]

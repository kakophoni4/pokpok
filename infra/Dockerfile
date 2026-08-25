# syntax=docker/dockerfile:1
# One Dockerfile, three images (api / bot / web).
#
# They share the dependency and build layers, so `docker compose build` installs
# the monorepo once instead of three times. Build from the repository root:
#   docker build -f infra/Dockerfile --target api .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
ENV CI=true

# ─── Dependencies ──────────────────────────────────────────────────────────────
# Only manifests are copied here, so editing source code does not invalidate the
# install layer — the slowest step in the build.
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/rating/package.json packages/rating/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot-telegram/package.json apps/bot-telegram/
RUN pnpm install --frozen-lockfile

# ─── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .

# Vite inlines these at build time: the browser bundle cannot read them later.
# Leave VITE_API_URL empty so the site calls /api on its own origin via Caddy.
ARG VITE_TELEGRAM_BOT_USERNAME=""
ARG VITE_API_URL=""
ENV VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME
ENV VITE_API_URL=$VITE_API_URL

# Generating the Prisma client reads the schema and connects to nothing, but the
# config file it loads insists on a URL being present. This placeholder satisfies
# that check during the build; the real credentials arrive at runtime.
ENV DATABASE_URL="postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder"

RUN pnpm run build

# ─── API ───────────────────────────────────────────────────────────────────────
# The whole workspace is carried over on purpose: the Prisma CLI (a dev
# dependency) applies migrations on startup, and pruning it away would mean
# shipping a second image just to run `migrate deploy`.
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]

# ─── Telegram bot ──────────────────────────────────────────────────────────────
FROM base AS bot
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/bot-telegram
# Not the package's `start` script: that one expects the developer's root .env
# file, while here the values arrive from the container environment.
CMD ["node", "dist/index.js"]

# ─── Website ───────────────────────────────────────────────────────────────────
# Caddy serves the built static files and terminates TLS for the whole stack.
FROM caddy:2-alpine AS web
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80 443

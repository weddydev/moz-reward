# syntax=docker/dockerfile:1
# Production image: one image for web (Next standalone `server.js`) and the worker/CLIs (esbuild bundles in
# /app/cli), tagged with the commit SHA by CI. The deploy ships it with `docker save | zstd | ssh` — no registry
# (ARCHITECTURE §9). P0-15 (C-21): the runtime holds no dev dependencies, no tsx, no package managers and no
# source tree, so Trivy scans it with no skips. Base pinned by digest (ENGINEERING §14).
# Public build-time values (NEXT_PUBLIC_*) are passed per environment as build args by the deploy job.

FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS node

FROM node AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --ignore-scripts: the root "prepare" (lefthook install) needs a git checkout; the allow-listed native packages
# are rebuilt explicitly.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild sharp

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG APP_ENV=production
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV APP_ENV=$APP_ENV \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_OUTPUT=standalone
# Web: .next/standalone (server.js + traced node_modules). Worker and CLIs: dist/cli/*.mjs (scripts/bundle-cli.ts).
RUN pnpm exec next build && pnpm exec tsx scripts/bundle-cli.ts

FROM node AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The runtime only runs `node`: drop the base image's package managers (npm carries HIGH CVEs; corepack, yarn).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
# Non-root (SECURITY §11). Files stay root-owned and read-only to the app user.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# The bundles resolve their externals (native @node-rs/argon2) from the standalone node_modules beside them.
COPY --from=build /app/dist/cli ./cli
# Migrations for the release step (`node cli/migrate.mjs`, run from /app: it reads ./drizzle).
COPY --from=build /app/drizzle ./drizzle
USER node
EXPOSE 3000
# Liveness only; readiness (/api/health/ready) is checked by Caddy and the deploy job (P0-13/P0-15). The worker
# overrides the command (`node cli/worker.mjs`) and its compose service its own healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

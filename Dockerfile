# syntax=docker/dockerfile:1
# Production image (P0-14): one image for web (`next start`) and worker (`pnpm worker`), tagged with the commit
# SHA by CI. The deploy (P0-15) ships it with `docker save | zstd | ssh` — no registry (ARCHITECTURE §9).
# Base pinned by digest (ENGINEERING §14). The runtime keeps the full install because the worker runs through
# tsx (a dev dependency); slimming to Next standalone + a bundled worker is P0-15's job (DECISIONS 2026-11-09).
# Public build-time values (NEXT_PUBLIC_*) are passed per environment as build args by the deploy job.

FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS base
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
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
RUN pnpm exec next build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The runtime never uses npm (node runs directly; pnpm comes from corepack), and the npm bundled in the base
# image carries HIGH CVEs (undici, brace-expansion — Trivy, first main run). Remove it.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
# Non-root (SECURITY §11). Files stay root-owned and read-only to the app user.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/load-env.ts ./scripts/load-env.ts
USER node
EXPOSE 3000
# Liveness only; readiness (/api/health/ready) is checked by Caddy and the deploy job (P0-13/P0-15).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start"]

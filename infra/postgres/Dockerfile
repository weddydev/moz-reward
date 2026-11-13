# syntax=docker/dockerfile:1
# Staging/production Postgres (ARCHITECTURE §9, P0-15): PostGIS 17 + wal-g + ca-certificates (wal-g #2550:
# `wal-push` hangs against R2 without the CA bundle) + gnupg (dumps are encrypted with the backup public key).
# Built on the VPS by `moz-deploy` from the release's infra files; the base is pinned by digest and wal-g by
# checksum (ENGINEERING §14). Same major/minor on staging and production (parity). Local dev/CI use
# imresamu/postgis (multi-arch) — see DECISIONS "Staging/production Postgres image".
FROM postgis/postgis:17-3.6@sha256:1ac10b2551ba84ae05db8e7da477afcd0a3fede99bcb7705da2ee157390cb095

ARG WALG_VERSION=v3.0.9
ARG WALG_SHA256=4f03ee4679db7f660bfd1b2b8291ac5df247cd2ec48074b60c112f4897299f24

# hadolint ignore=DL3008
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl -fsSL -o /tmp/wal-g.tgz \
      "https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-22.04-amd64.tar.gz"; \
    echo "${WALG_SHA256}  /tmp/wal-g.tgz" | sha256sum -c -; \
    tar -xzf /tmp/wal-g.tgz -C /tmp; \
    install -m 0755 /tmp/wal-g-pg-22.04-amd64 /usr/local/bin/wal-g; \
    rm -f /tmp/wal-g.tgz /tmp/wal-g-pg-22.04-amd64; \
    apt-get purge -y --auto-remove curl; \
    rm -rf /var/lib/apt/lists/*; \
    wal-g --version

# Client authentication (scram-sha-256 only; the superuser only over the socket as the OS user postgres).
COPY pg_hba.conf /etc/postgresql/pg_hba.conf
# WAL archiving and base backups go through this wrapper only (key check, archive-off lever, timeouts; D2).
COPY --chmod=0755 moz-walg /usr/local/bin/moz-walg

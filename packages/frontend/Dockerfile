# ── Stage 1: build ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/

RUN npm ci --workspace=packages/shared --workspace=packages/frontend --ignore-scripts

COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/
COPY tsconfig.base.json ./

RUN npm run build -w packages/shared
RUN npm run build -w packages/frontend

# ── Stage 2: static output only ───────────────────────
FROM alpine:3.20

COPY --from=builder /app/packages/frontend/dist/ /usr/share/frontend/

# This image is not run standalone — nginx serves these files.
# The stage exists to be referenced via COPY --from in docker-compose.
CMD ["echo", "Static files in /usr/share/frontend/"]

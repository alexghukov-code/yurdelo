# ── Stage 1: build shared + backend ────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

RUN npm ci --workspace=packages/shared --workspace=packages/backend --ignore-scripts

COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
COPY tsconfig.base.json ./

RUN npm run build -w packages/shared
RUN npm run build -w packages/backend

# ── Stage 2: production image ──────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts + production deps
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/backend/package.json packages/backend/
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/backend/dist/ packages/backend/dist/

# Copy migrations + seeds (needed for db:migrate at deploy time)
COPY db/ db/

RUN npm ci --workspace=packages/shared --workspace=packages/backend --omit=dev --ignore-scripts

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "packages/backend/dist/server.js"]

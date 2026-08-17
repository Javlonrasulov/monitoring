FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm install --no-audit --no-fund

COPY apps/api/ ./
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p /app/uploads/snapshots

EXPOSE 3001
CMD ["node", "dist/src/main.js"]

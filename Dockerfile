FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

EXPOSE 5000

# Sync schema then start server.
# NOTE: `migrate deploy` was failing on this platform and froze deploys, so we use
# `db push` (no --accept-data-loss, so a destructive change fails rather than drops
# data). It's idempotent and matches the last known-good deployment. The migrations/
# baseline is kept for a future retry of the migrate-deploy workflow.
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]

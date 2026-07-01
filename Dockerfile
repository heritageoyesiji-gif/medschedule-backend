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
# NOTE: --accept-data-loss was removed so a destructive schema change fails the
# deploy instead of silently dropping data. Additive changes still apply cleanly.
# Next step is to move to `npx prisma migrate deploy` (see prisma/migrations/README);
# that requires a one-time baseline of the existing db-push-created database.
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]

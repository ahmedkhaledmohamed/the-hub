# The Hub — Docker image
# Multi-stage build for production deployment

FROM node:20-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Create a minimal hub.config.ts if not present
RUN if [ ! -f hub.config.ts ]; then cp hub.config.example.ts hub.config.ts; fi
RUN npm run build

# Production
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=9001
ENV HTTP_PORT=9002

# Create non-root user
RUN addgroup --system --gid 1001 hubuser && \
    adduser --system --uid 1001 hubuser

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/server.mjs ./
COPY --from=builder /app/hub.config.ts ./
COPY --from=builder /app/hub.config.example.ts ./
COPY --from=builder /app/package.json ./

# Create data directory
RUN mkdir -p .hub-data && chown hubuser:hubuser .hub-data

USER hubuser

EXPOSE 9001 9002

CMD ["node", "server.mjs"]

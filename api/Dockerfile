# Flowlet API (Fastify). Build context = repo root (needs the @flowlet/shared workspace).
#   docker build -f api/Dockerfile -t flowlet-api .
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY api/package.json ./api/
RUN npm install

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY api ./api
WORKDIR /app/api
EXPOSE 3001
# Runs TypeScript directly via tsx — @flowlet/shared is consumed as source at MVP
# (no separate build artifact to keep in sync). Revisit if cold-start matters.
CMD ["npx", "tsx", "src/index.ts"]

# Flowlet worker (BullMQ). Build context = repo root (needs the @flowlet/shared workspace).
#   docker build -f worker/Dockerfile -t flowlet-worker .
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY worker/package.json ./worker/
RUN npm install

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY worker ./worker
WORKDIR /app/worker
# No port — the worker only consumes the queue.
CMD ["npx", "tsx", "src/index.ts"]

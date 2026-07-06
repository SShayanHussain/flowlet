# Flowlet worker (BullMQ). Build context = repo root (needs the @flowlet/shared workspace).
#   docker build -f worker/Dockerfile -t flowlet-worker .
#
# Single stage, tsx runtime — same rationale as api/Dockerfile. Trim the root
# `workspaces` to worker + packages so the install stays lean.
FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN node -e "const p=require('./package.json');p.workspaces=['worker','packages/*'];require('fs').writeFileSync('./package.json',JSON.stringify(p))"
COPY packages ./packages
COPY worker ./worker
RUN npm install --no-audit --no-fund

WORKDIR /app/worker
# No port — the worker only consumes the queue.
CMD ["npx", "tsx", "src/index.ts"]

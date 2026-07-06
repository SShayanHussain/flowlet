# Flowlet API (Fastify). Build context = repo root (needs the @flowlet/shared workspace).
#   docker build -f api/Dockerfile -t flowlet-api .
#
# Single stage on purpose: the image runs TypeScript via tsx (no compiled dist to
# keep in sync with @flowlet/shared source), so it needs the source + node_modules
# (including any nested workspace modules). We trim the root `workspaces` to just
# what this image needs so `npm install` doesn't pull web's Next/React tree.
FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN node -e "const p=require('./package.json');p.workspaces=['api','packages/*'];require('fs').writeFileSync('./package.json',JSON.stringify(p))"
COPY packages ./packages
COPY api ./api
RUN npm install --no-audit --no-fund

WORKDIR /app/api
EXPOSE 3001
CMD ["npx", "tsx", "src/index.ts"]

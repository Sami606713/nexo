# Nexo background worker (publishing, campaigns, workflows, credit refills). Build from the repo root:
#   docker compose -f deploy/worker/docker-compose.yml up -d --build
FROM node:22-bookworm-slim
LABEL project=nexo component=worker

# Prisma's query engine needs OpenSSL; CA certificates for HTTPS to Neon, Upstash, Composio and AI providers.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first so dependency installs are cached between code changes.
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/integrations/package.json packages/integrations/

# Only the worker's dependency tree (+ the db package for the Prisma CLI); the web app's deps are skipped.
# sharp (optional) resizes AI images to the exact network size.
RUN npm ci --workspace @postline/worker --workspace @postline/db --ignore-scripts --no-audit --no-fund \
  && npm install --no-save --ignore-scripts --no-audit --no-fund sharp@0.35.5 \
  && npm cache clean --force

COPY packages ./packages
COPY apps/worker ./apps/worker
RUN npx --no-install prisma generate --schema packages/db/prisma/schema.prisma

ENV NODE_ENV=production
WORKDIR /app/apps/worker
USER node
CMD ["/app/node_modules/.bin/tsx", "src/index.ts"]

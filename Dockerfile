# ─────────────────────────────────────────────
# Stage 1: Clone source and build React frontend
# ─────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

RUN apk add --no-cache git

# Clone the repo (deploy token passed as build arg — never ends up in final image)
ARG GITLAB_DEPLOY_TOKEN
RUN git clone --depth 1 \
    https://gitlab-deploy-token:${GITLAB_DEPLOY_TOKEN}@gitlab.example.com/homelab/knowledgecore.git \
    /repo

WORKDIR /repo/kith/client

RUN npm ci && npm run build

# ─────────────────────────────────────────────
# Stage 2: Production Node.js server
# ─────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

COPY --from=frontend-builder /repo/kith/server/package*.json ./
RUN npm ci --omit=dev

COPY --from=frontend-builder /repo/kith/server/src/ ./src/
COPY --from=frontend-builder /repo/kith/server/init.sql ./init.sql
COPY --from=frontend-builder /repo/kith/client/dist/ ./public/

RUN mkdir -p /media

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { if (r.statusCode !== 200) process.exit(1) })"

CMD ["node", "src/index.js"]

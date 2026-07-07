# Kith — personal CRM (v1)
# Node 24 LTS pinned per build plan D7. Do NOT use lts-alpine (floating tag).
FROM node:24-alpine

# ffmpeg: video thumbnail generation (fluent-ffmpeg wraps the system binary)
# curl: compose healthcheck
RUN apk add --no-cache ffmpeg curl

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY SPEC.md BRANDING.md logo.png ./

EXPOSE 3000

CMD ["node", "server/index.js"]

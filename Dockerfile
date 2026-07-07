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

# Run as the non-root `node` user (uid/gid 1000, built into node:24-alpine).
# chown so the app can read its files and write /app/uploads inside the image.
# DEPLOY-TIME CAVEAT: the host bind mounts override in-image ownership —
#   /opt/kith/uploads (mounted at /app/uploads) is root:root 755 on
#   the host per audit, and the NFS media dir (/srv/kith/media → /media)
#   must also be writable by uid 1000 (node). Fix host-side with e.g.
#   `chown -R 1000:1000 /opt/kith/uploads` (and equivalent NFS
#   export/permissions for the media share) or the app cannot write there.
RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["node", "server/index.js"]

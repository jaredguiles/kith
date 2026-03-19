# ─────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /build

# Install client deps first (layer cache)
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy client source and build
COPY client/ ./client/
RUN cd client && npm run build

# ─────────────────────────────────────────────
# Stage 2: Production Node.js server
# ─────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install only production server deps (layer cache)
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server/src/ ./src/
COPY server/init.sql ./init.sql

# Copy built React app into the server's public dir
COPY --from=frontend-builder /build/client/dist ./public/

# Create media directory (mapped to the storage layer volume at runtime)
RUN mkdir -p /media

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { if (r.statusCode !== 200) process.exit(1) })"

CMD ["node", "src/index.js"]

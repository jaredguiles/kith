# Multi-stage build for Kith CRM
# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for both client and server
COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all dependencies
RUN npm --prefix client install
RUN npm --prefix server install

# Copy application code
COPY client/ ./client/
COPY server/ ./server/

# Build the React client (outputs to server/public/)
RUN npm --prefix client run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy only production dependencies and built app from builder
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/src ./server/src
COPY --from=builder /app/server/public ./server/public

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the server
CMD ["node", "server/src/index.js"]

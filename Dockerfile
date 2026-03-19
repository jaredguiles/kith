# Stage 1: Build React frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src/ ./src/
COPY server/init.sql ./init.sql
COPY --from=frontend-builder /build/client/dist ./public/
RUN mkdir -p /media
EXPOSE 3000
CMD ["node", "src/index.js"]

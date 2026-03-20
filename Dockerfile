# Stage 1: Build frontend
FROM node:lts-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:lts-alpine
RUN apk add --no-cache ffmpeg curl
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY server/ ./server/
EXPOSE 3000
CMD ["node", "server/index.js"]

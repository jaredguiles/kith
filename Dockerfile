# Kith — blank scaffold
# Rebuild the app image starting here. Placeholder that produces a runnable
# container so the deploy pipeline stays green until the real app lands.
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

# Minimal health endpoint so the compose healthcheck passes on a fresh deploy.
RUN printf '%s\n' \
  'const http = require("http");' \
  'const port = process.env.PORT || 3000;' \
  'http.createServer((req, res) => {' \
  '  if (req.url === "/api/health") { res.writeHead(200, {"Content-Type":"application/json"}); return res.end(JSON.stringify({status:"ok"})); }' \
  '  res.writeHead(200, {"Content-Type":"text/plain"}); res.end("Kith: blank scaffold. Rebuild in progress.");' \
  '}).listen(port, () => console.log("kith scaffold listening on " + port));' \
  > server.js

EXPOSE 3000

CMD ["node", "server.js"]

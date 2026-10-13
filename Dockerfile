FROM ollama/ollama:0.12.6 AS ollama
FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 curl bash xxd openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN curl -fLsS https://github.com/mynkpdr/termlog/releases/download/v0.2.0/termlog-x86_64-unknown-linux-musl -o /usr/local/bin/termlog && chmod +x /usr/local/bin/termlog
COPY --from=ollama /bin/ollama /usr/local/bin/ollama
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.mjs ledger.mjs invoice.mjs labs.mjs labs-client.mjs tangram.mjs tangram-targets.json tangram-solutions.json ./
COPY tools/ ./tools/
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]

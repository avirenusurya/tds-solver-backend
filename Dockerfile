FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.mjs ledger.mjs invoice.mjs ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]

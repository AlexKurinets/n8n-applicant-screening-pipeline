# One image for the Node services (portal, docsvc, fake-llm, dashboard) and the
# migrate, seed and cli jobs. n8n runs from its own official image.
FROM node:22.23.3-alpine3.24
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /data/documents && chown node:node /data/documents
USER node

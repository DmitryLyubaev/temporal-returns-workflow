FROM node:24.22.2-bookworm-slim@sha256:a43f7fc3e52e87d12a905f46eea0275def84ca8f2981a5b53fed44d7fb398ee0
WORKDIR /app
ARG SOURCE_SHA=uncommitted
LABEL org.opencontainers.image.revision=$SOURCE_SHA
ENV SOURCE_SHA=$SOURCE_SHA
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
CMD ["node", "build/src/worker.js"]

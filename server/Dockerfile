# ==============================================================================
# ResumeForge - Backend Standalone Dockerfile (Node.js + Playwright Chromium)
# ==============================================================================

# Stage 1: Build TypeScript server
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci

COPY . .

RUN npm run build -w server

# Stage 2: Runtime
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV CHROMIUM_ARGS="--no-sandbox --disable-setuid-sandbox"

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci --omit=dev

# Install Chromium and system dependencies for Playwright
RUN npx playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

COPY --from=build /app/server/dist ./server/dist

EXPOSE 5000

CMD ["npm", "start"]

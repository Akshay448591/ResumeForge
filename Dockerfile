# ==============================================================================
# ResumeForge - Multi-Stage Production Dockerfile
# Optimized for Render, Cloud PaaS, and Containerized Deployments
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Frontend and Backend
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy root and workspace package files for layer caching
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all dependencies (including build devDependencies)
RUN npm ci

# Copy full application source
COPY . .

# Build client SPA (Vite) and server (TypeScript)
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime with Playwright Chromium
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000
ENV CHROMIUM_ARGS="--no-sandbox --disable-setuid-sandbox"

# Copy package configurations
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install production dependencies only
RUN npm ci --omit=dev

# Install Playwright Chromium browser and required Linux system dependencies
RUN npx playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Copy compiled artifacts from builder stage
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Expose application port (Render default is 10000)
EXPOSE 10000

# Health check to ensure service responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 10000) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the unified server
CMD ["npm", "start"]

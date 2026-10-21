# ==============================================================================
# ResumeForge - Frontend Standalone Dockerfile (Nginx)
# ==============================================================================

# Stage 1: Build the Vite React Application
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Copy root and workspace package files
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci

# Copy source
COPY . .

# Build client
RUN npm run build -w client

# Stage 2: Serve with lightweight Nginx
FROM nginx:alpine AS runner

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

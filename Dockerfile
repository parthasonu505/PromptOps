# PromptOps Docker Image
# Multi-stage build for optimized production image

# ==============================================================================
# Stage 1: Dependencies
# ==============================================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install dependencies needed for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# ==============================================================================
# Stage 2: Builder
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY postcss.config.js ./
COPY tailwind.config.ts ./
COPY components.json ./
COPY drizzle.config.ts ./

# Copy source directories
COPY client ./client
COPY server ./server
COPY shared ./shared

# Build the application
# 1. Build frontend with Vite (outputs to dist/public)
# 2. Build backend with esbuild (outputs to dist/index.js)
RUN npm run build

# ==============================================================================
# Stage 3: Production
# ==============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
RUN apk add --no-cache libc6-compat

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 promptops

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only (skip devDependencies)
RUN npm ci --omit=dev && npm cache clean --force

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy shared schema (needed at runtime for Drizzle)
COPY --from=builder /app/shared ./shared

# Set ownership
RUN chown -R promptops:nodejs /app

# Switch to non-root user
USER promptops

# Environment variables
ENV NODE_ENV=production
# Note: PORT is set by GCP Cloud Run automatically (usually 8080)
# Do NOT hardcode PORT here - let GCP set it

# Expose port 8080 (GCP Cloud Run default) but app reads from $PORT env var
EXPOSE 8080

# Health check - use $PORT for flexibility
# Note: GCP Cloud Run has its own health checks, this is for local Docker testing
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/api/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]

# Stage 1: Build
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Build-time environment variables for Vite bundling
ARG VITE_API_BASE_URL="http://localhost:8080"
ARG VITE_WS_BASE_URL="ws://localhost:8080"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_BASE_URL=$VITE_WS_BASE_URL

# Copy lock and package files
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy all source files
COPY . .

# Build the client and SSR bundles via Nitro
RUN bun run build

# Stage 2: Runtime
FROM oven/bun:1-alpine

WORKDIR /app

# Copy only the compiled production output
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

ENV HOST=0.0.0.0
ENV PORT=3000

# Start the production SSR server
CMD ["bun", ".output/server/index.mjs"]

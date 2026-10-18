FROM node:20-alpine

WORKDIR /app

# Install build tools in case any native module requires compilation
RUN apk add --no-cache python3 make g++

# Copy package descriptors
COPY package*.json ./

# Install dependencies (production)
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose HTTP and WebSocket port
EXPOSE 3000

# Cloud container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Launch game server
CMD ["node", "server/index.js"]

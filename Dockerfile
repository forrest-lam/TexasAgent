FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

# Build client (use empty VITE_SERVER_URL so API calls use relative paths in production)
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build --workspace=client

# Expose port
EXPOSE 3001

# Start server with tsx (uses source directly, avoids tsc build issues with monorepo paths)
ENV NODE_ENV=production
CMD ["npx", "tsx", "server/src/index.ts"]

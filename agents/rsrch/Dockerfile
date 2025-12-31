FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Copy package files first for layer caching
COPY rsrch/package.json rsrch/package-lock.json* ./
COPY shared ./shared/

# Update package.json to point to the correct shared module path
RUN sed -i 's|file:../shared|file:./shared|g' package.json

# Build shared library first (required for CI where dist/ is missing)
RUN cd shared && npm install && npm run build

# Install dependencies (browsers are already in the image)
RUN npm install

# Copy rsrch source files
COPY rsrch/src ./src/
COPY rsrch/tsconfig.json ./
COPY rsrch/*.sh ./

# Build TypeScript
RUN npm run build

# Expose HTTP server port
EXPOSE 3000

# Default: Run the HTTP server
CMD ["node", "dist/index.js", "serve"]

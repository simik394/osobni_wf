FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (browsers are already in the image)
RUN npm install

# Copy source files
COPY . .

# Build TypeScript
RUN ls -la
RUN npm run build

# Expose HTTP server port
EXPOSE 3000

# Default: Run the HTTP server
CMD ["npm", "run", "serve"]


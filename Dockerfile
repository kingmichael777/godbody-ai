FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code (excluding dev files)
COPY server.js ./
COPY server/ ./server/
COPY client/ ./client/

# Create uploads dir
RUN mkdir -p uploads

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]

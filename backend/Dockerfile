FROM node:22-slim

RUN apt-get update && apt-get install -y openssl

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

# Install dependecies
RUN npm install

# Copy source and prisma config
COPY src ./src
COPY prisma ./prisma
COPY .env ./

# Generate prisma client
RUN npx prisma generate

# Build typescript 
RUN npx tsc

EXPOSE 3001

CMD ["node", "dist/index.js"]

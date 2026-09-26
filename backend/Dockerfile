FROM node:22-slim

RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list && \
    sed -i 's/security.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list
RUN apt-get update && apt-get install -y openssl

WORKDIR /app/backend

COPY backend/package*.json ./
COPY backend/tsconfig.json ./

# Install dependecies
RUN npm install

# Copy source and prisma config
COPY backend/src ./src
COPY backend/prisma ./prisma
COPY shared /app/shared

# Generate prisma client
RUN npx prisma generate

# Build typescript 
RUN npx tsc

EXPOSE 3002

CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/backend/src/index.js"]

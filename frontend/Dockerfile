# syntax=docker/dockerfile:1.7

FROM node:22-slim AS build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --registry=https://registry.npmmirror.com

COPY frontend .
COPY shared /app/shared
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_COLLECTOR_GATEWAY_URL=
ENV VITE_COLLECTOR_GATEWAY_URL=${VITE_COLLECTOR_GATEWAY_URL}

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

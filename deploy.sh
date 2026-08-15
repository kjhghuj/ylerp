#!/bin/bash
set -Eeuo pipefail

PROJECT_DIR="/opt/ylerp"
COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="/var/log/ylerp-deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

compose() {
    docker compose -f "$COMPOSE_FILE" "$@"
}

exec > >(tee -a "$LOG_FILE") 2>&1

trap 'status=$?; log "部署失败，退出码：${status}"; exit "$status"' ERR

log "========== 开始部署 =========="

cd "$PROJECT_DIR"

log "恢复 webhook 密钥..."
sed -i 's/your-webhook-secret-here/yl-webhook-2026-secret/' webhook.service

log "单并发构建 API 与 Web 镜像..."
docker compose --parallel 1 -f "$COMPOSE_FILE" build api web

log "确保数据库与 Redis 已启动..."
compose up -d db redis

log "在更新应用容器前运行数据库迁移..."
compose run --rm --no-deps api npx prisma migrate deploy

log "按需更新 API 与 Web 服务..."
compose up -d --no-deps --remove-orphans api web

log "清理旧的悬空镜像，保留构建缓存供下次部署复用..."
docker image prune -f

log "重启 webhook 服务..."
systemctl daemon-reload
systemctl restart webhook

log "========== 部署完成 =========="
log ""

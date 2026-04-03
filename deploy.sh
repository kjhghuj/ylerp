#!/bin/bash
set -e

PROJECT_DIR="/opt/ylerp"
COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="/var/log/ylerp-deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========== 开始部署 =========="

cd "$PROJECT_DIR"

log "拉取最新代码..."
git pull origin main

log "重新构建并启动服务..."
docker compose -f "$COMPOSE_FILE" build --parallel
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

log "运行数据库迁移..."
docker compose -f "$COMPOSE_FILE" exec -T api npx prisma migrate deploy 2>/dev/null || true

log "清理旧镜像..."
docker image prune -f

log "========== 部署完成 =========="
log ""

#!/bin/bash
set -e

PROJECT_DIR="/opt/ylerp"
COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="/var/log/ylerp-deploy.log"
MIRROR="https://ghfast.top/https://github.com/kjhghuj/ylerp.git"
ORIGIN="https://github.com/kjhghuj/ylerp.git"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========== 开始部署 =========="

cd "$PROJECT_DIR"

log "放弃本地未提交的修改..."
git checkout -- .

log "通过镜像拉取最新代码..."
git remote set-url origin "$MIRROR"
git pull origin main
git remote set-url origin "$ORIGIN"

log "恢复 webhook 密钥..."
sed -i 's/your-webhook-secret-here/yl-webhook-2026-secret/' webhook.service

log "重新构建并启动服务..."
docker compose -f "$COMPOSE_FILE" build --parallel
docker compose -f "$COMPOSE_FILE" up -d --force-recreate --remove-orphans

log "运行数据库迁移..."
docker compose -f "$COMPOSE_FILE" exec -T api npx prisma migrate deploy 2>/dev/null || true

log "清理旧镜像和构建缓存..."
docker image prune -f
docker builder prune -f --filter "until=24h"

log "重启 webhook 服务..."
systemctl restart webhook

log "========== 部署完成 =========="
log ""

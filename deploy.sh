#!/bin/bash
set -e

PROJECT_DIR="/opt/ylerp"
COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="/var/log/ylerp-deploy.log"
ORIGIN="https://github.com/kjhghuj/ylerp.git"

# GitHub 加速镜像列表（按优先级排列，国内服务器备用）
MIRRORS=(
    "https://gitclone.com/github.com/kjhghuj/ylerp.git"
    "https://gh.con.sh/https://github.com/kjhghuj/ylerp.git"
)

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========== 开始部署 =========="

cd "$PROJECT_DIR"

log "放弃本地未提交的修改..."
git checkout -- .

# ---- git pull 多重容错 ----
log "拉取最新代码..."
PULL_OK=false

# 先试直连（如果服务器有代理/海外网络）
log "尝试直连 GitHub..."
git remote set-url origin "$ORIGIN"
if git pull origin main --no-rebase 2>/dev/null; then
    log "直连成功"
    PULL_OK=true
fi

# 直连失败，逐个尝试镜像
if [ "$PULL_OK" = false ]; then
    log "直连失败，尝试镜像..."
    for MIRROR in "${MIRRORS[@]}"; do
        log "尝试镜像: $MIRROR"
        git remote set-url origin "$MIRROR"
        if git pull origin main --no-rebase 2>/dev/null; then
            log "镜像 $MIRROR 拉取成功"
            PULL_OK=true
            break
        fi
        log "镜像 $MIRROR 失败，尝试下一个..."
    done
fi

# 全部失败
if [ "$PULL_OK" = false ]; then
    log "❌ 所有方式均拉取失败，中止部署"
    exit 1
fi

# 恢复 origin URL
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
systemctl daemon-reload
systemctl restart webhook

log "========== 部署完成 =========="
log ""

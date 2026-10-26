#!/usr/bin/env bash
set -euo pipefail

target_sha="${1:?Expected validated commit SHA}"
deploy_scope="${2:-web}"
[[ "$target_sha" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 2; }
[[ "$deploy_scope" == web || "$deploy_scope" == full ]] || { echo 'Invalid deploy scope' >&2; exit 2; }
cd /opt/ylerp
git fetch origin main
git merge-base --is-ancestor "$target_sha" origin/main
git checkout --detach "$target_sha"

export COMPOSE_PARALLEL_LIMIT=1
export YLERP_WEB_IMAGE="ylerp-web:$target_sha"
compose=(docker compose -f docker-compose.prod.yml)
previous_id="$("${compose[@]}" images -q web | head -n 1)"
rollback_image="ylerp-web:rollback-$target_sha"
if [[ -n "$previous_id" ]]; then docker tag "$previous_id" "$rollback_image"; fi
promoted=0
rollback() {
  result=$?
  trap - ERR
  if [[ "$promoted" == 1 && -n "$previous_id" ]]; then
    echo "Deployment failed; restoring previous web image $rollback_image" >&2
    YLERP_WEB_IMAGE="$rollback_image" "${compose[@]}" up -d --no-deps --no-build web || echo 'Web rollback failed; operator action required' >&2
  elif [[ "$promoted" == 1 ]]; then
    echo 'First deployment has no previous web image; operator action required' >&2
  fi
  exit "$result"
}
trap rollback ERR

if [[ "$deploy_scope" == full ]]; then
  "${compose[@]}" build api
fi
"${compose[@]}" build web
if [[ "$deploy_scope" == full ]]; then
  "${compose[@]}" run --rm --no-deps api npx prisma migrate deploy </dev/null
  "${compose[@]}" up -d db redis api
fi
# A UI release only replaces web: no API rebuild/restart or schema migration.
promoted=1
"${compose[@]}" up -d --no-deps --no-build web

healthy=false
for attempt in $(seq 1 20); do
  if "${compose[@]}" exec -T api node -e 'fetch("http://127.0.0.1:3002/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' </dev/null; then
    healthy=true
    break
  fi
  sleep 3
done
[[ "$healthy" == true ]]
assets="$("${compose[@]}" exec -T web find /usr/share/nginx/html/assets -type f | sed -nE 's#^/usr/share/nginx/html(/.*\.(js|css))$#\1#p' | tr -d '\r')"
test -n "$assets"
cat frontend/scripts/web-smoke.mjs | "${compose[@]}" exec -T -e WEB_SMOKE_BASE=http://web -e WEB_ASSETS="$assets" api node --input-type=module
printf 'Validated deployment: %s (%s)\nPrevious web image: %s\n' "$target_sha" "$deploy_scope" "${previous_id:-none}"
"${compose[@]}" ps

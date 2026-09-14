# Production Automatic Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the `main` branch to `/opt/ylerp` automatically through GitHub Actions.

**Architecture:** A GitHub-hosted runner connects to the production server over SSH using repository secrets. The server fast-forwards its checkout, builds API and web images sequentially, applies Prisma migrations, starts Compose services, and checks the API health endpoint.

**Tech Stack:** GitHub Actions, OpenSSH, Git, Docker Compose, Prisma

---

### Task 1: Add a manually triggered deployment workflow

**Files:**
- Create: `.github/workflows/deploy-production.yml`

- [ ] **Step 1: Create the manual workflow**

```yaml
name: Deploy production

on:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: production-deployment
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - name: Configure SSH
        env:
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_SSH_KEY: ${{ secrets.SERVER_SSH_KEY }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
        run: |
          test -n "$SERVER_HOST"
          test -n "$SERVER_USER"
          test -n "$SERVER_SSH_KEY"
          install -m 700 -d ~/.ssh
          printf '%s\n' "$SERVER_SSH_KEY" | tr -d '\r' > ~/.ssh/ylerp_deploy
          chmod 600 ~/.ssh/ylerp_deploy
          ssh-keyscan -H "$SERVER_HOST" >> ~/.ssh/known_hosts

      - name: Deploy
        env:
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
        run: |
          ssh -i ~/.ssh/ylerp_deploy -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 "$SERVER_USER@$SERVER_HOST" 'bash -se' <<'REMOTE'
            set -euo pipefail
            cd /opt/ylerp
            git fetch origin main
            git checkout main
            git pull --ff-only origin main
            export COMPOSE_PARALLEL_LIMIT=1
            docker compose -f docker-compose.prod.yml build api
            docker compose -f docker-compose.prod.yml build web
            docker compose -f docker-compose.prod.yml run --rm --no-deps api npx prisma migrate deploy
            docker compose -f docker-compose.prod.yml up -d --remove-orphans

            healthy=false
            for attempt in $(seq 1 20); do
              if docker compose -f docker-compose.prod.yml exec -T api node -e 'fetch("http://127.0.0.1:3002/health").then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))'; then
                healthy=true
                break
              fi
              sleep 3
            done
            if [ "$healthy" != true ]; then
              docker compose -f docker-compose.prod.yml logs --tail=100 api
              exit 1
            fi
            docker compose -f docker-compose.prod.yml ps
          REMOTE
```

- [ ] **Step 2: Validate repository changes**

Run:

```bash
git diff --check -- .github/workflows/deploy-production.yml
git status --short
```

Expected: no whitespace errors; only the intended deployment files are staged or committed.

- [ ] **Step 3: Commit and push the manual workflow**

```bash
git add .github/workflows/deploy-production.yml
git commit -m "ci: add manual production deployment"
git push origin main
```

Expected: the workflow appears under the repository Actions tab and does not start automatically because it only has `workflow_dispatch`.

### Task 2: Validate the production deployment manually

**Files:**
- Inspect: GitHub Actions run log
- Inspect: `/opt/ylerp` production checkout and Compose services

- [ ] **Step 1: Start `Deploy production` with the GitHub Actions `Run workflow` button**

Expected: SSH configuration succeeds and the deployment job reaches the remote build commands.

- [ ] **Step 2: Confirm the deployment run succeeds**

Expected: both images build sequentially, Prisma reports all migrations applied, the API health request succeeds, and Compose lists the services as running.

### Task 3: Enable automatic deployment from main

**Files:**
- Modify: `.github/workflows/deploy-production.yml`

- [ ] **Step 1: Add the push trigger while retaining manual runs**

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:
```

- [ ] **Step 2: Validate and commit the trigger**

```bash
git diff --check -- .github/workflows/deploy-production.yml
git add .github/workflows/deploy-production.yml
git commit -m "ci: deploy main automatically"
git push origin main
```

Expected: the push starts one production deployment. The concurrency group prevents overlapping deployment jobs and never cancels a deployment already in progress.

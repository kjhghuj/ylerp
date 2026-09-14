# Production automatic deployment design

## Goal

Deploy the `main` branch automatically to the production server after every successful GitHub push. A short API restart is acceptable.

## Architecture

GitHub Actions starts one deployment job for each push to `main`. The job authenticates to the production server with the repository secrets `SERVER_HOST`, `SERVER_USER`, and `SERVER_SSH_KEY`, then runs deployment commands in `/opt/ylerp`.

The server keeps ownership of production configuration. Files such as `backend/.env` remain on the server and are excluded from Git.

## Deployment flow

1. Fetch `origin/main` and update the server checkout with a fast-forward-only pull.
2. Build the API and web images sequentially to avoid excessive memory use on the 2-core, 4 GB server.
3. Run `npx prisma migrate deploy` with the newly built API image.
4. Start the updated Compose services.
5. Print Compose service status in the Actions log.

Only one production deployment may run at a time. A newer push waits for the active deployment instead of cancelling it halfway through.

## Failure handling

The remote script uses fail-fast shell behavior. A failed pull, build, or migration stops the job. Services are restarted only after both images build and the database migration succeeds. GitHub Actions reports the failed command in its log.

## Security

The SSH private key is stored only as an encrypted GitHub Actions secret. The corresponding public key is installed on the server. Production environment files and database credentials are never copied into the workflow or repository.

## Validation

The workflow is validated first with a manual GitHub Actions run. Success requires an SSH connection, a clean fast-forward pull, successful sequential builds, an up-to-date Prisma schema, and running Compose services. Subsequent pushes to `main` trigger the same workflow automatically.

# DOE SPARK

**Secure Platform for Archives, Records, and Knowledge** is a local-first, DOE-branded file workspace. This repository is a clean Next.js implementation; NextExplorer is a behavioral reference, not a code dependency.

SPARK provides local accounts, file and folder CRUD, recoverable deletion, activity tracking, search and previews, administrative access controls, health checks, and Docker deployment. OneDrive or rclone synchronization remains external to SPARK.

## Requirements

- Node.js 24 LTS for production; Node.js 24–26 for development
- npm
- Docker Desktop for the deployment workflow

## Local development

```powershell
npm ci
Copy-Item .env.example .env.local
npm run admin:create -- --username admin --display-name "SPARK Administrator"
npm run dev
```

Update `.env.local` with absolute temporary development directories and a random session secret first. The administrator command prompts for its password; SPARK ships no credentials.

Open `http://localhost:3000`. Useful checks:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run verify:foundation
npm run check
```

## Docker deployment

Create `.env` beside `compose.yaml`, configure the host paths and canonical origin, then run:

```powershell
Copy-Item .env.example .env
docker compose config
docker compose up -d --build
docker compose exec spark npm run admin:create -- --username admin --display-name "SPARK Administrator"
```

OneDrive synchronization is performed by the Windows OneDrive client outside SPARK. The application receives only the local, fully pinned folder as its `/files` bind mount.

Current transfer behavior includes individual file upload/download plus whole-folder upload and ZIP download. Folder uploads preserve relative paths, report progress, and require an explicit conflict choice; generated archives are bounded to 10,000 files and 256 MiB. Folder listings and stats calculate recursive byte totals directly from the configured local filesystem root; no external index is required.

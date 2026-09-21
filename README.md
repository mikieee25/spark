# DOE SPARK

**Secure Platform for Archives, Records, and Knowledge** is a local-first, DOE-branded file workspace. This repository is a clean Next.js implementation; NextExplorer is a behavioral reference, not a code dependency.

Phase 1 provides validated configuration, SQLite migrations, local accounts, hardened opaque sessions, a protected responsive shell, health probes, and Docker deployment. File CRUD and activity tracking begin in Phase 2.

The current execution order is UI-first: the file workspace is being refined against mock data while Phase 1 deployment work is deferred. Mock interactions are browser-local and do not touch OneDrive or persistent storage.

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

Follow [Local Windows deployment](docs/deployment/local-windows.md), then run:

```powershell
docker compose config
docker compose up -d --build
```

OneDrive synchronization is performed by the Windows OneDrive client outside SPARK. The application receives only the local, fully pinned folder as its `/files` bind mount.

## Project decisions

- [Approved design specification](docs/superpowers/specs/2026-09-21-spark-design.md)
- [Phased roadmap](docs/superpowers/plans/2026-09-21-spark-roadmap.md)

The roadmap is planning material; only capabilities represented by source and passing verification are current implementation.

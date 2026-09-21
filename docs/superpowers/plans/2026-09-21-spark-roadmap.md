# DOE SPARK Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete DOE SPARK system as independently testable increments in a new sibling project at `C:\Users\mklgr\Codes\SPARK`.

**Architecture:** A Docker-first Next.js modular monolith owns UI, authenticated HTTP routes, filesystem services, background work, SQLite metadata, and WebSocket terminal sessions. The OneDrive client owns synchronization; SPARK operates only on a fully local mounted directory.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, SQLite, Vitest, Playwright, Docker Compose, ONLYOFFICE Docs Community

**Spec:** `C:\Users\mklgr\Codes\NextExplorer\docs\superpowers\specs\2026-09-21-spark-design.md`

## Global Constraints

- Build SPARK in `C:\Users\mklgr\Codes\SPARK`; keep `C:\Users\mklgr\Codes\NextExplorer` read-only as a behavioral reference.
- Use new TypeScript implementation and DOE/SPARK assets; do not port Vue components, stores, or visual assets.
- The Windows OneDrive client remains solely responsible for synchronization.
- All authenticated users receive shared-space CRUD; administrative controls remain administrator-only.
- Filesystem mutations use logical paths, containment checks, path locks, an operation journal, explicit conflicts, and activity records.
- Authenticated filesystem responses must never enter shared Next.js caches.
- Anonymous access defaults off and, when temporarily enabled, remains read-only and expires server-side.
- Every phase uses test-driven development and must pass its verification gate before the next phase.
- Never use production OneDrive data during development or destructive testing.

---

## Phase Plans

### Phase 1: Foundation

Create the separate Next.js project, DOE token system, persistent configuration, SQLite migration layer, local authentication, protected shell, Docker deployment, and health checks.

**Detailed plan:** `docs/superpowers/plans/2026-09-21-spark-foundation.md`

**Exit:** A fresh Docker install can create an administrator, sign in, render the protected SPARK shell, persist sessions across restart, and report storage/database readiness.

### Phase 2: Core Files and Activity

Plan after Phase 1 interfaces are verified. Implement logical paths, containment, listing, CRUD, uploads/downloads, conflicts, path locks, operation journal, progress, and append-only activity.

**Exit:** Authenticated users complete file CRUD against a non-production mounted root, and every operation is recoverable and auditable.

### Phase 3: Recycle, Versions, and Recovery

Implement confirmation dialogs, isolated recycle storage, restore, administrator purge, retention, pre-overwrite versions, startup reconciliation, and backup/restore tooling.

**Exit:** Delete, restore, overwrite, restart, and recovery scenarios pass integration and browser tests without data loss.

### Phase 4: Search, Preview, and Discovery

Implement resumable indexing, filename/content search, thumbnails, metadata extraction, media/PDF/text/code/archive previews, favorites, and recent items.

**Exit:** Search and previews remain bounded, cancellable, restart-safe, and isolated from application-private directories.

### Phase 5: Productivity

Implement text/code editing, archive creation/extraction, internal authenticated links, ONLYOFFICE callbacks, signed editor tokens, version capture, and editor-capacity handling.

**Exit:** Supported documents edit safely, 10-15 concurrent editor scenarios are measured, and editor failure falls back to preview/download.

### Phase 6: Administration and Temporary Anonymous Access

Implement user administration, activity explorer/export, storage and job dashboards, retention controls, editor health, branding settings, and the expiring read-only anonymous mode.

**Exit:** Anonymous mode automatically re-locks after restart or expiry, and all administrative actions are authorization-tested and audited.

### Phase 7: Terminal, Hardening, and Release

Implement the disabled-by-default administrator terminal, WebSocket single-use tokens, complete responsive/accessibility coverage, performance measurement, Docker upgrades, remote-access readiness, and Windows/OneDrive staging validation.

**Exit:** The full specification acceptance criteria pass on the target system using copied non-production data.

## Planning Rule

Write each later detailed phase plan only after the preceding phase passes its exit gate. Carry forward verified interfaces and migration versions rather than guessing them in advance.

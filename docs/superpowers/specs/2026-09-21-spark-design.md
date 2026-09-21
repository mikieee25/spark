# DOE SPARK Design Specification

**Product:** DOE SPARK  
**Expanded name:** Secure Platform for Archives, Records, and Knowledge  
**Status:** Approved architecture for planning  
**Date:** 2026-09-21

## 1. Purpose

SPARK is a clean Next.js rebuild of a self-hosted file-management platform for DOE. The existing NextExplorer source is a behavioral reference for features and edge cases only. SPARK will use new TypeScript architecture, components, branding, and implementation.

SPARK manages a locally available OneDrive-synchronized folder on a dedicated Windows system unit. The application reads and writes normal local files; the OneDrive desktop client remains solely responsible for cloud synchronization.

## 2. Goals

- Preserve the useful capabilities represented by NextExplorer: browsing, search, file CRUD, uploads, downloads, previews, editing, sharing, favorites, recycle bin, versions, activity, administration, archives, and terminal access.
- Use local accounts and server-side authorization.
- Let every authenticated user create, read, update, delete, upload, and download throughout the shared file space.
- Keep privileged system controls, activity history, permanent purge, and terminal access administrator-only.
- Provide recoverable deletion and durable activity tracking.
- Match PULSE's DOE visual language while giving SPARK its own file-workspace identity.
- Deploy locally through Docker with one primary application endpoint.
- Remain ready for a future public HTTPS deployment without requiring it initially.

## 3. Non-goals

- SPARK will not control, replace, or emulate the OneDrive sync client.
- SPARK will not use Microsoft identity for application login.
- SPARK will not embed Microsoft 365 for the web.
- Initial deployment will not require a public domain, VPN, Vercel, Supabase, or another cloud runtime.
- NextExplorer Vue components, stores, API modules, and visual assets will not be ported into SPARK.

## 4. Deployment Architecture

SPARK is a Docker-first Next.js modular monolith:

```text
Browser
   |
   | HTTP on LAN; HTTPS when remotely exposed
   v
Next.js application with custom Node server
   |-- App Router user interface
   |-- authenticated HTTP route handlers
   |-- filesystem and domain services
   |-- WebSocket terminal service
   |-- persistent background-job runner
   `-- SQLite metadata database
          |
          |-- mounted OneDrive working directory
          |-- isolated recycle directory
          |-- isolated version directory
          `-- thumbnail, media, and search cache
```

The primary container exposes one application port. ONLYOFFICE Docs Community runs as an optional companion container. The OneDrive working directory and SPARK configuration, data, recycle, versions, and cache directories are separate mounts.

The OneDrive directory must be fully downloaded using **Always keep on this device**. Online-only placeholders are not considered valid working files.

## 5. Technology Direction

- Next.js App Router and React with TypeScript
- Node runtime; no Edge runtime for filesystem operations
- Tailwind CSS with centralized semantic DOE/PULSE tokens
- Accessible reusable primitives suitable for keyboard and touch use
- SQLite in WAL mode for application metadata
- SQLite FTS where appropriate for indexed metadata and extracted text
- Playwright for browser workflows and a unit/integration test runner for domain services
- Custom Node server for WebSocket upgrades and terminal sessions
- Docker Compose for the application and optional document editor

Authenticated filesystem data is dynamic and must not enter a shared Next.js cache. Static application assets may be cached normally.

## 6. Roles and Access

### Authenticated user

Every authenticated user can:

- Browse and search the shared file space
- Preview and download files
- Upload files and folders
- Create folders and supported documents
- Rename, copy, move, replace, and delete items
- Restore items they can see from the recycle bin
- Edit supported text, code, and Office files
- Use favorites, internal links, and personal preferences

### Administrator

Administrators receive all user capabilities plus:

- Create, disable, reset, and manage local accounts
- View and export the complete activity log
- Permanently purge recycle-bin entries
- Configure storage, retention, indexing, previews, editor integration, and branding
- Review system health and background jobs
- Enable temporary anonymous access
- Use the terminal when the terminal feature is enabled

### Anonymous visitor

Anonymous access is disabled by default. While temporarily enabled, visitors may only browse, search, preview, and download. Anonymous visitors cannot mutate files, use Office editing, create shares, view versions, access the recycle bin, or reach administrative and terminal surfaces.

## 7. Local Authentication

- Passwords are hashed using Argon2id with versioned parameters.
- Authentication uses opaque server-side sessions and HTTP-only cookies.
- Sessions can be listed and revoked by the account owner or an administrator.
- Login attempts are throttled and repeated failures trigger temporary lockout.
- Password-reset actions are administrator-controlled and audited.
- TOTP secrets are encrypted at rest.
- MFA is optional on LAN but becomes mandatory before public internet access is enabled.
- Session cookies use `Secure` when HTTPS is configured, an appropriate `SameSite` policy, rotation, idle expiry, and absolute expiry.

## 8. Temporary Anonymous Access

Admin Settings includes a **Require sign-in** switch:

- **On:** only authenticated local users can access SPARK.
- **Off:** anonymous visitors receive the read-only capabilities defined above.

Turning the switch off requires a confirmation dialog containing:

- A required access duration selected from presets or a custom duration
- The exact automatic re-lock date and time
- An optional administrative reason
- Explicit acknowledgement that files will be anonymously accessible

The server persists and enforces `anonymous_access_expires_at` on every request. Expiry does not depend on an open browser timer. Startup reconciliation immediately closes access if the deadline passed during downtime. Administrators can close or extend the window; both actions are audited.

The administrator shell displays a persistent warning and countdown. Anonymous pages display read-only status and the expiry. Anonymous requests receive stricter rate, bandwidth, and download-concurrency limits. Search engines are instructed not to index SPARK.

## 9. File Operation Contract

All client paths are logical paths relative to configured roots. Client input is never joined directly to host paths.

Every mutation follows this pipeline:

1. Authenticate and authorize the request.
2. Validate the input schema, operation limits, and requested names.
3. Normalize the logical path and resolve it beneath an approved root.
4. Reject traversal, reserved names, unsafe symlink escapes, and disallowed archive entries.
5. Acquire deterministic path-level locks for all affected source and destination paths.
6. Create a durable pending operation record with actor and intent.
7. Perform the filesystem operation using staging and atomic rename where supported.
8. Commit metadata, file versions, and append-only activity records.
9. Schedule search, thumbnail, folder-size, and media refresh work.
10. Mark the operation completed or failed and return an explicit result.

Startup reconciliation inspects incomplete operations and either safely completes, rolls back, or flags them for administrator review. File and database operations cannot share one transaction, so the operation journal is the recovery boundary.

Conflicts never overwrite silently. Users choose replace, rename, skip, or apply the decision to the remaining batch. Destructive replacement creates a version before modification.

## 10. Recycle Bin

- Every delete action opens a confirmation dialog.
- The dialog lists selected items, total item count, and explains that deletion moves content to the recycle bin.
- Large or bulk deletion receives stronger wording and a clear destructive confirmation.
- Deletion moves content into an isolated application recycle directory and records original path, actor, timestamp, size, operation ID, and expiry.
- Restore handles occupied destinations through the standard conflict dialog.
- Permanent purge is administrator-only and requires a second confirmation.
- Retention is configurable; scheduled expiry and purge are audited.
- OneDrive's recycle and version capabilities are secondary safeguards, not SPARK's application contract.

## 11. Activity Tracking

Activity is append-only and visible only to administrators. Events include:

- Sign-in, sign-out, failed authentication, password and MFA changes
- Create, upload, download, preview, edit, rename, copy, move, replace, and delete
- Recycle restore, retention expiry, and permanent purge
- Share, version, configuration, account, and terminal actions
- Anonymous-access opening, extension, closure, and automatic expiry
- Anonymous browsing, preview, search, and download activity
- Background-job and recovery failures that affect user data

Each event records event ID, timestamp with timezone, actor or anonymous status, action, affected logical paths, operation ID, outcome, safe error code, and relevant metadata. Sensitive credentials, session tokens, file contents, and raw secrets are never logged.

Changes detected directly in Windows or through OneDrive are recorded as **external filesystem changes**. SPARK cannot reliably assign those changes to a local application user.

The administrator interface supports filtering by date range, user, action, path, and outcome, plus bounded export.

## 12. Feature Modules

### File workspace

Grid and list layouts, breadcrumbs, history navigation, sorting, filters, selection, keyboard shortcuts, drag-and-drop uploads, contextual actions, and an operation center.

### Search and indexing

Filename, metadata, and supported document-content search. Index work is resumable, bounded, excludes application-private directories, and reports health and progress.

### Previews

Images, PDF, audio, video, text, code, archives, metadata, and supported RAW/media formats. Expensive formats use isolated background generation with time, memory, and output-size limits.

### Editing

SPARK provides its own text/code editor. ONLYOFFICE Docs Community supplies document, spreadsheet, and presentation editing through signed, short-lived callbacks. Its original branding and notices remain visible. The deployment targets 10-15 simultaneous editors, warns administrators near 15, and falls back to preview/download if the editor is unavailable or at capacity.

### Versions

Versions are created before supported overwrites and editor saves according to configurable policy. Content is stored outside the OneDrive working tree, while SQLite stores metadata and restore history.

### Archives

Browse supported archives without extraction, create archives, and extract selected or complete contents. Extraction rejects traversal, absolute paths, link escapes, excessive expansion, and unsupported encrypted operations.

### Internal sharing

Links point authenticated local users to files or folders. There are no anonymous public share links. Since all authenticated users share the same CRUD permissions, links are navigation and collaboration conveniences rather than access grants.

### Terminal

Terminal access is administrator-only and disabled by default. Enabling it requires explicit configuration. Connections use short-lived, single-use tokens; commands run inside the configured environment and all session lifecycle events are audited.

## 13. Interface and Branding

SPARK uses PULSE's verified DOE blue/yellow primitives and semantic approach for background, foreground, border, primary, warning, destructive, success, focus, elevation, motion, and data visualization. Components use semantic tokens rather than scattered raw colors.

The shell contains:

- Sidebar: Files, Recent, Favorites, Shared, Recycle Bin, Settings
- Administrator navigation: Users, Activity, Storage, Office Editor, System Health, Configuration
- Top bar: global search, create/upload, operation center, notifications, theme, account
- Main workspace: breadcrumbs, view controls, filters, selection actions, file listing
- Details panel: preview, metadata, item activity, versions, sharing details

The full product name appears on login, About, and documentation screens. Routine navigation uses **SPARK**. The design supports light and dark themes, desktop density, responsive layouts, touch targets, keyboard workflows, visible focus, reduced motion, and WCAG-appropriate contrast.

Every asynchronous surface defines loading, empty, success, error, retry, permission-denied, and unavailable states. Progress indicators do not hide stalled operations.

## 14. Persistent Data

SQLite stores:

- Users, password credentials, roles, MFA configuration, and sessions
- Activity events
- Operation journal entries and path locks
- Recycle entries and retention state
- File-version metadata
- Favorites and internal links
- Background jobs and index checkpoints
- Application, editor, storage, and branding settings
- Temporary anonymous-access state

Actual working files, recycled content, versions, and generated cache artifacts remain in their corresponding filesystem mounts. Database migrations are forward-only, versioned, tested against realistic backups, and executed with pre-migration backup checks.

## 15. Error Handling and Observability

- Domain errors use stable codes and safe user messages.
- Authentication, permission denial, not found, conflict, validation, capacity, and system failure remain distinguishable.
- Logs use structured records with request and operation IDs.
- Secrets, credentials, file contents, and unsafe client-provided values are redacted.
- Health endpoints distinguish process health, database readiness, mounted-root availability, write access, free space, and ONLYOFFICE reachability.
- Administrators see actionable job and storage failures without exposing internals to anonymous visitors.

## 16. Remote-access Readiness

Initial deployment is LAN-only. SPARK nevertheless supports a configurable canonical origin, trusted proxies, forwarded HTTPS, secure-cookie switching, CSRF origin checks, health endpoints, and reverse-proxy headers from the start.

A future public deployment requires a domain, valid TLS, hardened reverse proxy or tunnel, mandatory MFA, tested backups, stricter request limits, and a security review. Public exposure is a deployment decision and does not require redesigning the application.

## 17. Verification Strategy

- Unit tests for authentication, path resolution, containment, conflicts, authorization, anonymous expiry, and retention policy
- Integration tests using real SQLite and isolated temporary filesystems
- Contract tests for ONLYOFFICE callbacks and signed tokens
- Playwright tests for authentication, browsing, CRUD, uploads, downloads, search, previews, recycle, restore, versions, anonymous access, activity, and administration
- Concurrency tests for rename, move, replace, editor save, and recycle conflicts
- Restart and power-loss simulations for pending operations and expired anonymous access
- Archive-bomb, traversal, symlink, malformed-request, and upload-limit security tests
- Accessibility and keyboard testing for critical flows
- Docker clean-install, backup/restore, migration, health-check, and upgrade tests
- Final staging validation on Windows with a copied, non-production OneDrive dataset

Production readiness requires passing lint, type checking, unit/integration/browser tests, a production build, responsive and accessibility checks, dependency and Next.js security review, header inspection, backup restore rehearsal, and measured performance on the target system unit.

## 18. Delivery Sequence

All approved capabilities remain in scope, delivered through separately verifiable increments:

1. Foundation: Next.js shell, DOE tokens, Docker, SQLite, configuration, local authentication
2. Core files: browsing, upload/download, CRUD, conflicts, operation journal, activity
3. Safety: recycle, restore, versions, backups, recovery reconciliation
4. Discovery: search, indexing, previews, metadata, favorites
5. Productivity: text/code editor, archives, ONLYOFFICE, internal links
6. Administration: users, activity explorer, storage, health, retention, editor capacity
7. Advanced: terminal, performance hardening, remote-access readiness, complete migration checks

Each increment must preserve already-working behavior and pass its relevant verification gate before the next increment begins.

## 19. Acceptance Criteria

The design is implemented when:

- A clean Docker installation can mount a pinned local OneDrive folder and safely manage its files.
- Authenticated local users can complete the full approved file workflow.
- Deletion is confirmed, recoverable, attributable, and purge-controlled.
- Administrators can inspect a trustworthy append-only activity history.
- Temporary anonymous read-only access expires and re-locks reliably.
- Search, previews, editing, versions, archives, and background work recover from restart.
- DOE SPARK branding is consistent, accessible, responsive, and distinct from NextExplorer.
- The system passes the verification strategy on the target Windows deployment using non-production data.

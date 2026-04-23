# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

This project dogfoods itself: we use GitHuman to review GitHuman changes.

- **Tasks are tracked in GitHuman's todo feature**, not external tools - check `githuman todo list` for pending work
- **Ask the user to review changes in GitHuman** before committing - staging can be done directly in the GitHuman UI

## Test-Driven Development (REQUIRED)

All changes and additions to this codebase MUST follow the red-green-refactor cycle:

1. **Red:** Write a failing test that asserts the desired behavior. Run the test and confirm it fails for the expected reason. If the test passes immediately, your hypothesis about what's missing is wrong — stop and reassess.
2. **Green:** Write the minimum implementation to make the test pass. Run the test and confirm it passes.
3. **Refactor:** Clean up the implementation while keeping tests green. Run the tests again after refactoring.

This is not optional. Do not write implementation code before a failing test exists. Do not skip the "confirm it fails" step — a test that never failed proves nothing.

**Running tests:**
```bash
npm test                 # Run all tests (server + cli + web)
npm run test:server      # Run server tests only
npm run test:cli         # Run CLI tests only
npm run test:web         # Run web tests (vitest)
npm run test:e2e         # Run Playwright e2e tests

# Run a single test file
node --test tests/server/routes/todos.test.ts
node --test 'tests/server/**/*.test.ts'  # Pattern match
```

Always run `npm test` before committing and fix any failures before proceeding.

## Critical Warnings

**NEVER delete or lose the `.githuman/` directory.** This directory contains:
- `reviews.db` - SQLite database with all reviews, comments, and todos
- This data is NOT tracked by git and cannot be recovered if deleted

When renaming or refactoring the project:
- Always migrate the database file to the new location
- Never assume the old data directory can be recreated

## TypeScript

This project uses Node.js native TypeScript support (type stripping). **Never use tsx** - always run TypeScript files directly with `node`:

```bash
# Correct
node scripts/screenshots.ts
node src/cli/index.ts serve

# Wrong - do NOT use tsx
tsx scripts/screenshots.ts  # NO!
```

## Build and Development Commands

```bash
# Development
npm run dev              # Start Vite dev server (frontend only, uses API proxy)
npm run dev:server       # Start backend in watch mode with --no-open

# Build
npm run build            # Build both server and web
npm run build:server     # Build server only (tsc)
npm run build:web        # Build web only (vite)

# Type checking
npm run typecheck        # Check both server and web
npm run typecheck:server # Server only
npm run typecheck:web    # Web only

# Linting
npm run lint
```

## Architecture Overview

### Three-Layer Backend

The server follows a layered architecture:

1. **Routes** (`src/server/routes/`) - HTTP endpoints with TypeBox schemas for OpenAPI validation
2. **Services** (`src/server/services/`) - Business logic, orchestrates repositories
3. **Repositories** (`src/server/repositories/`) - Direct database access using `node:sqlite` synchronous API

All business logic belongs in the service layer. Routes should delegate to services, not call repositories directly or contain business logic like UUID generation or default values.

### Ports and Adapters

Side effects are abstracted behind SPI ports defined in `src/server/ports.ts`:

- **`Clock`** (`() => string`) — injected into all repositories for timestamps. Default: `systemClock` (ISO string).
- **`IdGenerator`** (`() => string`) — injected into services and `TodoRepository` for UUID generation. Default: `systemIdGenerator`.
- **`EventBus`** — pub/sub interface for SSE broadcasting. Adapter in `src/server/adapters/event-bus.ts` uses Node.js `EventEmitter`.
- **`GitPort`** — abstraction over git CLI commands (diff, status, show, add, reset, branch, remotes). Adapter in `src/server/adapters/git.ts` wraps `execFile('git', ...)`.
- **`ChangeDetector`** — file watcher interface for detecting staged/unstaged changes. Adapter in `src/server/adapters/change-detector.ts`.

When adding new infrastructure dependencies, define a port in `ports.ts` and an adapter in `src/server/adapters/` rather than importing the dependency directly in domain code. In tests, inject fakes:

```typescript
const fakeClock = () => '2025-01-01T00:00:00.000Z'
const fakeId = () => 'test-id-123'
const repo = new ReviewRepository(db, fakeClock)
```

### Plugins

- `src/server/plugins/auth.ts` - Bearer token authentication (optional, for non-localhost access)
- `src/server/plugins/services.ts` - Service factory plugin, centralizes construction of services and repositories

The `ServiceFactories` interface on the Fastify instance provides per-request service construction. Routes access services via `fastify.services.review(request.log)`, `fastify.services.comment()`, etc. The `request.log` parameter propagates request-scoped logging to services that shell out to git.

### Services

Beyond the basic CRUD services (`ReviewService`, `CommentService`, `ExportService`, `GitService`), the service layer includes extracted pure-function modules:

- `src/server/services/diff.service.ts` - Unified diff parser (stateless, pure functions)
- `src/server/services/hunk-resolver.ts` - Lazy-loads hunks per file from stored data or git
- `src/server/services/review-shaping.ts` - Pure functions for transforming review data into API response shapes
- `src/server/services/snapshot.ts` - Review snapshot construction utilities

### Repositories

- `src/server/repositories/review.repo.ts` - Review CRUD
- `src/server/repositories/comment.repo.ts` - Comment CRUD with batch operations
- `src/server/repositories/review-file.repo.ts` - Per-file diff/hunk storage for lazy loading
- `src/server/repositories/todo.repo.ts` - Todo CRUD with position-based ordering

### Security

- `src/server/security/brute-force.ts` - Rate limiting on auth attempts
- `src/server/tls/certificates.ts` - Self-signed certificate generation for HTTPS
- Path traversal prevention in `GitService`
- Helmet security headers configured in `app.ts`

### Dependency Policy

Minimize npm dependencies. Prefer Node.js stdlib or small inline implementations over third-party packages. When evaluating a dependency, the security argument (smaller supply-chain surface) outweighs convenience. If a package is used in 1-2 files with a thin API surface, replace it. Infrastructure dependencies should be behind SPI ports so they can be swapped without touching domain code.

### Database

Uses Node.js native SQLite (`node:sqlite` - requires Node 24+):
- Synchronous API via `DatabaseSync`
- Migrations in `src/server/db/migrations.ts`
- In-memory databases for testing via `createTestDatabase()`
- `initDatabase(path)` is a pure factory — no global state. Callers pass the returned `DatabaseSync` instance explicitly via `AppOptions.db`.

### Shared Types

`src/shared/types.ts` contains TypeScript interfaces shared between server and web client. These are the source of truth for data shapes. Union types used in multiple places should be extracted as named type aliases (e.g., `FileChangeType`, `LineType`, `ReviewSourceType`). When fields are conditionally required together, prefer discriminated unions over independently optional fields — see `ReviewSource` for the pattern.

### TypeBox Schemas

Routes define TypeBox schemas for OpenAPI documentation and runtime validation. Shared schemas live in `src/server/schemas/` (`common.ts`, `diff.ts`, `review.ts`). Prefer importing shared schemas over defining duplicates in route files.

### Routes

- `src/server/routes/reviews.ts` - Review CRUD and stats
- `src/server/routes/comments.ts` - Comment CRUD with resolve/unresolve
- `src/server/routes/todos.ts` - Todo CRUD with position reordering
- `src/server/routes/diff.ts` - File list, per-file hunks (lazy loading), file content at ref, image serving
- `src/server/routes/git.ts` - Repository info, branches, file listing, commit history
- `src/server/routes/events.ts` - SSE endpoint for realtime updates (todos, reviews, comments, files)

### CLI Structure

- `src/cli/index.ts` - Entry point, command dispatcher
- `src/cli/commands/` - Individual commands (serve, list, export, todo, resolve, status)
- Uses `parseArgs` from `node:util` for argument parsing

### Frontend

React 19 SPA with:
- Vite for bundling
- TailwindCSS v4 for styling
- React Router for navigation
- API calls to `/api/*` endpoints

### Configuration

`src/server/config.ts` defines `ServerConfig` — port (default 3847), host, auth token, repository path (auto-detected from git root), DB path, HTTPS settings. HTTPS is auto-enabled for non-localhost hosts.

## Environment Variables

- `GITHUMAN_TOKEN` - Auth token for API access (optional)
- `GITHUMAN_DB_PATH` - Custom database path (default: `.githuman/reviews.db`)

## Testing Patterns

### Server tests

Server tests use Node.js native test runner with in-memory SQLite. Repositories accept `DatabaseSync` and an optional `Clock` via constructor; services accept repositories and an optional `IdGenerator`. Inject fakes for deterministic assertions:

```typescript
import { createTestDatabase } from '../../src/server/db/index.ts';
const db = createTestDatabase();
const fakeClock = () => '2025-01-01T00:00:00.000Z'
const repo = new SomeRepository(db, fakeClock);
```

Route tests use Fastify's `inject()` for in-process HTTP testing. Always close Fastify apps in an `after()` hook, never inline:

```typescript
// Correct
after(async () => {
  await app.close()
})

// Wrong - don't close inline in tests
await app.close() // NO!
```

Route tests should use `beforeEach`/`afterEach` to create a fresh app and database per test case, ensuring isolation between tests.

Shared test helpers live in `tests/server/helpers.ts` (e.g., `TEST_TOKEN`, `authHeader()`).

### Web tests

Web tests use Vitest with Testing Library (`tests/web/`). Component tests are in `tests/web/components/`, hook tests in `tests/web/hooks/`, and API client tests in `tests/web/api/`.

### E2E tests

Playwright tests live in `tests/e2e/`. Run with `npm run test:e2e`.

## Documentation

### Screenshots

To update screenshots for the README and website, run:

```bash
node scripts/screenshots.ts
```

This captures screenshots of the home page and staged changes page to `docs/screenshots/` and copies them to `website/` for the landing page.

### Website

The `website/` folder contains the GitHub Pages landing page (`index.html`). It's a standalone static page that describes the project.

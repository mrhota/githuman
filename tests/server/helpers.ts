/**
 * Shared test helpers for server tests
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type { EventBus, EventType, GitPort, GitStatusResult } from '../../src/server/ports.ts'
import type { Review, Comment, Todo } from '../../src/shared/types.ts'

// A test token that meets the 32-character minimum requirement
export const TEST_TOKEN = 'test-secret-token-32-chars-min!!'

// Auth header for use in requests
export function authHeader (token: string = TEST_TOKEN) {
  return { authorization: `Bearer ${token}` }
}

/**
 * Minimal subset of node:test TestContext used by helpers that register
 * cleanup via `t.after`. Avoids re-declaring this shape in each test file.
 */
export interface TestContext {
  after: (fn: () => void | Promise<void>) => void;
}

export interface CreateTestRepoOptions {
  /** Include an initial commit (README.md). Default: true. */
  initialCommit?: boolean
  /** Files to write and stage after the initial commit. Keyed by relative path. */
  files?: Record<string, string>
  /** Prefix for the tmp directory name. Default: 'githuman-test-'. */
  prefix?: string
}

/**
 * Create a temporary git repository with deterministic config.
 * Registers cleanup via `t.after()`; returns the absolute path.
 */
export function createTestRepo (t: TestContext, opts: CreateTestRepoOptions = {}): string {
  const { initialCommit = true, files, prefix = 'githuman-test-' } = opts
  const tempDir = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(tempDir, { recursive: true, force: true }))

  execSync('git init', { cwd: tempDir, stdio: 'ignore' })
  execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' })
  execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' })

  if (initialCommit) {
    writeFileSync(join(tempDir, 'README.md'), '# Test\n')
    execSync('git add README.md', { cwd: tempDir, stdio: 'ignore' })
    execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'ignore' })
  }

  if (files) {
    for (const [path, content] of Object.entries(files)) {
      writeFileSync(join(tempDir, path), content)
    }
    execSync('git add -A', { cwd: tempDir, stdio: 'ignore' })
  }

  return tempDir
}

const emptyStatus: GitStatusResult = {
  staged: [],
  modified: [],
  created: [],
  deleted: [],
  renamed: [],
  notAdded: [],
}

export function createFakeGitPort (overrides: Partial<GitPort> = {}): GitPort {
  return {
    revparse: async () => '',
    status: async () => emptyStatus,
    diff: async () => '',
    show: async () => '',
    showBinary: async () => Buffer.alloc(0),
    add: async () => {},
    reset: async () => {},
    branch: async () => '',
    getRemotes: async () => [],
    getConfigValue: async () => null,
    raw: async () => '',
    statusPorcelain: async () => '',
    ...overrides,
  }
}

/**
 * A fake EventBus that captures emitted events for assertions.
 * Returns both the array (live reference) and the bus implementation.
 */
export interface FakeEventBus {
  events: Array<{ type: EventType; data: unknown }>
  bus: EventBus
}

export function createFakeEventBus (): FakeEventBus {
  const events: Array<{ type: EventType; data: unknown }> = []
  return {
    events,
    bus: {
      async emit (type: EventType, data?: unknown) { events.push({ type, data }) },
      on () {},
      removeListener () {},
      async close () {},
    },
  }
}

// ---------------------------------------------------------------------------
// Data factories
// ---------------------------------------------------------------------------

type ReviewInput = Omit<Review, 'createdAt' | 'updatedAt'>

const DEFAULT_SNAPSHOT = JSON.stringify({
  repository: { name: 'test', branch: 'main', remote: null, path: '/tmp/test-repo' },
  version: 2,
})

export function buildReviewInput (overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    id: 'test-review-1',
    repositoryPath: '/tmp/test-repo',
    baseRef: 'abc123',
    sourceType: 'staged',
    sourceRef: null,
    snapshotData: DEFAULT_SNAPSHOT,
    status: 'in_progress',
    ...overrides,
  }
}

type CommentInput = Omit<Comment, 'createdAt' | 'updatedAt'>

export function buildCommentInput (overrides: Partial<CommentInput> = {}): CommentInput {
  return {
    id: 'test-comment-1',
    reviewId: 'test-review-1',
    filePath: 'src/index.ts',
    lineNumber: 1,
    lineType: 'added',
    content: 'looks good',
    suggestion: null,
    resolved: false,
    ...overrides,
  }
}

type TodoInput = Omit<Todo, 'createdAt' | 'updatedAt' | 'position'>

export function buildTodoInput (overrides: Partial<TodoInput> = {}): TodoInput {
  return {
    id: 'test-todo-1',
    content: 'test todo',
    completed: false,
    reviewId: null,
    ...overrides,
  }
}

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { join } from 'node:path'
import { createTestRepoWithDb, runCliInProcess } from './test-utils.ts'

const REVIEW_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

async function seedReview (dbPath: string, overrides: {
  id?: string
  status?: string
  createdAt?: string
} = {}) {
  const { initDatabase } = await import('../../src/server/db/index.ts')
  const db = initDatabase(dbPath)

  const id = overrides.id ?? REVIEW_ID
  const now = overrides.createdAt ?? '2025-06-15T10:00:00.000Z'

  db.prepare(`
    INSERT INTO reviews (id, repository_path, base_ref, source_type, source_ref, snapshot_data, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, '/tmp/test', 'abc123', 'staged', null, '{}', overrides.status ?? 'in_progress', now, now)

  db.close()
}

async function seedTodo (dbPath: string, overrides: {
  content?: string
  completed?: boolean
} = {}) {
  const { initDatabase } = await import('../../src/server/db/index.ts')
  const db = initDatabase(dbPath)

  const id = crypto.randomUUID()
  const now = '2025-06-15T10:00:00.000Z'

  db.prepare(`
    INSERT INTO todos (id, content, completed, review_id, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, overrides.content ?? 'test todo', overrides.completed ? 1 : 0, null, 0, now, now)

  db.close()
}

describe('CLI status command', () => {
  it('shows empty state when no reviews or todos exist', async (t) => {
    const tempDir = await createTestRepoWithDb(t)

    const result = await runCliInProcess(['status'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('GitHuman Status'))
    assert.ok(result.stdout.includes('No reviews yet'))
    assert.ok(result.stdout.includes('No todos yet'))
  })

  it('shows counts and suppresses zero-count status lines', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')

    await seedReview(dbPath, { id: 'aaaa-1111', status: 'in_progress' })
    await seedReview(dbPath, { id: 'aaaa-2222', status: 'in_progress' })
    await seedReview(dbPath, { id: 'aaaa-3333', status: 'approved' })
    await seedTodo(dbPath, { content: 'pending task', completed: false })
    await seedTodo(dbPath, { content: 'done task', completed: true })
    await seedTodo(dbPath, { content: 'another pending', completed: false })

    const result = await runCliInProcess(['status'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('Total: 3'))
    assert.ok(result.stdout.includes('In progress: 2'))
    assert.ok(result.stdout.includes('Approved: 1'))
    assert.ok(!result.stdout.includes('Changes requested'))
    assert.ok(result.stdout.includes('Pending: 2'))
    assert.ok(result.stdout.includes('Completed: 1'))
    assert.ok(result.stdout.includes('Run "githuman list" for details'))
    assert.ok(result.stdout.includes('Run "githuman todo list" for details'))
  })

  it('outputs valid JSON with --json flag', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')

    await seedReview(dbPath, { status: 'approved' })
    await seedTodo(dbPath, { completed: false })

    const result = await runCliInProcess(['status', '--json'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    const parsed = JSON.parse(result.stdout)
    assert.deepStrictEqual(parsed, {
      reviews: { total: 1, inProgress: 0, approved: 1, changesRequested: 0 },
      todos: { total: 1, pending: 1, completed: 0 },
    })
  })

  it('outputs zeroed JSON when database is empty', async (t) => {
    const tempDir = await createTestRepoWithDb(t)

    const result = await runCliInProcess(['status', '--json'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    const parsed = JSON.parse(result.stdout)
    assert.deepStrictEqual(parsed, {
      reviews: { total: 0, inProgress: 0, approved: 0, changesRequested: 0 },
      todos: { total: 0, pending: 0, completed: 0 },
    })
  })
})

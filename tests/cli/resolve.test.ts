/**
 * Tests for CLI resolve command - verifying it respects the state machine
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createTestRepoWithDb, runCliInProcess } from './test-utils.ts'

/**
 * Insert a review directly into the database for testing.
 */
async function insertReview (dbPath: string, review: {
  id: string;
  status: string;
  sourceType?: string;
  sourceRef?: string | null;
}) {
  const { initDatabase, closeDatabase } = await import('../../src/server/db/index.ts')
  const db = initDatabase(dbPath)

  const now = new Date().toISOString()
  const snapshotData = JSON.stringify({
    repository: { name: 'test', branch: 'main', path: '/tmp/test' },
    version: 2,
  })

  db.prepare(`
    INSERT INTO reviews (id, repository_path, base_ref, source_type, source_ref, snapshot_data, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    review.id,
    '/tmp/test',
    null,
    review.sourceType ?? 'staged',
    review.sourceRef ?? null,
    snapshotData,
    review.status,
    now,
    now
  )

  closeDatabase()
}

/**
 * Insert a comment for a review.
 */
async function insertComment (dbPath: string, comment: {
  id: string;
  reviewId: string;
  resolved?: boolean;
}) {
  const { initDatabase, closeDatabase } = await import('../../src/server/db/index.ts')
  const db = initDatabase(dbPath)

  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO comments (id, review_id, file_path, line_number, line_type, content, suggestion, resolved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    comment.id,
    comment.reviewId,
    'test.ts',
    1,
    'added',
    'test comment',
    null,
    comment.resolved ? 1 : 0,
    now,
    now
  )

  closeDatabase()
}

describe('CLI resolve command - state machine enforcement', () => {
  it('should reject resolving an already approved review', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')
    const reviewId = randomUUID()

    await insertReview(dbPath, { id: reviewId, status: 'approved' })

    const result = await runCliInProcess(['resolve', reviewId], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 1)
    assert.ok(
      result.stderr.includes('Invalid status transition') ||
      result.stderr.includes('invalid') ||
      result.stderr.includes('Cannot'),
      `Expected error about invalid transition, got: ${result.stderr}`
    )
  })

  it('should successfully resolve an in_progress review', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')
    const reviewId = randomUUID()

    await insertReview(dbPath, { id: reviewId, status: 'in_progress' })

    const result = await runCliInProcess(['resolve', reviewId], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('in_progress'))
    assert.ok(result.stdout.includes('approved'))
  })

  it('should successfully resolve a changes_requested review', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')
    const reviewId = randomUUID()

    await insertReview(dbPath, { id: reviewId, status: 'changes_requested' })

    const result = await runCliInProcess(['resolve', reviewId], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('changes_requested'))
    assert.ok(result.stdout.includes('approved'))
  })

  it('should resolve all unresolved comments when resolving', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')
    const reviewId = randomUUID()

    await insertReview(dbPath, { id: reviewId, status: 'in_progress' })
    await insertComment(dbPath, { id: randomUUID(), reviewId, resolved: false })
    await insertComment(dbPath, { id: randomUUID(), reviewId, resolved: false })
    await insertComment(dbPath, { id: randomUUID(), reviewId, resolved: true })

    const result = await runCliInProcess(['resolve', reviewId, '--json'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    const data = JSON.parse(result.stdout)
    assert.strictEqual(data.commentsResolved, 2)
    assert.strictEqual(data.commentsAlreadyResolved, 1)
  })

  it('should resolve "last" review using repository method', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')
    const oldId = randomUUID()
    const newId = randomUUID()

    // Insert older review first (approved - terminal)
    await insertReview(dbPath, { id: oldId, status: 'approved' })
    // Insert newer review (in_progress)
    await insertReview(dbPath, { id: newId, status: 'in_progress' })

    const result = await runCliInProcess(['resolve', 'last'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('approved'))
  })
})

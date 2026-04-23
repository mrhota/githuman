import { describe, it } from 'node:test'
import assert from 'node:assert'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createTestRepoWithDb, runCliInProcess } from './test-utils.ts'

const REVIEW_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function snapshotV2 () {
  return JSON.stringify({
    repository: { name: 'test-repo', branch: 'main', path: '/tmp/test' },
    version: 2,
  })
}

function hunksJson () {
  return JSON.stringify([{
    header: '@@ -1,3 +1,4 @@',
    oldStart: 1,
    oldCount: 3,
    newStart: 1,
    newCount: 4,
    lines: [
      { type: 'context', content: 'line one', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'added', content: 'new line', oldLineNumber: null, newLineNumber: 2 },
      { type: 'context', content: 'line two', oldLineNumber: 2, newLineNumber: 3 },
      { type: 'context', content: 'line three', oldLineNumber: 3, newLineNumber: 4 },
    ],
  }])
}

async function seedReview (dbPath: string, overrides: {
  id?: string
  status?: string
  sourceType?: string
  sourceRef?: string | null
  createdAt?: string
} = {}) {
  const { initDatabase } = await import('../../src/server/db/index.ts')
  const db = initDatabase(dbPath)

  const id = overrides.id ?? REVIEW_ID
  const now = overrides.createdAt ?? '2025-06-15T10:00:00.000Z'

  db.prepare(`
    INSERT INTO reviews (id, repository_path, base_ref, source_type, source_ref, snapshot_data, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    '/tmp/test',
    'abc123',
    overrides.sourceType ?? 'staged',
    overrides.sourceRef ?? null,
    snapshotV2(),
    overrides.status ?? 'in_progress',
    now,
    now
  )

  db.close()
}

async function seedReviewFile (dbPath: string, reviewId: string, file: {
  filePath: string
  changeType?: string
  additions?: number
  deletions?: number
  hunksData?: string | null
}) {
  const { initDatabase } = await import('../../src/server/db/index.ts')
  const db = initDatabase(dbPath)

  db.prepare(`
    INSERT INTO review_files (id, review_id, file_path, old_path, status, additions, deletions, hunks_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    reviewId,
    file.filePath,
    null,
    file.changeType ?? 'modified',
    file.additions ?? 5,
    file.deletions ?? 2,
    file.hunksData ?? null,
    '2025-06-15T10:00:00.000Z'
  )

  db.close()
}

async function seedComment (dbPath: string, comment: {
  reviewId: string
  filePath?: string
  lineNumber?: number
  lineType?: string
  content?: string
  suggestion?: string | null
  resolved?: boolean
}) {
  const { initDatabase } = await import('../../src/server/db/index.ts')
  const db = initDatabase(dbPath)

  db.prepare(`
    INSERT INTO comments (id, review_id, file_path, line_number, line_type, content, suggestion, resolved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    comment.reviewId,
    comment.filePath ?? 'src/app.ts',
    comment.lineNumber ?? 1,
    comment.lineType ?? 'added',
    comment.content ?? 'test comment',
    comment.suggestion ?? null,
    comment.resolved ? 1 : 0,
    '2025-06-15T10:00:00.000Z',
    '2025-06-15T10:00:00.000Z'
  )

  db.close()
}

describe('CLI export command', () => {
  it('exports review to stdout by default', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')

    await seedReview(dbPath)
    await seedReviewFile(dbPath, REVIEW_ID, { filePath: 'src/app.ts', additions: 3, deletions: 1 })
    await seedComment(dbPath, { reviewId: REVIEW_ID, content: 'Looks good' })

    const result = await runCliInProcess(['export', REVIEW_ID], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('# Code Review: Staged changes'))
    assert.ok(result.stdout.includes('test-repo'))
    assert.ok(result.stdout.includes('Looks good'))
    assert.ok(result.stdout.includes('src/app.ts'))
  })

  it('writes to file with --output flag', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')
    const outputPath = join(tempDir, 'export.md')

    await seedReview(dbPath)
    await seedReviewFile(dbPath, REVIEW_ID, { filePath: 'src/app.ts' })

    const result = await runCliInProcess(['export', REVIEW_ID, '--output', outputPath], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes(`Exported to ${outputPath}`))
    const fileContent = readFileSync(outputPath, 'utf-8')
    assert.ok(fileContent.includes('# Code Review: Staged changes'))
  })

  it('excludes resolved comments with --no-resolved', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')

    await seedReview(dbPath)
    await seedReviewFile(dbPath, REVIEW_ID, { filePath: 'src/app.ts' })
    await seedComment(dbPath, { reviewId: REVIEW_ID, content: 'unresolved issue', resolved: false })
    await seedComment(dbPath, { reviewId: REVIEW_ID, content: 'already fixed', resolved: true })

    const result = await runCliInProcess(['export', REVIEW_ID, '--no-resolved'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('unresolved issue'))
    assert.ok(!result.stdout.includes('already fixed'))
  })

  it('excludes diff snippets with --no-snippets', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')

    await seedReview(dbPath)
    await seedReviewFile(dbPath, REVIEW_ID, {
      filePath: 'src/app.ts',
      hunksData: hunksJson(),
    })
    await seedComment(dbPath, {
      reviewId: REVIEW_ID,
      filePath: 'src/app.ts',
      lineNumber: 2,
      lineType: 'added',
      content: 'needs refactor',
    })

    const withSnippets = await runCliInProcess(['export', REVIEW_ID], { cwd: tempDir })
    assert.ok(withSnippets.stdout.includes('```diff'))

    const withoutSnippets = await runCliInProcess(['export', REVIEW_ID, '--no-snippets'], { cwd: tempDir })
    assert.ok(!withoutSnippets.stdout.includes('```diff'))
    assert.ok(withoutSnippets.stdout.includes('needs refactor'))
  })

  it('resolves "last" to most recent review', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')
    const oldId = randomUUID()
    const newId = randomUUID()

    await seedReview(dbPath, { id: oldId, createdAt: '2025-01-01T00:00:00.000Z' })
    await seedReviewFile(dbPath, oldId, { filePath: 'old.ts' })
    await seedReview(dbPath, { id: newId, createdAt: '2025-06-15T00:00:00.000Z' })
    await seedReviewFile(dbPath, newId, { filePath: 'new.ts' })

    const result = await runCliInProcess(['export', 'last'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('new.ts'))
  })

  it('errors on nonexistent review ID', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const bogusId = randomUUID()

    const result = await runCliInProcess(['export', bogusId], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 1)
    assert.ok(result.stderr.includes('Review not found'))
  })

  it('errors with ENOENT when output directory missing', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')

    await seedReview(dbPath)
    await seedReviewFile(dbPath, REVIEW_ID, { filePath: 'src/app.ts' })

    const badOutput = join(tempDir, 'nonexistent-dir', 'export.md')
    const result = await runCliInProcess(['export', REVIEW_ID, '--output', badOutput], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 1)
    assert.ok(result.stderr.includes('Database does not exist'))
  })

  it('errors when review-id not provided', async (t) => {
    const tempDir = await createTestRepoWithDb(t)

    const result = await runCliInProcess(['export'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 1)
    assert.ok(result.stderr.includes('review-id is required'))
  })

  it('shows changes summary with file counts', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')

    await seedReview(dbPath)
    await seedReviewFile(dbPath, REVIEW_ID, { filePath: 'src/new.ts', changeType: 'added', additions: 10, deletions: 0 })
    await seedReviewFile(dbPath, REVIEW_ID, { filePath: 'src/old.ts', changeType: 'modified', additions: 3, deletions: 2 })

    const result = await runCliInProcess(['export', REVIEW_ID], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('**2** files changed'))
    assert.ok(result.stdout.includes('+13'))
    assert.ok(result.stdout.includes('-2'))
    assert.ok(result.stdout.includes('1 files added'))
    assert.ok(result.stdout.includes('1 files modified'))
  })

  it('"last" errors when no reviews exist', async (t) => {
    const tempDir = await createTestRepoWithDb(t)

    const result = await runCliInProcess(['export', 'last'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 1)
    assert.ok(result.stderr.includes('No reviews found'))
  })
})

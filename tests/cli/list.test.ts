/**
 * Tests for CLI list command - verifying it uses repository layer
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createTestRepoWithDb } from './test-utils.ts'

const CLI_PATH = join(import.meta.dirname, '../../src/cli/index.ts')

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runCli (args: string[], options?: { cwd?: string }): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env },
      cwd: options?.cwd,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode })
    })
  })
}

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

describe('CLI list command', () => {
  it('should list reviews from database', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')

    await insertReview(dbPath, {
      id: randomUUID(),
      status: 'in_progress',
      sourceType: 'staged',
    })
    await insertReview(dbPath, {
      id: randomUUID(),
      status: 'approved',
      sourceType: 'branch',
      sourceRef: 'feature-branch',
    })

    const result = await runCli(['list'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('Staged changes'))
    assert.ok(result.stdout.includes('Branch: feature-branch'))
  })

  it('should filter by status', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')

    await insertReview(dbPath, {
      id: randomUUID(),
      status: 'in_progress',
      sourceType: 'staged',
    })
    await insertReview(dbPath, {
      id: randomUUID(),
      status: 'approved',
      sourceType: 'branch',
      sourceRef: 'feature-branch',
    })

    const result = await runCli(['list', '--status', 'approved'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('Branch: feature-branch'))
    assert.ok(!result.stdout.includes('Staged changes'))
  })

  it('should output JSON format', async (t) => {
    const tempDir = await createTestRepoWithDb(t)
    const dbPath = join(tempDir, '.githuman', 'reviews.db')
    const reviewId = randomUUID()

    await insertReview(dbPath, {
      id: reviewId,
      status: 'in_progress',
      sourceType: 'staged',
    })

    const result = await runCli(['list', '--json'], { cwd: tempDir })

    assert.strictEqual(result.exitCode, 0)
    const data = JSON.parse(result.stdout)
    assert.ok(Array.isArray(data))
    assert.strictEqual(data.length, 1)
    assert.strictEqual(data[0].id, reviewId)
  })
})

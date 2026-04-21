import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildApp } from '../../../src/server/app.ts'
import { createConfig } from '../../../src/server/config.ts'
import { initDatabase, closeDatabase } from '../../../src/server/db/index.ts'
import type { FastifyInstance } from 'fastify'
import { TEST_TOKEN, authHeader } from '../helpers.ts'

/**
 * Create a temporary git repository with no staged changes
 */
function createTempGitRepo (): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'))
  execSync('git init', { cwd: tempDir, stdio: 'ignore' })
  execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' })
  execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' })
  fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test')
  execSync('git add .', { cwd: tempDir, stdio: 'ignore' })
  execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'ignore' })
  return tempDir
}

/**
 * Create a temporary git repository WITH staged changes
 */
function createTempGitRepoWithStagedChanges (): string {
  const tempDir = createTempGitRepo()
  fs.writeFileSync(path.join(tempDir, 'test-file.ts'), 'const x = 1;\n')
  execSync('git add test-file.ts', { cwd: tempDir, stdio: 'ignore' })
  return tempDir
}

interface TestEnv {
  app: FastifyInstance
  testDbDir: string
  testRepoDir: string | null
}

async function buildEnv (opts: { staged?: boolean, nonGit?: boolean, dbPrefix: string }): Promise<TestEnv> {
  const testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), opts.dbPrefix))
  const dbPath = path.join(testDbDir, 'test.db')
  let testRepoDir: string | null = null
  let repositoryPath: string
  if (opts.nonGit) {
    repositoryPath = '/tmp'
  } else {
    testRepoDir = opts.staged ? createTempGitRepoWithStagedChanges() : createTempGitRepo()
    repositoryPath = testRepoDir
  }
  initDatabase(dbPath)
  const config = createConfig({ repositoryPath, dbPath, authToken: TEST_TOKEN })
  const app = await buildApp(config, { logger: false })
  return { app, testDbDir, testRepoDir }
}

async function teardownEnv (env: TestEnv): Promise<void> {
  await env.app.close()
  closeDatabase()
  if (env.testDbDir) fs.rmSync(env.testDbDir, { recursive: true, force: true })
  if (env.testRepoDir) fs.rmSync(env.testRepoDir, { recursive: true, force: true })
}

describe('review routes', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await buildEnv({ dbPrefix: 'review-test-' })
  })

  afterEach(async () => {
    await teardownEnv(env)
  })

  describe('GET /api/reviews', () => {
    it('should return empty list initially', async () => {
      const response = await env.app.inject({
        method: 'GET',
        url: '/api/reviews',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)

      const body = JSON.parse(response.body)
      assert.ok(Array.isArray(body.reviews))
      assert.strictEqual(body.total, 0)
      assert.strictEqual(body.page, 1)
      assert.strictEqual(body.pageSize, 20)
    })

    it('should support pagination parameters', async () => {
      const response = await env.app.inject({
        method: 'GET',
        url: '/api/reviews?page=2&pageSize=10',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)

      const body = JSON.parse(response.body)
      assert.strictEqual(body.page, 2)
      assert.strictEqual(body.pageSize, 10)
    })
  })

  describe('POST /api/reviews', () => {
    it('should return error when no staged changes', async () => {
      const response = await env.app.inject({
        method: 'POST',
        url: '/api/reviews',
        headers: authHeader(),
        payload: {
          sourceType: 'staged',
        },
      })

      assert.strictEqual(response.statusCode, 400)

      const body = JSON.parse(response.body)
      assert.strictEqual(body.code, 'NO_STAGED_CHANGES')
    })

    it('should work with empty body (defaults to staged)', async () => {
      const response = await env.app.inject({
        method: 'POST',
        url: '/api/reviews',
        headers: authHeader(),
        payload: {},
      })

      assert.strictEqual(response.statusCode, 400)
      const body = JSON.parse(response.body)
      assert.strictEqual(body.code, 'NO_STAGED_CHANGES')
    })
  })

  describe('GET /api/reviews/:id', () => {
    it('should return 404 for non-existent review', async () => {
      const response = await env.app.inject({
        method: 'GET',
        url: '/api/reviews/non-existent-id',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 404)

      const body = JSON.parse(response.body)
      assert.strictEqual(body.error, 'Review not found')
    })
  })

  describe('PATCH /api/reviews/:id', () => {
    it('should return 404 for non-existent review', async () => {
      const response = await env.app.inject({
        method: 'PATCH',
        url: '/api/reviews/non-existent-id',
        headers: authHeader(),
        payload: {
          status: 'approved',
        },
      })

      assert.strictEqual(response.statusCode, 404)

      const body = JSON.parse(response.body)
      assert.strictEqual(body.error, 'Review not found')
    })
  })

  describe('DELETE /api/reviews/:id', () => {
    it('should return 404 for non-existent review', async () => {
      const response = await env.app.inject({
        method: 'DELETE',
        url: '/api/reviews/non-existent-id',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 404)

      const body = JSON.parse(response.body)
      assert.strictEqual(body.error, 'Review not found')
    })

    it('should delete review without Content-Type header', async () => {
      const response = await env.app.inject({
        method: 'DELETE',
        url: '/api/reviews/some-id',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 404)
    })
  })

  describe('GET /api/reviews/stats', () => {
    it('should return stats structure', async () => {
      const response = await env.app.inject({
        method: 'GET',
        url: '/api/reviews/stats',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)

      const body = JSON.parse(response.body)
      assert.ok('total' in body)
      assert.ok('inProgress' in body)
      assert.ok('approved' in body)
      assert.ok('changesRequested' in body)
    })

    it('should return zeros for fresh database', async () => {
      const response = await env.app.inject({
        method: 'GET',
        url: '/api/reviews/stats',
        headers: authHeader(),
      })

      const body = JSON.parse(response.body)
      assert.strictEqual(typeof body.total, 'number')
      assert.strictEqual(typeof body.inProgress, 'number')
      assert.strictEqual(typeof body.approved, 'number')
      assert.strictEqual(typeof body.changesRequested, 'number')
      assert.strictEqual(
        body.inProgress + body.approved + body.changesRequested,
        body.total
      )
    })
  })
})

describe('review routes with staged changes', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await buildEnv({ staged: true, dbPrefix: 'review-test-staged-' })
  })

  afterEach(async () => {
    await teardownEnv(env)
  })

  async function createReview (): Promise<string> {
    const response = await env.app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: authHeader(),
      payload: { sourceType: 'staged' },
    })
    assert.strictEqual(response.statusCode, 201, `Expected 201 but got ${response.statusCode}: ${response.body}`)
    return JSON.parse(response.body).id
  }

  describe('POST /api/reviews', () => {
    it('should create a review from staged changes', async () => {
      const response = await env.app.inject({
        method: 'POST',
        url: '/api/reviews',
        headers: authHeader(),
        payload: { sourceType: 'staged' },
      })

      assert.strictEqual(response.statusCode, 201, `Expected 201 but got ${response.statusCode}: ${response.body}`)

      const body = JSON.parse(response.body)
      assert.ok(body.id, `id should be present. Got keys: ${Object.keys(body).join(', ')}`)
      assert.strictEqual(body.status, 'in_progress')
      assert.ok(Array.isArray(body.files), `files should be an array. Got: ${typeof body.files}`)
      assert.ok(body.files.length > 0, `files should have at least one item. Got: ${body.files?.length}`)
      assert.ok(body.summary, `summary should be present. Got keys: ${Object.keys(body).join(', ')}`)
    })
  })

  describe('review CRUD operations', () => {
    it('should create a review and get it by ID', async () => {
      const reviewId = await createReview()

      const getResponse = await env.app.inject({
        method: 'GET',
        url: `/api/reviews/${reviewId}`,
        headers: authHeader(),
      })

      assert.strictEqual(getResponse.statusCode, 200)
      const body = JSON.parse(getResponse.body)
      assert.strictEqual(body.id, reviewId)
      assert.ok(Array.isArray(body.files))
      assert.ok(body.summary)
    })

    it('should update review status to changes_requested', async () => {
      const reviewId = await createReview()

      const response = await env.app.inject({
        method: 'PATCH',
        url: `/api/reviews/${reviewId}`,
        headers: authHeader(),
        payload: { status: 'changes_requested' },
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.strictEqual(body.status, 'changes_requested')
    })

    it('should export review as markdown', async () => {
      const reviewId = await createReview()

      await env.app.inject({
        method: 'PATCH',
        url: `/api/reviews/${reviewId}`,
        headers: authHeader(),
        payload: { status: 'changes_requested' },
      })

      const response = await env.app.inject({
        method: 'GET',
        url: `/api/reviews/${reviewId}/export`,
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const markdown = response.body
      assert.ok(markdown.includes('# Code Review:'))
      assert.ok(markdown.includes('Changes Requested'))
    })

    it('should update review status to approved', async () => {
      const reviewId = await createReview()

      const response = await env.app.inject({
        method: 'PATCH',
        url: `/api/reviews/${reviewId}`,
        headers: authHeader(),
        payload: { status: 'approved' },
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.strictEqual(body.status, 'approved')
    })

    it('should delete review', async () => {
      const reviewId = await createReview()

      const response = await env.app.inject({
        method: 'DELETE',
        url: `/api/reviews/${reviewId}`,
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.strictEqual(body.success, true)

      const getResponse = await env.app.inject({
        method: 'GET',
        url: `/api/reviews/${reviewId}`,
        headers: authHeader(),
      })
      assert.strictEqual(getResponse.statusCode, 404)
    })
  })

  describe('GET /api/reviews/:id/files/hunks', () => {
    it('should return hunks for a file in a review', async () => {
      const createResponse = await env.app.inject({
        method: 'POST',
        url: '/api/reviews',
        headers: authHeader(),
        payload: { sourceType: 'staged' },
      })
      const created = JSON.parse(createResponse.body)
      const filePath = created.files[0]?.newPath || 'test-file.ts'

      const response = await env.app.inject({
        method: 'GET',
        url: `/api/reviews/${created.id}/files/hunks?path=${encodeURIComponent(filePath)}`,
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.ok(Array.isArray(body.hunks))
      assert.ok(body.hunks.length > 0, 'Should have at least one hunk')
      const hunk = body.hunks[0]
      assert.ok('oldStart' in hunk)
      assert.ok('newStart' in hunk)
      assert.ok('lines' in hunk)
    })

    it('should return 404 for non-existent review', async () => {
      const response = await env.app.inject({
        method: 'GET',
        url: '/api/reviews/non-existent-id/files/hunks?path=test.ts',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 404)
    })

    it('should return empty hunks for non-existent file', async () => {
      const reviewId = await createReview()

      const response = await env.app.inject({
        method: 'GET',
        url: `/api/reviews/${reviewId}/files/hunks?path=non-existent-file.ts`,
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.deepStrictEqual(body.hunks, [])
    })

    it('should handle file paths with slashes', async () => {
      const reviewId = await createReview()

      const response = await env.app.inject({
        method: 'GET',
        url: `/api/reviews/${reviewId}/files/hunks?path=${encodeURIComponent('src/components/Test.tsx')}`,
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.ok(Array.isArray(body.hunks))
    })
  })

  describe('review filtering and pagination', () => {
    it('should filter reviews by status', async () => {
      await createReview()
      const approvedId = await createReview()

      await env.app.inject({
        method: 'PATCH',
        url: `/api/reviews/${approvedId}`,
        headers: authHeader(),
        payload: { status: 'approved' },
      })

      const response = await env.app.inject({
        method: 'GET',
        url: '/api/reviews?status=approved',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      for (const review of body.reviews) {
        assert.strictEqual(review.status, 'approved')
      }
    })

    it('should paginate reviews', async () => {
      const response = await env.app.inject({
        method: 'GET',
        url: '/api/reviews?page=1&pageSize=5',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.strictEqual(body.page, 1)
      assert.strictEqual(body.pageSize, 5)
      assert.ok(body.reviews.length <= 5)
    })
  })
})

describe('review routes with non-git directory', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await buildEnv({ nonGit: true, dbPrefix: 'review-test-nongit-' })
  })

  afterEach(async () => {
    await teardownEnv(env)
  })

  it('should return error when creating review in non-git directory', async () => {
    const response = await env.app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: authHeader(),
      payload: {
        sourceType: 'staged',
      },
    })

    assert.strictEqual(response.statusCode, 400)

    const body = JSON.parse(response.body)
    assert.strictEqual(body.code, 'NOT_GIT_REPO')
  })
})

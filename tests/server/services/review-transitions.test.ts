import { describe, it } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../../src/server/db/index.ts'
import { ReviewRepository } from '../../../src/server/repositories/review.repo.ts'
import { ReviewFileRepository } from '../../../src/server/repositories/review-file.repo.ts'
import { GitService } from '../../../src/server/services/git.service.ts'
import { createGitAdapter } from '../../../src/server/adapters/git.ts'
import type { ReviewStatus } from '../../../src/shared/types.ts'
import { buildReviewInput } from '../helpers.ts'

/**
 * Tests for review status transition validation.
 *
 * State machine:
 *   in_progress → approved
 *   in_progress → changes_requested
 *   changes_requested → in_progress
 *   changes_requested → approved
 *   approved → (terminal — no transitions allowed)
 */

function createReview (repo: ReviewRepository, status: ReviewStatus = 'in_progress'): string {
  const id = randomUUID()
  repo.create(buildReviewInput({ id, status }))
  return id
}

describe('review status transitions', () => {
  // We test at the ReviewService level since that's where validation should live.
  // Import dynamically so the test file loads even if the module has issues.

  async function getService () {
    const db = createTestDatabase()
    const { ReviewService } = await import('../../../src/server/services/review.service.ts')
    return {
      service: new ReviewService(
        new ReviewRepository(db),
        new ReviewFileRepository(db),
        new GitService(createGitAdapter(process.cwd()), process.cwd())
      ),
      db,
    }
  }

  describe('valid transitions', () => {
    it('in_progress → approved', async () => {
      const { service, db } = await getService()
      const repo = new ReviewRepository(db)
      const id = createReview(repo, 'in_progress')

      const result = service.update(id, { status: 'approved' })
      assert.ok(result)
      assert.strictEqual(result.status, 'approved')
    })

    it('in_progress → changes_requested', async () => {
      const { service, db } = await getService()
      const repo = new ReviewRepository(db)
      const id = createReview(repo, 'in_progress')

      const result = service.update(id, { status: 'changes_requested' })
      assert.ok(result)
      assert.strictEqual(result.status, 'changes_requested')
    })

    it('changes_requested → in_progress', async () => {
      const { service, db } = await getService()
      const repo = new ReviewRepository(db)
      const id = createReview(repo, 'changes_requested')

      const result = service.update(id, { status: 'in_progress' })
      assert.ok(result)
      assert.strictEqual(result.status, 'in_progress')
    })

    it('changes_requested → approved', async () => {
      const { service, db } = await getService()
      const repo = new ReviewRepository(db)
      const id = createReview(repo, 'changes_requested')

      const result = service.update(id, { status: 'approved' })
      assert.ok(result)
      assert.strictEqual(result.status, 'approved')
    })
  })

  describe('invalid transitions', () => {
    it('approved → in_progress should throw', async () => {
      const { service, db } = await getService()
      const repo = new ReviewRepository(db)
      const id = createReview(repo, 'approved')

      assert.throws(
        () => service.update(id, { status: 'in_progress' }),
        (err: Error) => {
          assert.ok(err.message.includes('Invalid status transition'))
          return true
        }
      )
    })

    it('approved → changes_requested should throw', async () => {
      const { service, db } = await getService()
      const repo = new ReviewRepository(db)
      const id = createReview(repo, 'approved')

      assert.throws(
        () => service.update(id, { status: 'changes_requested' }),
        (err: Error) => {
          assert.ok(err.message.includes('Invalid status transition'))
          return true
        }
      )
    })

    it('same status transition should be a no-op (not throw)', async () => {
      const { service, db } = await getService()
      const repo = new ReviewRepository(db)
      const id = createReview(repo, 'in_progress')

      const result = service.update(id, { status: 'in_progress' })
      assert.ok(result)
      assert.strictEqual(result.status, 'in_progress')
    })
  })

  describe('update without status change', () => {
    it('should succeed when no status is provided', async () => {
      const { service, db } = await getService()
      const repo = new ReviewRepository(db)
      const id = createReview(repo, 'in_progress')

      const result = service.update(id, {})
      assert.ok(result)
      assert.strictEqual(result.status, 'in_progress')
    })
  })
})

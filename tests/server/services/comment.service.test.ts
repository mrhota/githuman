import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { createTestDatabase } from '../../../src/server/db/index.ts'
import { ReviewRepository } from '../../../src/server/repositories/review.repo.ts'
import { CommentRepository } from '../../../src/server/repositories/comment.repo.ts'
import { CommentService, CommentError } from '../../../src/server/services/comment.service.ts'
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'

function createReview (reviewRepo: ReviewRepository): string {
  const id = randomUUID()
  reviewRepo.create({
    id,
    repositoryPath: '/tmp/test-repo',
    baseRef: 'abc123',
    sourceType: 'staged',
    sourceRef: null,
    snapshotData: JSON.stringify({ repository: { name: 'test', branch: 'main', remote: null, path: '/tmp/test-repo' }, version: 2 }),
    status: 'in_progress',
  })
  return id
}

describe('CommentService', () => {
  let db: DatabaseSync
  let service: CommentService
  let reviewRepo: ReviewRepository
  let reviewId: string

  before(() => {
    db = createTestDatabase()
    reviewRepo = new ReviewRepository(db)
    service = new CommentService(new CommentRepository(db), reviewRepo)
    reviewId = createReview(reviewRepo)
  })

  after(() => {
    db.close()
  })

  describe('create', () => {
    it('should create a comment with all fields', () => {
      const comment = service.create(reviewId, {
        filePath: 'src/index.ts',
        lineNumber: 42,
        lineType: 'added',
        content: 'This looks good',
        suggestion: 'const x = 1',
      })

      assert.ok(comment.id)
      assert.strictEqual(comment.reviewId, reviewId)
      assert.strictEqual(comment.filePath, 'src/index.ts')
      assert.strictEqual(comment.lineNumber, 42)
      assert.strictEqual(comment.lineType, 'added')
      assert.strictEqual(comment.content, 'This looks good')
      assert.strictEqual(comment.suggestion, 'const x = 1')
      assert.strictEqual(comment.resolved, false)
      assert.ok(comment.createdAt)
      assert.ok(comment.updatedAt)
    })

    it('should create a file-level comment (null lineNumber and lineType)', () => {
      const comment = service.create(reviewId, {
        filePath: 'src/index.ts',
        content: 'General comment about this file',
      })

      assert.ok(comment.id)
      assert.strictEqual(comment.lineNumber, null)
      assert.strictEqual(comment.lineType, null)
      assert.strictEqual(comment.suggestion, null)
    })

    it('should throw MISSING_LINE_TYPE when lineNumber provided without lineType', () => {
      assert.throws(
        () => service.create(reviewId, {
          filePath: 'src/index.ts',
          lineNumber: 10,
          content: 'Bad request',
        }),
        (err: unknown) => {
          assert.ok(err instanceof CommentError)
          assert.strictEqual(err.code, 'MISSING_LINE_TYPE')
          return true
        }
      )
    })

    it('should throw REVIEW_NOT_FOUND for nonexistent review', () => {
      assert.throws(
        () => service.create('nonexistent-id', {
          filePath: 'src/index.ts',
          content: 'Orphaned comment',
        }),
        (err: unknown) => {
          assert.ok(err instanceof CommentError)
          assert.strictEqual(err.code, 'REVIEW_NOT_FOUND')
          return true
        }
      )
    })
  })

  describe('getById', () => {
    it('should return a comment by ID', () => {
      const created = service.create(reviewId, {
        filePath: 'src/get.ts',
        content: 'Found it',
      })

      const found = service.getById(created.id)
      assert.ok(found)
      assert.strictEqual(found.id, created.id)
      assert.strictEqual(found.content, 'Found it')
    })

    it('should return null for nonexistent ID', () => {
      const result = service.getById('does-not-exist')
      assert.strictEqual(result, null)
    })
  })

  describe('getByReview', () => {
    it('should return all comments for a review', () => {
      const secondReviewId = createReview(reviewRepo)

      service.create(secondReviewId, { filePath: 'a.ts', content: 'one' })
      service.create(secondReviewId, { filePath: 'b.ts', content: 'two' })
      service.create(secondReviewId, { filePath: 'c.ts', content: 'three' })

      const comments = service.getByReview(secondReviewId)
      assert.strictEqual(comments.length, 3)
    })

    it('should return empty array for review with no comments', () => {
      const emptyReviewId = createReview(reviewRepo)
      const comments = service.getByReview(emptyReviewId)
      assert.deepStrictEqual(comments, [])
    })
  })

  describe('getByFile', () => {
    it('should return comments for a specific file', () => {
      const rid = createReview(reviewRepo)

      service.create(rid, { filePath: 'target.ts', content: 'match' })
      service.create(rid, { filePath: 'target.ts', content: 'also match' })
      service.create(rid, { filePath: 'other.ts', content: 'no match' })

      const comments = service.getByFile(rid, 'target.ts')
      assert.strictEqual(comments.length, 2)
      assert.ok(comments.every(c => c.filePath === 'target.ts'))
    })
  })

  describe('getGroupedByFile', () => {
    it('should group comments by file path', () => {
      const rid = createReview(reviewRepo)

      service.create(rid, { filePath: 'a.ts', content: 'one' })
      service.create(rid, { filePath: 'b.ts', content: 'two' })
      service.create(rid, { filePath: 'a.ts', content: 'three' })

      const grouped = service.getGroupedByFile(rid)
      assert.strictEqual(Object.keys(grouped).length, 2)
      assert.strictEqual(grouped['a.ts'].length, 2)
      assert.strictEqual(grouped['b.ts'].length, 1)
    })

    it('should return empty object for review with no comments', () => {
      const rid = createReview(reviewRepo)
      const grouped = service.getGroupedByFile(rid)
      assert.deepStrictEqual(grouped, {})
    })
  })

  describe('update', () => {
    it('should update comment content', () => {
      const comment = service.create(reviewId, {
        filePath: 'update.ts',
        content: 'original',
      })

      const updated = service.update(comment.id, { content: 'revised' })
      assert.ok(updated)
      assert.strictEqual(updated.content, 'revised')
    })

    it('should update suggestion', () => {
      const comment = service.create(reviewId, {
        filePath: 'update.ts',
        content: 'needs fix',
      })

      const updated = service.update(comment.id, { suggestion: 'const y = 2' })
      assert.ok(updated)
      assert.strictEqual(updated.suggestion, 'const y = 2')
    })

    it('should return null for nonexistent comment', () => {
      const result = service.update('nonexistent', { content: 'nope' })
      assert.strictEqual(result, null)
    })
  })

  describe('resolve / unresolve', () => {
    it('should resolve a comment', () => {
      const comment = service.create(reviewId, {
        filePath: 'resolve.ts',
        content: 'needs resolution',
      })
      assert.strictEqual(comment.resolved, false)

      const resolved = service.resolve(comment.id)
      assert.ok(resolved)
      assert.strictEqual(resolved.resolved, true)
    })

    it('should unresolve a resolved comment', () => {
      const comment = service.create(reviewId, {
        filePath: 'resolve.ts',
        content: 'will toggle',
      })

      service.resolve(comment.id)
      const unresolved = service.unresolve(comment.id)
      assert.ok(unresolved)
      assert.strictEqual(unresolved.resolved, false)
    })

    it('should return null when resolving nonexistent comment', () => {
      assert.strictEqual(service.resolve('nonexistent'), null)
      assert.strictEqual(service.unresolve('nonexistent'), null)
    })
  })

  describe('delete', () => {
    it('should delete a comment', () => {
      const comment = service.create(reviewId, {
        filePath: 'delete.ts',
        content: 'doomed',
      })

      const deleted = service.delete(comment.id)
      assert.strictEqual(deleted, true)
      assert.strictEqual(service.getById(comment.id), null)
    })

    it('should return false for nonexistent comment', () => {
      assert.strictEqual(service.delete('nonexistent'), false)
    })
  })

  describe('deleteByReview', () => {
    it('should delete all comments for a review', () => {
      const rid = createReview(reviewRepo)

      service.create(rid, { filePath: 'a.ts', content: 'one' })
      service.create(rid, { filePath: 'b.ts', content: 'two' })
      service.create(rid, { filePath: 'c.ts', content: 'three' })

      const count = service.deleteByReview(rid)
      assert.strictEqual(count, 3)
      assert.deepStrictEqual(service.getByReview(rid), [])
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const rid = createReview(reviewRepo)

      const c1 = service.create(rid, { filePath: 'a.ts', content: 'comment 1' })
      service.create(rid, { filePath: 'b.ts', content: 'comment 2', suggestion: 'fix this' })
      service.create(rid, { filePath: 'c.ts', content: 'comment 3' })

      service.resolve(c1.id)

      const stats = service.getStats(rid)
      assert.strictEqual(stats.total, 3)
      assert.strictEqual(stats.resolved, 1)
      assert.strictEqual(stats.unresolved, 2)
      assert.strictEqual(stats.withSuggestions, 1)
    })

    it('should return zeros for review with no comments', () => {
      const rid = createReview(reviewRepo)
      const stats = service.getStats(rid)
      assert.deepStrictEqual(stats, { total: 0, resolved: 0, unresolved: 0, withSuggestions: 0 })
    })
  })

  describe('belongsToReview', () => {
    it('should return true when comment belongs to review', () => {
      const comment = service.create(reviewId, {
        filePath: 'belong.ts',
        content: 'mine',
      })

      assert.strictEqual(service.belongsToReview(comment.id, reviewId), true)
    })

    it('should return false when comment belongs to different review', () => {
      const otherReviewId = createReview(reviewRepo)
      const comment = service.create(reviewId, {
        filePath: 'belong.ts',
        content: 'not yours',
      })

      assert.strictEqual(service.belongsToReview(comment.id, otherReviewId), false)
    })

    it('should return false for nonexistent comment', () => {
      assert.strictEqual(service.belongsToReview('nonexistent', reviewId), false)
    })
  })
})

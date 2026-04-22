import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import type { DatabaseSync } from 'node:sqlite'
import { CommentRepository } from '../../../src/server/repositories/comment.repo.ts'
import { ReviewRepository } from '../../../src/server/repositories/review.repo.ts'
import { createTestDatabase } from '../../../src/server/db/index.ts'
import { buildReviewInput, buildCommentInput } from '../helpers.ts'

describe('CommentRepository', () => {
  let db: DatabaseSync
  let repo: CommentRepository
  let reviewRepo: ReviewRepository
  let testReviewId: string

  beforeEach(() => {
    db = createTestDatabase()
    repo = new CommentRepository(db)
    reviewRepo = new ReviewRepository(db)

    const review = reviewRepo.create(buildReviewInput({
      repositoryPath: '/test/path',
      snapshotData: '{}',
    }))
    testReviewId = review.id
  })

  afterEach(() => {
    db?.close()
  })

  describe('create', () => {
    it('should create a comment and return it', () => {
      const comment = repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Great change!',
      }))

      assert.strictEqual(comment.id, 'comment-1')
      assert.strictEqual(comment.reviewId, testReviewId)
      assert.strictEqual(comment.filePath, 'src/index.ts')
      assert.strictEqual(comment.lineNumber, 10)
      assert.strictEqual(comment.lineType, 'added')
      assert.strictEqual(comment.content, 'Great change!')
      assert.strictEqual(comment.suggestion, null)
      assert.strictEqual(comment.resolved, false)
      assert.ok(comment.createdAt)
      assert.ok(comment.updatedAt)
    })

    it('should create a file-level comment with null line number', () => {
      const comment = repo.create(buildCommentInput({
        id: 'comment-2',
        reviewId: testReviewId,
        lineNumber: null,
        lineType: null,
        content: 'File-level comment',
      }))

      assert.strictEqual(comment.lineNumber, null)
      assert.strictEqual(comment.lineType, null)
    })

    it('should create a comment with a suggestion', () => {
      const comment = repo.create(buildCommentInput({
        id: 'comment-3',
        reviewId: testReviewId,
        lineNumber: 5,
        lineType: 'context',
        content: 'Consider this change',
        suggestion: 'const x = 1;',
      }))

      assert.strictEqual(comment.suggestion, 'const x = 1;')
    })
  })

  describe('findById', () => {
    it('should return a comment by id', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Test comment',
      }))

      const found = repo.findById('comment-1')
      assert.ok(found)
      assert.strictEqual(found.id, 'comment-1')
    })

    it('should return null for non-existent id', () => {
      const found = repo.findById('non-existent')
      assert.strictEqual(found, null)
    })
  })

  describe('findByReview', () => {
    it('should return all comments for a review', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        filePath: 'src/a.ts',
        content: 'Comment 1',
      }))
      repo.create(buildCommentInput({
        id: 'comment-2',
        reviewId: testReviewId,
        filePath: 'src/b.ts',
        lineNumber: 2,
        lineType: 'removed',
        content: 'Comment 2',
      }))

      const comments = repo.findByReview(testReviewId)
      assert.strictEqual(comments.length, 2)
    })

    it('should return empty array for review with no comments', () => {
      const comments = repo.findByReview(testReviewId)
      assert.strictEqual(comments.length, 0)
    })
  })

  describe('findByFile', () => {
    it('should return comments for a specific file', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        filePath: 'src/a.ts',
        content: 'Comment 1',
      }))
      repo.create(buildCommentInput({
        id: 'comment-2',
        reviewId: testReviewId,
        filePath: 'src/b.ts',
        lineNumber: 2,
        lineType: 'removed',
        content: 'Comment 2',
      }))

      const comments = repo.findByFile(testReviewId, 'src/a.ts')
      assert.strictEqual(comments.length, 1)
      assert.strictEqual(comments[0].filePath, 'src/a.ts')
    })
  })

  describe('update', () => {
    it('should update comment content', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Original content',
      }))

      const updated = repo.update('comment-1', { content: 'Updated content' })
      assert.ok(updated)
      assert.strictEqual(updated.content, 'Updated content')
    })

    it('should update suggestion', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Comment',
      }))

      const updated = repo.update('comment-1', { suggestion: 'new code' })
      assert.ok(updated)
      assert.strictEqual(updated.suggestion, 'new code')
    })

    it('should return null for non-existent id', () => {
      const updated = repo.update('non-existent', { content: 'test' })
      assert.strictEqual(updated, null)
    })
  })

  describe('setResolved', () => {
    it('should mark comment as resolved', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Comment',
      }))

      const resolved = repo.setResolved('comment-1', true)
      assert.ok(resolved)
      assert.strictEqual(resolved.resolved, true)
    })

    it('should mark comment as unresolved', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Comment',
        resolved: true,
      }))

      const unresolved = repo.setResolved('comment-1', false)
      assert.ok(unresolved)
      assert.strictEqual(unresolved.resolved, false)
    })
  })

  describe('delete', () => {
    it('should delete a comment', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Comment',
      }))

      const deleted = repo.delete('comment-1')
      assert.strictEqual(deleted, true)
      assert.strictEqual(repo.findById('comment-1'), null)
    })

    it('should return false for non-existent id', () => {
      const deleted = repo.delete('non-existent')
      assert.strictEqual(deleted, false)
    })
  })

  describe('deleteByReview', () => {
    it('should delete all comments for a review', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        filePath: 'src/a.ts',
        content: 'Comment 1',
      }))
      repo.create(buildCommentInput({
        id: 'comment-2',
        reviewId: testReviewId,
        filePath: 'src/b.ts',
        lineNumber: 2,
        lineType: 'removed',
        content: 'Comment 2',
      }))

      const count = repo.deleteByReview(testReviewId)
      assert.strictEqual(count, 2)
      assert.strictEqual(repo.findByReview(testReviewId).length, 0)
    })
  })

  describe('countByReview', () => {
    it('should count comments for a review', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        filePath: 'src/a.ts',
        content: 'Comment 1',
      }))
      repo.create(buildCommentInput({
        id: 'comment-2',
        reviewId: testReviewId,
        filePath: 'src/b.ts',
        lineNumber: 2,
        lineType: 'removed',
        content: 'Comment 2',
      }))

      const count = repo.countByReview(testReviewId)
      assert.strictEqual(count, 2)
    })
  })

  describe('countUnresolvedByReview', () => {
    it('should count only unresolved comments', () => {
      repo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        filePath: 'src/a.ts',
        content: 'Comment 1',
      }))
      repo.create(buildCommentInput({
        id: 'comment-2',
        reviewId: testReviewId,
        filePath: 'src/b.ts',
        lineNumber: 2,
        lineType: 'removed',
        content: 'Comment 2',
        resolved: true,
      }))

      const count = repo.countUnresolvedByReview(testReviewId)
      assert.strictEqual(count, 1)
    })
  })
})

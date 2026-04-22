import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { buildApp } from '../../../src/server/app.ts'
import { createConfig } from '../../../src/server/config.ts'
import { initDatabase, closeDatabase, getDatabase } from '../../../src/server/db/index.ts'
import { ReviewRepository } from '../../../src/server/repositories/review.repo.ts'
import { CommentRepository } from '../../../src/server/repositories/comment.repo.ts'
import type { FastifyInstance } from 'fastify'
import { TEST_TOKEN, authHeader, buildReviewInput, buildCommentInput } from '../helpers.ts'

describe('comment routes', () => {
  let app: FastifyInstance
  let testReviewId: string

  beforeEach(async () => {
    const config = createConfig({ repositoryPath: process.cwd(), authToken: TEST_TOKEN })
    initDatabase(':memory:')
    app = await buildApp(config, { logger: false, serveStatic: false })

    const db = getDatabase()
    const reviewRepo = new ReviewRepository(db)
    const review = reviewRepo.create(buildReviewInput({
      repositoryPath: process.cwd(),
      snapshotData: JSON.stringify({ files: [], repository: { name: 'test', branch: 'main', remote: null, path: process.cwd() } }),
    }))
    testReviewId = review.id
  })

  afterEach(async () => {
    await app?.close()
    closeDatabase()
  })

  describe('GET /api/reviews/:reviewId/comments', () => {
    it('should return empty array when no comments exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/reviews/${testReviewId}/comments`,
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const data = JSON.parse(response.payload)
      assert.ok(Array.isArray(data))
      assert.strictEqual(data.length, 0)
    })

    it('should return comments for a review', async () => {
      // Create a comment first
      const db = getDatabase()
      const commentRepo = new CommentRepository(db)
      commentRepo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Test comment',
      }))

      const response = await app.inject({
        method: 'GET',
        url: `/api/reviews/${testReviewId}/comments`,
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.length, 1)
      assert.strictEqual(data[0].content, 'Test comment')
    })

    it('should filter comments by file path', async () => {
      const db = getDatabase()
      const commentRepo = new CommentRepository(db)
      commentRepo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        filePath: 'src/a.ts',
        lineNumber: 10,
        content: 'Comment on a.ts',
      }))
      commentRepo.create(buildCommentInput({
        id: 'comment-2',
        reviewId: testReviewId,
        filePath: 'src/b.ts',
        lineNumber: 20,
        content: 'Comment on b.ts',
      }))

      const response = await app.inject({
        method: 'GET',
        url: `/api/reviews/${testReviewId}/comments?filePath=src/a.ts`,
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.length, 1)
      assert.strictEqual(data[0].filePath, 'src/a.ts')
    })
  })

  describe('POST /api/reviews/:reviewId/comments', () => {
    it('should create a comment', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/reviews/${testReviewId}/comments`,
        headers: authHeader(),
        payload: {
          filePath: 'src/index.ts',
          lineNumber: 10,
          lineType: 'added',
          content: 'New comment',
        },
      })

      assert.strictEqual(response.statusCode, 201)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.content, 'New comment')
      assert.strictEqual(data.filePath, 'src/index.ts')
      assert.strictEqual(data.lineNumber, 10)
      assert.strictEqual(data.resolved, false)
    })

    it('should create a comment with suggestion', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/reviews/${testReviewId}/comments`,
        headers: authHeader(),
        payload: {
          filePath: 'src/index.ts',
          lineNumber: 10,
          lineType: 'added',
          content: 'Consider this change',
          suggestion: 'const x = 1;',
        },
      })

      assert.strictEqual(response.statusCode, 201)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.suggestion, 'const x = 1;')
    })

    it('should reject lineNumber without lineType via schema validation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/reviews/${testReviewId}/comments`,
        headers: authHeader(),
        payload: {
          filePath: 'src/index.ts',
          lineNumber: 10,
          content: 'Missing lineType',
        },
      })

      assert.strictEqual(response.statusCode, 400)
      const data = JSON.parse(response.payload)
      // Should be a schema validation error (FST_ERR_VALIDATION), not a service-level MISSING_LINE_TYPE
      assert.notStrictEqual(data.code, 'MISSING_LINE_TYPE')
    })

    it('should reject lineType without lineNumber via schema validation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/reviews/${testReviewId}/comments`,
        headers: authHeader(),
        payload: {
          filePath: 'src/index.ts',
          lineType: 'added',
          content: 'Missing lineNumber',
        },
      })

      assert.strictEqual(response.statusCode, 400)
      const data = JSON.parse(response.payload)
      assert.notStrictEqual(data.code, 'MISSING_LINE_TYPE')
    })

    it('should return 404 for non-existent review', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/reviews/non-existent/comments',
        headers: authHeader(),
        payload: {
          filePath: 'src/index.ts',
          content: 'Test',
        },
      })

      assert.strictEqual(response.statusCode, 404)
    })
  })

  describe('GET /api/reviews/:reviewId/comments/stats', () => {
    it('should return comment statistics', async () => {
      const db = getDatabase()
      const commentRepo = new CommentRepository(db)
      commentRepo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        filePath: 'src/a.ts',
        lineNumber: 10,
        content: 'Unresolved comment',
      }))
      commentRepo.create(buildCommentInput({
        id: 'comment-2',
        reviewId: testReviewId,
        filePath: 'src/b.ts',
        lineNumber: 20,
        content: 'Resolved comment',
        resolved: true,
      }))
      commentRepo.create(buildCommentInput({
        id: 'comment-3',
        reviewId: testReviewId,
        filePath: 'src/c.ts',
        lineNumber: 30,
        content: 'Comment with suggestion',
        suggestion: 'code',
      }))

      const response = await app.inject({
        method: 'GET',
        url: `/api/reviews/${testReviewId}/comments/stats`,
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.total, 3)
      assert.strictEqual(data.resolved, 1)
      assert.strictEqual(data.unresolved, 2)
      assert.strictEqual(data.withSuggestions, 1)
    })
  })

  describe('GET /api/comments/:id', () => {
    it('should return a comment by ID', async () => {
      const db = getDatabase()
      const commentRepo = new CommentRepository(db)
      commentRepo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Get me by ID',
      }))

      const response = await app.inject({
        method: 'GET',
        url: '/api/comments/comment-1',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.id, 'comment-1')
      assert.strictEqual(data.content, 'Get me by ID')
    })

    it('should return 404 for non-existent comment', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/comments/non-existent',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 404)
    })
  })

  describe('PATCH /api/comments/:id', () => {
    it('should update comment content', async () => {
      const db = getDatabase()
      const commentRepo = new CommentRepository(db)
      commentRepo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Original content',
      }))

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/comments/comment-1',
        headers: authHeader(),
        payload: { content: 'Updated content' },
      })

      assert.strictEqual(response.statusCode, 200)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.content, 'Updated content')
    })

    it('should return 404 for non-existent comment', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/comments/non-existent',
        headers: authHeader(),
        payload: { content: 'Updated' },
      })

      assert.strictEqual(response.statusCode, 404)
    })
  })

  describe('DELETE /api/comments/:id', () => {
    it('should delete a comment', async () => {
      const db = getDatabase()
      const commentRepo = new CommentRepository(db)
      commentRepo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'To be deleted',
      }))

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/comments/comment-1',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.success, true)
    })

    it('should return 404 for non-existent comment', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/comments/non-existent',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 404)
    })
  })

  describe('POST /api/comments/:id/resolve', () => {
    it('should mark comment as resolved', async () => {
      const db = getDatabase()
      const commentRepo = new CommentRepository(db)
      commentRepo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Unresolved',
      }))

      const response = await app.inject({
        method: 'POST',
        url: '/api/comments/comment-1/resolve',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.resolved, true)
    })

    it('should return 404 for non-existent comment', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/comments/non-existent/resolve',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 404)
    })
  })

  describe('POST /api/comments/:id/unresolve', () => {
    it('should mark comment as unresolved', async () => {
      const db = getDatabase()
      const commentRepo = new CommentRepository(db)
      commentRepo.create(buildCommentInput({
        id: 'comment-1',
        reviewId: testReviewId,
        lineNumber: 10,
        content: 'Resolved',
        resolved: true,
      }))

      const response = await app.inject({
        method: 'POST',
        url: '/api/comments/comment-1/unresolve',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const data = JSON.parse(response.payload)
      assert.strictEqual(data.resolved, false)
    })
  })
})

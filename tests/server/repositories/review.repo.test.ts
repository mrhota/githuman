import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { createTestDatabase } from '../../../src/server/db/index.ts'
import { ReviewRepository } from '../../../src/server/repositories/review.repo.ts'
import { buildReviewInput } from '../helpers.ts'
import type { DatabaseSync } from 'node:sqlite'

describe('ReviewRepository', () => {
  let db: DatabaseSync
  let repo: ReviewRepository

  beforeEach(() => {
    db = createTestDatabase()
    repo = new ReviewRepository(db)
  })

  describe('create', () => {
    it('should create a review and return it', () => {
      const review = repo.create(buildReviewInput({
        id: 'test-id-1',
        repositoryPath: '/test/repo',
        snapshotData: '{"files":[]}',
      }))

      assert.strictEqual(review.id, 'test-id-1')
      assert.strictEqual(review.repositoryPath, '/test/repo')
      assert.strictEqual(review.baseRef, 'abc123')
      assert.strictEqual(review.sourceType, 'staged')
      assert.strictEqual(review.sourceRef, null)
      assert.strictEqual(review.snapshotData, '{"files":[]}')
      assert.strictEqual(review.status, 'in_progress')
      assert.ok(review.createdAt)
      assert.ok(review.updatedAt)
    })

    it('should create a review from branch comparison', () => {
      const review = repo.create(buildReviewInput({
        id: 'test-id-2',
        repositoryPath: '/test/repo',
        sourceType: 'branch',
        sourceRef: 'main',
        snapshotData: '{}',
      }))

      assert.strictEqual(review.sourceType, 'branch')
      assert.strictEqual(review.sourceRef, 'main')
    })

    it('should create a review from commits', () => {
      const review = repo.create(buildReviewInput({
        id: 'test-id-3',
        repositoryPath: '/test/repo',
        baseRef: null,
        sourceType: 'commits',
        sourceRef: 'abc123,def456',
        snapshotData: '{}',
      }))

      assert.strictEqual(review.sourceType, 'commits')
      assert.strictEqual(review.sourceRef, 'abc123,def456')
      assert.strictEqual(review.baseRef, null)
    })
  })

  describe('findById', () => {
    it('should return a review by id', () => {
      repo.create(buildReviewInput({
        id: 'test-id',
        repositoryPath: '/test/repo',
        baseRef: null,
        snapshotData: '{}',
      }))

      const review = repo.findById('test-id')
      assert.ok(review)
      assert.strictEqual(review.id, 'test-id')
      assert.strictEqual(review.sourceType, 'staged')
    })

    it('should return null for non-existent id', () => {
      const review = repo.findById('non-existent')
      assert.strictEqual(review, null)
    })
  })

  describe('findAll', () => {
    it('should return empty array when no reviews exist', () => {
      const result = repo.findAll()
      assert.strictEqual(result.data.length, 0)
      assert.strictEqual(result.total, 0)
    })

    it('should return all reviews', () => {
      repo.create(buildReviewInput({ id: 'id-1', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))
      repo.create(buildReviewInput({ id: 'id-2', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}', status: 'approved' }))

      const result = repo.findAll()
      assert.strictEqual(result.data.length, 2)
      assert.strictEqual(result.total, 2)
    })

    it('should filter by status', () => {
      repo.create(buildReviewInput({ id: 'id-1', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))
      repo.create(buildReviewInput({ id: 'id-2', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}', status: 'approved' }))

      const result = repo.findAll({ status: 'approved' })
      assert.strictEqual(result.data.length, 1)
      assert.strictEqual(result.total, 1)
      assert.strictEqual(result.data[0].status, 'approved')
    })

    it('should filter by repository path', () => {
      repo.create(buildReviewInput({ id: 'id-1', repositoryPath: '/repo/one', baseRef: null, snapshotData: '{}' }))
      repo.create(buildReviewInput({ id: 'id-2', repositoryPath: '/repo/two', baseRef: null, snapshotData: '{}' }))

      const result = repo.findAll({ repositoryPath: '/repo/one' })
      assert.strictEqual(result.data.length, 1)
      assert.strictEqual(result.data[0].repositoryPath, '/repo/one')
    })

    it('should filter by source type', () => {
      repo.create(buildReviewInput({ id: 'id-1', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))
      repo.create(buildReviewInput({ id: 'id-2', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}', sourceType: 'branch', sourceRef: 'main' }))

      const result = repo.findAll({ sourceType: 'branch' })
      assert.strictEqual(result.data.length, 1)
      assert.strictEqual(result.data[0].sourceType, 'branch')
    })

    it('should paginate results', () => {
      for (let i = 1; i <= 5; i++) {
        repo.create(buildReviewInput({ id: `id-${i}`, repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))
      }

      const page1 = repo.findAll({ page: 1, pageSize: 2 })
      assert.strictEqual(page1.data.length, 2)
      assert.strictEqual(page1.total, 5)

      const page2 = repo.findAll({ page: 2, pageSize: 2 })
      assert.strictEqual(page2.data.length, 2)
      assert.strictEqual(page2.total, 5)

      const page3 = repo.findAll({ page: 3, pageSize: 2 })
      assert.strictEqual(page3.data.length, 1)
      assert.strictEqual(page3.total, 5)
    })
  })

  describe('update', () => {
    it('should update review status', () => {
      repo.create(buildReviewInput({ id: 'test-id', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))

      const updated = repo.update('test-id', { status: 'approved' })
      assert.ok(updated)
      assert.strictEqual(updated.status, 'approved')
    })

    it('should update to changes_requested status', () => {
      repo.create(buildReviewInput({ id: 'test-id', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))

      const updated = repo.update('test-id', { status: 'changes_requested' })
      assert.ok(updated)
      assert.strictEqual(updated.status, 'changes_requested')
    })

    it('should return null for non-existent id', () => {
      const updated = repo.update('non-existent', { status: 'approved' })
      assert.strictEqual(updated, null)
    })
  })

  describe('delete', () => {
    it('should delete a review', () => {
      repo.create(buildReviewInput({ id: 'test-id', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))

      const deleted = repo.delete('test-id')
      assert.strictEqual(deleted, true)

      const review = repo.findById('test-id')
      assert.strictEqual(review, null)
    })

    it('should return false for non-existent id', () => {
      const deleted = repo.delete('non-existent')
      assert.strictEqual(deleted, false)
    })
  })

  describe('countByStatus', () => {
    it('should count reviews by status', () => {
      repo.create(buildReviewInput({ id: 'id-1', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))
      repo.create(buildReviewInput({ id: 'id-2', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))
      repo.create(buildReviewInput({ id: 'id-3', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}', status: 'approved' }))

      assert.strictEqual(repo.countByStatus('in_progress'), 2)
      assert.strictEqual(repo.countByStatus('approved'), 1)
      assert.strictEqual(repo.countByStatus('changes_requested'), 0)
    })
  })

  describe('countAll', () => {
    it('should count all reviews', () => {
      assert.strictEqual(repo.countAll(), 0)

      repo.create(buildReviewInput({ id: 'id-1', repositoryPath: '/test/repo', baseRef: null, snapshotData: '{}' }))

      assert.strictEqual(repo.countAll(), 1)
    })
  })
})

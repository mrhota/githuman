/**
 * Tests for Clock and IdGenerator SPI port injection
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { createTestDatabase } from '../../src/server/db/index.ts'
import { ReviewRepository } from '../../src/server/repositories/review.repo.ts'
import { CommentRepository } from '../../src/server/repositories/comment.repo.ts'
import { ReviewFileRepository } from '../../src/server/repositories/review-file.repo.ts'
import { TodoRepository } from '../../src/server/repositories/todo.repo.ts'
import { CommentService } from '../../src/server/services/comment.service.ts'
import type { DatabaseSync } from 'node:sqlite'

const FAKE_TIME = '2025-01-01T00:00:00.000Z'
const fakeClock = () => FAKE_TIME
const FAKE_ID = 'fake-id-123'
const fakeId = () => FAKE_ID

describe('Clock injection into repositories', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = createTestDatabase()
  })

  describe('ReviewRepository', () => {
    it('should use injected clock for create timestamps', () => {
      const repo = new ReviewRepository(db, fakeClock)

      const review = repo.create({
        id: 'r-1',
        repositoryPath: '/test',
        baseRef: null,
        sourceType: 'staged',
        sourceRef: null,
        snapshotData: '{}',
        status: 'in_progress',
      })

      assert.strictEqual(review.createdAt, FAKE_TIME)
      assert.strictEqual(review.updatedAt, FAKE_TIME)
    })

    it('should use injected clock for update timestamps', () => {
      const createTime = '2024-06-01T00:00:00.000Z'
      const updateTime = '2024-07-01T00:00:00.000Z'
      let callCount = 0
      const steppingClock = () => {
        callCount++
        return callCount <= 1 ? createTime : updateTime
      }

      const repo = new ReviewRepository(db, steppingClock)

      repo.create({
        id: 'r-1',
        repositoryPath: '/test',
        baseRef: null,
        sourceType: 'staged',
        sourceRef: null,
        snapshotData: '{}',
        status: 'in_progress',
      })

      const updated = repo.update('r-1', { status: 'approved' })
      assert.ok(updated)
      assert.strictEqual(updated.createdAt, createTime)
      assert.strictEqual(updated.updatedAt, updateTime)
    })
  })

  describe('CommentRepository', () => {
    it('should use injected clock for create timestamps', () => {
      // Need a review first
      const reviewRepo = new ReviewRepository(db, fakeClock)
      reviewRepo.create({
        id: 'r-1',
        repositoryPath: '/test',
        baseRef: null,
        sourceType: 'staged',
        sourceRef: null,
        snapshotData: '{}',
        status: 'in_progress',
      })

      const repo = new CommentRepository(db, fakeClock)
      const comment = repo.create({
        id: 'c-1',
        reviewId: 'r-1',
        filePath: 'test.ts',
        lineNumber: 1,
        lineType: 'added',
        content: 'test',
        suggestion: null,
        resolved: false,
      })

      assert.strictEqual(comment.createdAt, FAKE_TIME)
      assert.strictEqual(comment.updatedAt, FAKE_TIME)
    })

    it('should use injected clock for update timestamps', () => {
      const reviewRepo = new ReviewRepository(db, fakeClock)
      reviewRepo.create({
        id: 'r-1',
        repositoryPath: '/test',
        baseRef: null,
        sourceType: 'staged',
        sourceRef: null,
        snapshotData: '{}',
        status: 'in_progress',
      })

      const updateTime = '2025-06-01T00:00:00.000Z'
      let callCount = 0
      const steppingClock = () => {
        callCount++
        return callCount <= 1 ? FAKE_TIME : updateTime
      }

      const repo = new CommentRepository(db, steppingClock)
      repo.create({
        id: 'c-1',
        reviewId: 'r-1',
        filePath: 'test.ts',
        lineNumber: 1,
        lineType: 'added',
        content: 'test',
        suggestion: null,
        resolved: false,
      })

      const updated = repo.update('c-1', { content: 'updated' })
      assert.ok(updated)
      assert.strictEqual(updated.updatedAt, updateTime)
    })

    it('should use injected clock for setResolved timestamps', () => {
      const reviewRepo = new ReviewRepository(db, fakeClock)
      reviewRepo.create({
        id: 'r-1',
        repositoryPath: '/test',
        baseRef: null,
        sourceType: 'staged',
        sourceRef: null,
        snapshotData: '{}',
        status: 'in_progress',
      })

      const resolveTime = '2025-06-01T00:00:00.000Z'
      let callCount = 0
      const steppingClock = () => {
        callCount++
        return callCount <= 1 ? FAKE_TIME : resolveTime
      }

      const repo = new CommentRepository(db, steppingClock)
      repo.create({
        id: 'c-1',
        reviewId: 'r-1',
        filePath: 'test.ts',
        lineNumber: 1,
        lineType: 'added',
        content: 'test',
        suggestion: null,
        resolved: false,
      })

      const resolved = repo.setResolved('c-1', true)
      assert.ok(resolved)
      assert.strictEqual(resolved.updatedAt, resolveTime)
    })
  })

  describe('ReviewFileRepository', () => {
    it('should use injected clock for create timestamps', () => {
      const reviewRepo = new ReviewRepository(db, fakeClock)
      reviewRepo.create({
        id: 'r-1',
        repositoryPath: '/test',
        baseRef: null,
        sourceType: 'staged',
        sourceRef: null,
        snapshotData: '{}',
        status: 'in_progress',
      })

      const repo = new ReviewFileRepository(db, fakeClock)
      const file = repo.create({
        id: 'f-1',
        reviewId: 'r-1',
        filePath: 'test.ts',
        status: 'added',
        additions: 10,
        deletions: 0,
      })

      assert.strictEqual(file.createdAt, FAKE_TIME)
    })

    it('should use injected clock for createBulk timestamps', () => {
      const reviewRepo = new ReviewRepository(db, fakeClock)
      reviewRepo.create({
        id: 'r-1',
        repositoryPath: '/test',
        baseRef: null,
        sourceType: 'staged',
        sourceRef: null,
        snapshotData: '{}',
        status: 'in_progress',
      })

      const repo = new ReviewFileRepository(db, fakeClock)
      repo.createBulk([
        { id: 'f-1', reviewId: 'r-1', filePath: 'a.ts', status: 'added', additions: 1, deletions: 0 },
        { id: 'f-2', reviewId: 'r-1', filePath: 'b.ts', status: 'modified', additions: 2, deletions: 1 },
      ])

      const file1 = repo.findByReviewAndPath('r-1', 'a.ts')
      const file2 = repo.findByReviewAndPath('r-1', 'b.ts')
      assert.ok(file1)
      assert.ok(file2)
      assert.strictEqual(file1.createdAt, FAKE_TIME)
      assert.strictEqual(file2.createdAt, FAKE_TIME)
    })
  })

  describe('TodoRepository', () => {
    it('should use injected clock for create timestamps', () => {
      const repo = new TodoRepository(db, fakeClock)

      const todo = repo.create({
        id: 'todo-1',
        content: 'test todo',
        completed: false,
        reviewId: null,
      })

      assert.strictEqual(todo.createdAt, FAKE_TIME)
      assert.strictEqual(todo.updatedAt, FAKE_TIME)
    })

    it('should use injected clock for update timestamps', () => {
      const updateTime = '2025-06-01T00:00:00.000Z'
      let callCount = 0
      const steppingClock = () => {
        callCount++
        return callCount <= 1 ? FAKE_TIME : updateTime
      }

      const repo = new TodoRepository(db, steppingClock)

      repo.create({
        id: 'todo-1',
        content: 'test todo',
        completed: false,
        reviewId: null,
      })

      const updated = repo.update('todo-1', { content: 'updated' })
      assert.ok(updated)
      assert.strictEqual(updated.updatedAt, updateTime)
    })

    it('should use injected clock for toggle timestamps', () => {
      const toggleTime = '2025-06-01T00:00:00.000Z'
      let callCount = 0
      const steppingClock = () => {
        callCount++
        return callCount <= 1 ? FAKE_TIME : toggleTime
      }

      const repo = new TodoRepository(db, steppingClock)

      repo.create({
        id: 'todo-1',
        content: 'test todo',
        completed: false,
        reviewId: null,
      })

      const toggled = repo.toggle('todo-1')
      assert.ok(toggled)
      assert.strictEqual(toggled.updatedAt, toggleTime)
    })

    it('should use injected clock for reorder timestamps', () => {
      const reorderTime = '2025-06-01T00:00:00.000Z'
      let callCount = 0
      const steppingClock = () => {
        callCount++
        return callCount <= 2 ? FAKE_TIME : reorderTime
      }

      const repo = new TodoRepository(db, steppingClock)

      repo.create({ id: 'todo-1', content: 'first', completed: false, reviewId: null })
      repo.create({ id: 'todo-2', content: 'second', completed: false, reviewId: null })

      repo.reorder(['todo-2', 'todo-1'])

      const todo1 = repo.findById('todo-1')
      const todo2 = repo.findById('todo-2')
      assert.ok(todo1)
      assert.ok(todo2)
      assert.strictEqual(todo1.updatedAt, reorderTime)
      assert.strictEqual(todo2.updatedAt, reorderTime)
    })
  })
})

describe('IdGenerator injection into TodoRepository', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = createTestDatabase()
  })

  it('should use injected idGenerator when id is not provided in create', () => {
    const repo = new TodoRepository(db, fakeClock, fakeId)

    const todo = repo.create({
      content: 'test todo',
      completed: false,
      reviewId: null,
    })

    assert.strictEqual(todo.id, FAKE_ID)
  })

  it('should use provided id over idGenerator when id is given', () => {
    const repo = new TodoRepository(db, fakeClock, fakeId)

    const todo = repo.create({
      id: 'explicit-id',
      content: 'test todo',
      completed: false,
      reviewId: null,
    })

    assert.strictEqual(todo.id, 'explicit-id')
  })
})

describe('IdGenerator injection into services', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = createTestDatabase()
  })

  describe('CommentService', () => {
    it('should use injected idGenerator for comment creation', () => {
      const reviewRepo = new ReviewRepository(db, fakeClock)
      reviewRepo.create({
        id: 'r-1',
        repositoryPath: '/test',
        baseRef: null,
        sourceType: 'staged',
        sourceRef: null,
        snapshotData: JSON.stringify({ repository: { name: 'test', branch: 'main', remote: null, path: '/test' }, version: 2 }),
        status: 'in_progress',
      })

      const commentRepo = new CommentRepository(db, fakeClock)
      const service = new CommentService(commentRepo, reviewRepo, fakeId)

      const comment = service.create('r-1', {
        filePath: 'test.ts',
        content: 'test comment',
      })

      assert.strictEqual(comment.id, FAKE_ID)
    })
  })
})

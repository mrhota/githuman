/**
 * Tests for SPI port precedence rules.
 *
 * Clock/IdGenerator wiring is already exercised by every repo/service test
 * that injects a fake. This file only covers a non-obvious rule: when a
 * caller supplies an explicit id, it must override the injected generator.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { createTestDatabase } from '../../src/server/db/index.ts'
import { TodoRepository } from '../../src/server/repositories/todo.repo.ts'
import type { DatabaseSync } from 'node:sqlite'

const fakeClock = () => '2025-01-01T00:00:00.000Z'
const fakeId = () => 'generated-id'

describe('TodoRepository id precedence', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = createTestDatabase()
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

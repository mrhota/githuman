import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import { buildApp } from '../../../src/server/app.ts'
import { createConfig } from '../../../src/server/config.ts'
import { initDatabase } from '../../../src/server/db/index.ts'
import { ReviewService } from '../../../src/server/services/review.service.ts'
import { CommentService } from '../../../src/server/services/comment.service.ts'
import { ExportService } from '../../../src/server/services/export.service.ts'
import { GitService } from '../../../src/server/services/git.service.ts'
import { TodoRepository } from '../../../src/server/repositories/todo.repo.ts'

describe('services plugin', () => {
  const config = createConfig({ repositoryPath: process.cwd() })

  it('should expose services decorator on app instance', async () => {
    initDatabase(':memory:')
    const app = await buildApp(config, { logger: false, serveStatic: false })
    after(async () => { await app.close() })

    assert.ok(app.services, 'app.services should be defined')
    assert.strictEqual(typeof app.services.review, 'function')
    assert.strictEqual(typeof app.services.comment, 'function')
    assert.strictEqual(typeof app.services.export, 'function')
    assert.strictEqual(typeof app.services.git, 'function')
    assert.strictEqual(typeof app.services.todoRepo, 'function')
  })

  it('should return correct service instances', async () => {
    initDatabase(':memory:')
    const app = await buildApp(config, { logger: false, serveStatic: false })
    after(async () => { await app.close() })

    assert.ok(app.services.review() instanceof ReviewService)
    assert.ok(app.services.comment() instanceof CommentService)
    assert.ok(app.services.export() instanceof ExportService)
    assert.ok(app.services.git() instanceof GitService)
    assert.ok(app.services.todoRepo() instanceof TodoRepository)
  })

  it('should create new instances on each call', async () => {
    initDatabase(':memory:')
    const app = await buildApp(config, { logger: false, serveStatic: false })
    after(async () => { await app.close() })

    const review1 = app.services.review()
    const review2 = app.services.review()
    assert.notStrictEqual(review1, review2, 'each call should return a new instance')
  })
})

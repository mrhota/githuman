/**
 * Tests that buildApp accepts a DatabaseSync instance via options,
 * eliminating the need for the global singleton.
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import { buildApp } from '../../src/server/app.ts'
import { createConfig } from '../../src/server/config.ts'
import { createTestDatabase } from '../../src/server/db/index.ts'
import { TEST_TOKEN, authHeader } from './helpers.ts'

describe('database injection via buildApp options', () => {
  it('should use an injected db without calling initDatabase()', async () => {
    const db = createTestDatabase()
    const config = createConfig({ repositoryPath: process.cwd(), authToken: TEST_TOKEN })
    const app = await buildApp(config, { logger: false, serveStatic: false, db })
    after(async () => { await app.close() })

    // Create a todo via the API — proves the services plugin received the db
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/todos',
      headers: authHeader(),
      payload: { content: 'injected db todo' },
    })

    assert.strictEqual(createRes.statusCode, 201)
    const todo = JSON.parse(createRes.payload)
    assert.strictEqual(todo.content, 'injected db todo')

    // Read it back to confirm persistence within the same db instance
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/todos/${todo.id}`,
      headers: authHeader(),
    })

    assert.strictEqual(getRes.statusCode, 200)
    const fetched = JSON.parse(getRes.payload)
    assert.strictEqual(fetched.id, todo.id)
  })

  it('should throw when no db is provided', async () => {
    const config = createConfig({ repositoryPath: process.cwd(), authToken: TEST_TOKEN })
    // Cast to bypass compile-time check — verifies runtime guard in services plugin
    const optsWithoutDb = { logger: false, serveStatic: false } as Parameters<typeof buildApp>[1]
    await assert.rejects(
      () => buildApp(config, optsWithoutDb),
      (err: Error) => {
        assert.ok(err.message.includes('db'), `Expected error about missing db, got: ${err.message}`)
        return true
      }
    )
  })

  it('two apps with separate in-memory dbs should be isolated', async () => {
    const db1 = createTestDatabase()
    const db2 = createTestDatabase()
    const config = createConfig({ repositoryPath: process.cwd(), authToken: TEST_TOKEN })

    const app1 = await buildApp(config, { logger: false, serveStatic: false, db: db1 })
    const app2 = await buildApp(config, { logger: false, serveStatic: false, db: db2 })
    after(async () => {
      await app1.close()
      await app2.close()
    })

    // Create a todo on app1
    const res1 = await app1.inject({
      method: 'POST',
      url: '/api/todos',
      headers: authHeader(),
      payload: { content: 'app1 todo' },
    })
    assert.strictEqual(res1.statusCode, 201)
    const todo1 = JSON.parse(res1.payload)

    // app2 should NOT see app1's todo
    const res2 = await app2.inject({
      method: 'GET',
      url: `/api/todos/${todo1.id}`,
      headers: authHeader(),
    })
    assert.strictEqual(res2.statusCode, 404)
  })
})

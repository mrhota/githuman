import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import { buildApp } from '../../src/server/app.ts'
import { createConfig } from '../../src/server/config.ts'
import { createTestDatabase } from '../../src/server/db/index.ts'

describe('optional swagger', () => {
  it('should serve /docs when enableDocs is true (default)', async () => {
    const db = createTestDatabase()
    const config = createConfig({ repositoryPath: process.cwd() })
    const app = await buildApp(config, { logger: false, serveStatic: false, db })
    after(async () => { await app.close() })

    const response = await app.inject({
      method: 'GET',
      url: '/docs/',
    })

    assert.strictEqual(response.statusCode, 200)
  })

  it('should not serve /docs when enableDocs is false', async () => {
    const db = createTestDatabase()
    const config = createConfig({ repositoryPath: process.cwd(), enableDocs: false })
    const app = await buildApp(config, { logger: false, serveStatic: false, db })
    after(async () => { await app.close() })

    const response = await app.inject({
      method: 'GET',
      url: '/docs/',
    })

    assert.strictEqual(response.statusCode, 404)
  })

  it('should not serve /docs/json when enableDocs is false', async () => {
    const db = createTestDatabase()
    const config = createConfig({ repositoryPath: process.cwd(), enableDocs: false })
    const app = await buildApp(config, { logger: false, serveStatic: false, db })
    after(async () => { await app.close() })

    const response = await app.inject({
      method: 'GET',
      url: '/docs/json',
    })

    assert.strictEqual(response.statusCode, 404)
  })

  it('should still serve API routes when enableDocs is false', async () => {
    const db = createTestDatabase()
    const config = createConfig({ repositoryPath: process.cwd(), enableDocs: false })
    const app = await buildApp(config, { logger: false, serveStatic: false, db })
    after(async () => { await app.close() })

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    assert.strictEqual(response.statusCode, 200)
  })
})

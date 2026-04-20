import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { buildApp } from '../../../src/server/app.ts'
import { createConfig } from '../../../src/server/config.ts'
import { initDatabase, closeDatabase } from '../../../src/server/db/index.ts'
import type { FastifyInstance } from 'fastify'
import { TEST_TOKEN, authHeader } from '../helpers.ts'
import type { ChangeDetector } from '../../../src/server/ports.ts'

function createFakeChangeDetector () {
  const calls: string[] = []
  return {
    calls,
    detector: {
      async start () { calls.push('start') },
      async stop () { calls.push('stop') },
      async checkNow () { calls.push('checkNow') },
    } satisfies ChangeDetector,
  }
}

describe('events routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const config = createConfig({ dbPath: ':memory:', authToken: TEST_TOKEN })
    initDatabase(config.dbPath)
    app = await buildApp(config, { logger: false, serveStatic: false })
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  describe('GET /api/events/clients', () => {
    it('should return count of connected clients', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/events/clients',
        headers: authHeader(),
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.strictEqual(typeof body.count, 'number')
      assert.strictEqual(body.count, 0)
    })
  })

  describe('POST /api/events/notify', () => {
    it('should accept todos notification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/notify',
        headers: authHeader(),
        payload: { type: 'todos', action: 'updated' },
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.strictEqual(body.success, true)
    })

    it('should accept reviews notification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/notify',
        headers: authHeader(),
        payload: { type: 'reviews', action: 'created' },
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.strictEqual(body.success, true)
    })

    it('should accept comments notification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/notify',
        headers: authHeader(),
        payload: { type: 'comments', action: 'deleted' },
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.strictEqual(body.success, true)
    })

    it('should accept notification without action', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/notify',
        headers: authHeader(),
        payload: { type: 'todos' },
      })

      assert.strictEqual(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.strictEqual(body.success, true)
    })

    it('should reject invalid event type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/notify',
        headers: authHeader(),
        payload: { type: 'invalid' },
      })

      assert.strictEqual(response.statusCode, 400)
    })

    it('should reject missing type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/notify',
        headers: authHeader(),
        payload: {},
      })

      assert.strictEqual(response.statusCode, 400)
    })

    it('should call checkNow on changeDetector when type is files', async () => {
      const { calls, detector } = createFakeChangeDetector()

      // Replace the changeDetector on the app instance
      ;(app as unknown as Record<string, unknown>).changeDetector = detector

      const response = await app.inject({
        method: 'POST',
        url: '/api/events/notify',
        headers: authHeader(),
        payload: { type: 'files' },
      })

      assert.strictEqual(response.statusCode, 200)
      assert.ok(calls.includes('checkNow'), 'Expected checkNow to be called')
    })

    it('should emit to eventBus for non-files types', async () => {
      const emittedEvents: Array<{ type: string; data: unknown }> = []
      const originalEmit = app.eventBus.emit.bind(app.eventBus)

      // Spy on eventBus.emit
      app.eventBus.emit = async (type, data) => {
        emittedEvents.push({ type, data })
        return originalEmit(type, data)
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/events/notify',
        headers: authHeader(),
        payload: { type: 'todos', action: 'created' },
      })

      assert.strictEqual(response.statusCode, 200)
      assert.strictEqual(emittedEvents.length, 1)
      assert.strictEqual(emittedEvents[0].type, 'todos')
    })
  })

  // Note: GET /api/events (SSE endpoint) cannot be easily tested with Fastify's inject
  // because it hijacks the response for streaming. The endpoint is tested via
  // integration testing when needed.
})

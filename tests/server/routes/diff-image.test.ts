import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { buildApp } from '../../../src/server/app.ts'
import { createConfig } from '../../../src/server/config.ts'
import { createTestDatabase } from '../../../src/server/db/index.ts'
import type { FastifyInstance } from 'fastify'
import { TEST_TOKEN, authHeader, createTestRepo, type TestContext } from '../helpers.ts'

// 1x1 red PNG (smallest valid PNG)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
)

// 1x1 white JPEG
const TINY_JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=',
  'base64'
)

const TINY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="red" width="1" height="1"/></svg>'

function makeCleanupContext (): { t: TestContext, cleanup: () => void } {
  const cleanups: Array<() => void | Promise<void>> = []
  return {
    t: { after: (fn) => { cleanups.push(fn) } },
    cleanup: () => { for (const fn of cleanups) fn() },
  }
}

describe('GET /api/diff/image/*', () => {
  let app: FastifyInstance
  let repoDir: string
  let cleanupRepo: () => void

  beforeEach(async () => {
    const ctx = makeCleanupContext()

    repoDir = createTestRepo(ctx.t, { initialCommit: true })
    cleanupRepo = ctx.cleanup

    // Commit image files so they exist at HEAD
    writeFileSync(join(repoDir, 'logo.png'), TINY_PNG)
    writeFileSync(join(repoDir, 'photo.jpg'), TINY_JPG)
    writeFileSync(join(repoDir, 'icon.svg'), TINY_SVG)
    execSync('git add -A', { cwd: repoDir, stdio: 'ignore' })
    execSync('git commit -m "add images"', { cwd: repoDir, stdio: 'ignore' })

    const config = createConfig({ repositoryPath: repoDir, authToken: TEST_TOKEN })
    app = await buildApp(config, { logger: false, serveStatic: false, db: createTestDatabase() })
  })

  afterEach(async () => {
    await app.close()
    cleanupRepo()
  })

  it('serves image at HEAD version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/logo.png?version=head',
      headers: authHeader(),
    })

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['content-type'], 'image/png')
    assert.ok(res.rawPayload.length > 0)
  })

  it('serves image at staged version', async () => {
    // Modify and stage a new version
    const updatedPng = Buffer.from(TINY_PNG)
    writeFileSync(join(repoDir, 'logo.png'), updatedPng)
    execSync('git add logo.png', { cwd: repoDir, stdio: 'ignore' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/logo.png?version=staged',
      headers: authHeader(),
    })

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['content-type'], 'image/png')
  })

  it('serves image at working version', async () => {
    // Write a file to disk without staging
    writeFileSync(join(repoDir, 'working.png'), TINY_PNG)

    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/working.png?version=working',
      headers: authHeader(),
    })

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['content-type'], 'image/png')
  })

  it('falls back from staged to working when file not in index', async () => {
    // Write file to disk only (not staged, not committed)
    writeFileSync(join(repoDir, 'new-icon.png'), TINY_PNG)

    // Default version is 'staged', should fall back to working
    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/new-icon.png',
      headers: authHeader(),
    })

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['content-type'], 'image/png')
  })

  it('returns correct MIME type for PNG', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/logo.png?version=head',
      headers: authHeader(),
    })

    assert.strictEqual(res.headers['content-type'], 'image/png')
  })

  it('returns correct MIME type for JPEG', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/photo.jpg?version=head',
      headers: authHeader(),
    })

    assert.strictEqual(res.headers['content-type'], 'image/jpeg')
  })

  it('returns correct MIME type for SVG', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/icon.svg?version=head',
      headers: authHeader(),
    })

    assert.strictEqual(res.headers['content-type'], 'image/svg+xml')
  })

  it('returns 404 for nonexistent file', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/does-not-exist.png?version=head',
      headers: authHeader(),
    })

    assert.strictEqual(res.statusCode, 404)
    const body = JSON.parse(res.body)
    assert.strictEqual(body.error, 'Image not found')
  })

  it('returns 404 for path traversal attempt', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/../../../etc/passwd?version=working',
      headers: authHeader(),
    })

    assert.strictEqual(res.statusCode, 404)
  })

  it('returns application/octet-stream for unknown extension', async () => {
    writeFileSync(join(repoDir, 'data.bin'), Buffer.from([0x00, 0x01, 0x02]))
    execSync('git add data.bin', { cwd: repoDir, stdio: 'ignore' })
    execSync('git commit -m "add binary"', { cwd: repoDir, stdio: 'ignore' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/diff/image/data.bin?version=head',
      headers: authHeader(),
    })

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['content-type'], 'application/octet-stream')
  })
})

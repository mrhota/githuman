/**
 * End-to-end wiring test for GitAdapter + ChangeDetector + EventBus.
 *
 * Unit tests for change-detector use a real temp git repo but each adapter
 * in isolation; this file is the only place the three real adapters are
 * composed together, exercising real-IO stdout parsing and the real
 * EventEmitter-backed bus.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGitAdapter } from '../../../src/server/adapters/git.ts'
import { createChangeDetector } from '../../../src/server/adapters/change-detector.ts'
import { createEventBus } from '../../../src/server/adapters/event-bus.ts'
import type { EventType } from '../../../src/server/ports.ts'
import { createTestRepo, type TestContext } from '../helpers.ts'

function createTestRepoWithCommit (t: TestContext): string {
  return createTestRepo(t, { prefix: 'integration-change-detect-' })
}

describe('Change Detection Integration', () => {
  it('should emit files event when a file is created in the repo', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const eventBus = createEventBus()
    const git = createGitAdapter(tempDir)
    const detector = createChangeDetector(git, eventBus, 60_000)

    t.after(async () => {
      await detector.stop()
      await eventBus.close()
    })

    const received: Array<{ type: EventType; data: unknown }> = []
    eventBus.on((type, data) => {
      received.push({ type, data })
    })

    await detector.start()
    writeFileSync(join(tempDir, 'new-file.txt'), 'hello\n')
    await detector.checkNow()

    assert.ok(received.length > 0, 'expected at least one event')
    assert.strictEqual(received[0].type, 'files')
    assert.deepStrictEqual(received[0].data, { action: 'updated' })
  })

  it('should not crash when pointed at a non-git directory', async (t) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'not-a-git-repo-'))
    t.after(() => rmSync(tempDir, { recursive: true, force: true }))

    const eventBus = createEventBus()
    const git = createGitAdapter(tempDir)
    const detector = createChangeDetector(git, eventBus, 60_000)

    t.after(async () => {
      await detector.stop()
      await eventBus.close()
    })

    const received: Array<{ type: EventType; data: unknown }> = []
    eventBus.on((type, data) => {
      received.push({ type, data })
    })

    await detector.start()
    await detector.checkNow()

    assert.strictEqual(received.length, 0, 'expected no events when git fails')
  })
})

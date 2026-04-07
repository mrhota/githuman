import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createGitAdapter } from '../../../src/server/adapters/git.ts'
import { createChangeDetector } from '../../../src/server/adapters/change-detector.ts'
import { createEventBus } from '../../../src/server/adapters/event-bus.ts'
import type { EventType } from '../../../src/server/ports.ts'

interface TestContext {
  after: (fn: () => void) => void
}

function createTestRepo (t: TestContext): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'integration-change-detect-'))
  execSync('git init', { cwd: tempDir, stdio: 'ignore' })
  execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' })
  execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' })

  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  return tempDir
}

function createTestRepoWithCommit (t: TestContext): string {
  const tempDir = createTestRepo(t)
  writeFileSync(join(tempDir, 'README.md'), '# Test\n')
  execSync('git add README.md', { cwd: tempDir, stdio: 'ignore' })
  execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'ignore' })
  return tempDir
}

function wait (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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

  it('should emit files event when a file is staged', async (t) => {
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
    writeFileSync(join(tempDir, 'staged.txt'), 'staged content\n')
    execSync('git add staged.txt', { cwd: tempDir, stdio: 'ignore' })
    await detector.checkNow()

    assert.ok(received.length > 0, 'expected at least one event for staged file')
    assert.strictEqual(received[0].type, 'files')
  })

  it('should not emit when nothing changes', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const eventBus = createEventBus()
    const git = createGitAdapter(tempDir)
    const detector = createChangeDetector(git, eventBus, 50)

    t.after(async () => {
      await detector.stop()
      await eventBus.close()
    })

    const received: Array<{ type: EventType; data: unknown }> = []
    eventBus.on((type, data) => {
      received.push({ type, data })
    })

    await detector.start()
    await wait(200)

    assert.strictEqual(received.length, 0, 'expected no events on a clean repo')
  })

  it('should handle intermittent git failures without crashing', async (t) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'not-a-git-repo-'))
    t.after(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })

    const eventBus = createEventBus()
    const git = createGitAdapter(tempDir)
    const detector = createChangeDetector(git, eventBus, 50)

    t.after(async () => {
      await detector.stop()
      await eventBus.close()
    })

    const received: Array<{ type: EventType; data: unknown }> = []
    eventBus.on((type, data) => {
      received.push({ type, data })
    })

    await detector.start()
    await wait(200)

    assert.strictEqual(received.length, 0, 'expected no events when git fails')
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createGitAdapter } from '../../../src/server/adapters/git.ts'
import { createChangeDetector } from '../../../src/server/adapters/change-detector.ts'
import { createFakeGitPort } from '../helpers.ts'
import type { EventBus } from '../../../src/server/ports.ts'

interface TestContext {
  after: (fn: () => void) => void
}

function createTestRepo (t: TestContext): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'change-detector-test-'))
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

function createFakeEventBus () {
  const events: Array<{ type: string; data: unknown }> = []
  return {
    events,
    bus: {
      async emit (type: string, data?: unknown) { events.push({ type, data }) },
      on () {},
      removeListener () {},
      async close () {},
    } satisfies EventBus,
  }
}

function wait (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('ChangeDetector', () => {
  it('captures initial state on start without emitting', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)
    const { events, bus } = createFakeEventBus()

    const detector = createChangeDetector(git, bus, 60_000)
    t.after(async () => { await detector.stop() })

    await detector.start()
    await detector.checkNow()

    assert.strictEqual(events.length, 0)
  })

  it('emits event when working tree changes', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)
    const { events, bus } = createFakeEventBus()

    const detector = createChangeDetector(git, bus, 60_000)
    t.after(async () => { await detector.stop() })

    await detector.start()
    writeFileSync(join(tempDir, 'new-file.txt'), 'hello\n')
    await detector.checkNow()

    assert.ok(events.length > 0, 'expected at least one event')
    assert.strictEqual(events[0].type, 'files')
    assert.deepStrictEqual(events[0].data, { action: 'updated' })
  })

  it('does not emit when nothing changed', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)
    const { events, bus } = createFakeEventBus()

    const detector = createChangeDetector(git, bus, 60_000)
    t.after(async () => { await detector.stop() })

    await detector.start()
    await detector.checkNow()
    await detector.checkNow()

    assert.strictEqual(events.length, 0)
  })

  it('stops polling on stop()', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)
    const { events, bus } = createFakeEventBus()

    t.mock.timers.enable({ apis: ['setTimeout'] })

    const detector = createChangeDetector(git, bus, 50)
    t.after(async () => { await detector.stop() })

    await detector.start()
    await detector.stop()

    writeFileSync(join(tempDir, 'new-file.txt'), 'hello\n')
    t.mock.timers.tick(200)

    assert.strictEqual(events.length, 0)
  })

  it('handles git command failure gracefully', async (t) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'not-a-git-repo-'))
    t.after(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })
    const git = createGitAdapter(tempDir)
    const { events, bus } = createFakeEventBus()

    const detector = createChangeDetector(git, bus, 60_000)
    t.after(async () => { await detector.stop() })

    await detector.start()
    await detector.checkNow()

    assert.strictEqual(events.length, 0)
  })

  it('checkNow() triggers immediate check', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)
    const { events, bus } = createFakeEventBus()

    const detector = createChangeDetector(git, bus, 60_000)
    t.after(async () => { await detector.stop() })

    await detector.start()
    writeFileSync(join(tempDir, 'new-file.txt'), 'hello\n')
    await detector.checkNow()

    assert.ok(events.length > 0, 'expected event from checkNow()')
    assert.strictEqual(events[0].type, 'files')
  })

  it('checkNow() serializes with in-flight check', async (t) => {
    let callCount = 0
    const fakeGit = createFakeGitPort({
      statusPorcelain: async () => {
        callCount++
        await wait(100)
        return `output-${callCount}`
      },
    })
    const { bus } = createFakeEventBus()

    const detector = createChangeDetector(fakeGit, bus, 60_000)
    t.after(async () => { await detector.stop() })

    await detector.start()
    callCount = 0

    const p1 = detector.checkNow()
    const p2 = detector.checkNow()
    await Promise.all([p1, p2])

    assert.strictEqual(callCount, 1, 'expected only one call when checkNow() is already in-flight')
  })

  it('setTimeout chains do not overlap', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let concurrency = 0
    let maxConcurrency = 0
    let callCount = 0
    const gates: Array<() => void> = []

    const fakeGit = createFakeGitPort({
      statusPorcelain: () => {
        concurrency++
        maxConcurrency = Math.max(maxConcurrency, concurrency)
        callCount++
        return new Promise<string>(resolve => {
          gates.push(() => { concurrency--; resolve(`output-${callCount}`) })
        })
      },
    })
    const { bus } = createFakeEventBus()

    const detector = createChangeDetector(fakeGit, bus, 20)
    t.after(async () => { await detector.stop() })

    // start() calls statusPorcelain for initial capture
    const startPromise = detector.start()
    // Resolve the initial gate so start() completes
    gates[0]()
    await startPromise

    // Reset counters after initialization
    callCount = 0
    gates.length = 0

    // Tick past first interval — triggers check, statusPorcelain blocks on gate
    t.mock.timers.tick(20)
    assert.strictEqual(callCount, 1)

    // Tick again — should NOT start another check (previous still in-flight)
    t.mock.timers.tick(20)
    assert.strictEqual(callCount, 1, 'no overlap — previous check still in-flight')

    // Release first check
    gates[0]()
    // Flush microtasks so scheduleNext() runs
    await new Promise<void>(resolve => process.nextTick(resolve))

    // Now scheduleNext has run, tick to fire next check
    t.mock.timers.tick(20)
    assert.strictEqual(callCount, 2)

    // Cleanup
    gates[1]()
    await new Promise<void>(resolve => process.nextTick(resolve))
    await detector.stop()

    assert.ok(callCount >= 2, `expected multiple calls, got ${callCount}`)
    assert.strictEqual(maxConcurrency, 1, 'expected no concurrent calls')
  })

  it('detects staged changes', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)
    const { events, bus } = createFakeEventBus()

    const detector = createChangeDetector(git, bus, 60_000)
    t.after(async () => { await detector.stop() })

    await detector.start()
    writeFileSync(join(tempDir, 'staged.txt'), 'staged content\n')
    execSync('git add staged.txt', { cwd: tempDir, stdio: 'ignore' })
    await detector.checkNow()

    assert.ok(events.length > 0, 'expected event for staged changes')
    assert.strictEqual(events[0].type, 'files')
  })

  it('fingerprint is stable for unchanged state', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    writeFileSync(join(tempDir, 'file.txt'), 'content\n')

    const result1 = await git.statusPorcelain()
    const result2 = await git.statusPorcelain()

    assert.strictEqual(result1, result2)
  })
})

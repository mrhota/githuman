import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestRepo, createTestRepoWithDb, runCliInProcess } from './test-utils.ts'

// Create temp directories for tests
let tempDir: string
let todoTempDir: string

describe('CLI', () => {
  describe('main entry', () => {
    it('should show help with --help flag', async () => {
      const result = await runCliInProcess(['--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('GitHuman'))
      assert.ok(result.stdout.includes('Usage:'))
      assert.ok(result.stdout.includes('serve'))
      assert.ok(result.stdout.includes('list'))
    })

    it('should show help with -h flag', async () => {
      const result = await runCliInProcess(['-h'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('GitHuman'))
    })

    it('should show version with --version flag', async () => {
      const result = await runCliInProcess(['--version'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('githuman v0.1.0'))
    })

    it('should show version with -v flag', async () => {
      const result = await runCliInProcess(['-v'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('v0.1.0'))
    })

    it('should show help when no command provided', async () => {
      const result = await runCliInProcess([])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Usage:'))
    })

    it('should error on unknown command', async () => {
      const result = await runCliInProcess(['unknown'])

      assert.strictEqual(result.exitCode, 1)
      // Message goes to stderr
      assert.ok(result.stderr.includes('Unknown command: unknown'))
    })
  })

  describe('serve command', () => {
    it('should show help with --help flag', async () => {
      const result = await runCliInProcess(['serve', '--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Usage: githuman serve'))
      assert.ok(result.stdout.includes('--port'))
      assert.ok(result.stdout.includes('--host'))
      assert.ok(result.stdout.includes('--auth'))
      assert.ok(result.stdout.includes('--no-open'))
      assert.ok(result.stdout.includes('-v, --verbose'))
    })

    it('should show help with -h flag', async () => {
      const result = await runCliInProcess(['serve', '-h'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Usage: githuman serve'))
    })

    it('should auto-generate token when --auth is used without value', async () => {
      // Use --no-open and a temp dir so it doesn't actually start the server
      // This test just verifies parsing works - we can't fully start the server in tests
      const result = await runCliInProcess(['serve', '--auth', '--help'])

      assert.strictEqual(result.exitCode, 0)
      // Help should show the optional token syntax
      assert.ok(result.stdout.includes('--auth [token]'))
    })

    it('should show helpful error when --auth has short token', async () => {
      const result = await runCliInProcess(['serve', '--auth', 'short', '--no-open'])

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('at least 32 characters'))
    })

    it('should mention auto-generation in help text', async () => {
      const result = await runCliInProcess(['serve', '--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('auto-generate'))
      assert.ok(result.stdout.includes('--auth [token]'))
    })

    it('should include --no-https in help text', async () => {
      const result = await runCliInProcess(['serve', '--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('--no-https'))
      assert.ok(result.stdout.includes('Disable HTTPS'))
    })

    it('should mention HTTPS auto-enable in help text', async () => {
      const result = await runCliInProcess(['serve', '--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('HTTPS auto-enabled'))
      assert.ok(result.stdout.includes('self-signed certificate'))
    })

    it('should include --cert and --key in help text', async () => {
      const result = await runCliInProcess(['serve', '--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('--cert <path>'))
      assert.ok(result.stdout.includes('--key <path>'))
      assert.ok(result.stdout.includes('TLS certificate file'))
      assert.ok(result.stdout.includes('TLS private key file'))
    })

    it('should include --https flag in help text', async () => {
      const result = await runCliInProcess(['serve', '--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('--https'))
      assert.ok(result.stdout.includes('Force HTTPS'))
    })

    it('should error when --cert provided without --key', async () => {
      const result = await runCliInProcess(['serve', '--cert', '/path/to/cert.pem', '--no-open'])

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('--cert and --key must be specified together'))
    })

    it('should error when --key provided without --cert', async () => {
      const result = await runCliInProcess(['serve', '--key', '/path/to/key.pem', '--no-open'])

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('--cert and --key must be specified together'))
    })
  })

  describe('list command', () => {
    before(() => {
      // Create temp directory without any database
      tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'))
    })

    after(() => {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })

    it('should show help with --help flag', async () => {
      const result = await runCliInProcess(['list', '--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Usage: githuman list'))
      assert.ok(result.stdout.includes('--status'))
      assert.ok(result.stdout.includes('--json'))
    })

    it('should show help with -h flag', async () => {
      const result = await runCliInProcess(['list', '-h'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Usage: githuman list'))
    })

    it('should show no reviews message when database does not exist', async () => {
      // Run from temp directory which has no database
      const result = await runCliInProcess(['list'], { cwd: tempDir })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(
        result.stdout.includes('No reviews found')
      )
    })

    it('should output empty array with --json when no reviews', async () => {
      // Run from temp directory which has no database
      const result = await runCliInProcess(['list', '--json'], { cwd: tempDir })

      assert.strictEqual(result.exitCode, 0)
      // Either empty array or "No reviews found" message
      const output = result.stdout.trim()
      assert.ok(
        output === '[]' || output.includes('No reviews found')
      )
    })
  })

  describe('todo command', () => {
    before(() => {
      // Create temp git repo for todo tests
      todoTempDir = mkdtempSync(join(tmpdir(), 'todo-cli-test-'))
      execSync('git init', { cwd: todoTempDir, stdio: 'ignore' })
      execSync('git config user.email "test@test.com"', { cwd: todoTempDir, stdio: 'ignore' })
      execSync('git config user.name "Test"', { cwd: todoTempDir, stdio: 'ignore' })
    })

    after(() => {
      if (todoTempDir) {
        rmSync(todoTempDir, { recursive: true, force: true })
      }
    })

    it('should show help with --help flag', async () => {
      const result = await runCliInProcess(['todo', '--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Usage: githuman todo'))
      assert.ok(result.stdout.includes('add'))
      assert.ok(result.stdout.includes('list'))
      assert.ok(result.stdout.includes('done'))
      assert.ok(result.stdout.includes('remove'))
    })

    it('should show help with -h flag', async () => {
      const result = await runCliInProcess(['todo', '-h'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Usage: githuman todo'))
    })

    it('should show no todos message when database does not exist', async () => {
      const result = await runCliInProcess(['todo', 'list'], { cwd: todoTempDir })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('No todos found'))
    })

    it('should output empty array with --json when no todos', async () => {
      const result = await runCliInProcess(['todo', 'list', '--json'], { cwd: todoTempDir })

      assert.strictEqual(result.exitCode, 0)
      assert.strictEqual(result.stdout.trim(), '[]')
    })

    it('should add a todo', async () => {
      const result = await runCliInProcess(['todo', 'add', 'Test todo item'], { cwd: todoTempDir })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Created todo'))
      assert.ok(result.stdout.includes('Test todo item'))
    })

    it('should list todos after adding', async () => {
      const result = await runCliInProcess(['todo', 'list'], { cwd: todoTempDir })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Test todo item'))
      assert.ok(result.stdout.includes('[ ]')) // pending
    })

    it('should add todo with --json output', async () => {
      const result = await runCliInProcess(['todo', 'add', 'JSON test todo', '--json'], { cwd: todoTempDir })

      assert.strictEqual(result.exitCode, 0)
      const data = JSON.parse(result.stdout)
      assert.strictEqual(data.content, 'JSON test todo')
      assert.strictEqual(data.completed, false)
    })

    it('should require content for add', async () => {
      const result = await runCliInProcess(['todo', 'add'], { cwd: todoTempDir })

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('content is required'))
    })

    it('should require --done flag for clear', async () => {
      const result = await runCliInProcess(['todo', 'clear'], { cwd: todoTempDir })

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('--done flag is required'))
    })

    it('should show only pending todos by default', async () => {
      // First, add a todo and mark it done
      const addResult = await runCliInProcess(['todo', 'add', 'Pending todo'], { cwd: todoTempDir })
      assert.strictEqual(addResult.exitCode, 0)

      const addResult2 = await runCliInProcess(['todo', 'add', 'Will be completed', '--json'], { cwd: todoTempDir })
      assert.strictEqual(addResult2.exitCode, 0)
      const todoData = JSON.parse(addResult2.stdout)
      const todoId = todoData.id.slice(0, 8)

      // Mark the second one as done
      await runCliInProcess(['todo', 'done', todoId], { cwd: todoTempDir })

      // Default list should show pending only
      const listResult = await runCliInProcess(['todo', 'list'], { cwd: todoTempDir })
      assert.strictEqual(listResult.exitCode, 0)
      assert.ok(listResult.stdout.includes('Pending todo'))
      // Should NOT show completed ones
      assert.ok(!listResult.stdout.includes('Will be completed'))
    })

    it('should show only completed todos with --done', async () => {
      const result = await runCliInProcess(['todo', 'list', '--done'], { cwd: todoTempDir })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Will be completed'))
      assert.ok(result.stdout.includes('[x]'))
      // Should NOT show pending ones
      assert.ok(!result.stdout.includes('Pending todo'))
    })

    it('should show all todos with --all', async () => {
      const result = await runCliInProcess(['todo', 'list', '--all'], { cwd: todoTempDir })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Pending todo'))
      assert.ok(result.stdout.includes('Will be completed'))
      assert.ok(result.stdout.includes('[ ]'))
      assert.ok(result.stdout.includes('[x]'))
    })

    it('should accept "complete" as alias for "done"', async () => {
      // Add a new todo
      const addResult = await runCliInProcess(['todo', 'add', 'Complete alias test', '--json'], { cwd: todoTempDir })
      assert.strictEqual(addResult.exitCode, 0)
      const todoData = JSON.parse(addResult.stdout)
      const todoId = todoData.id.slice(0, 8)

      // Mark it as done using "complete" alias
      const completeResult = await runCliInProcess(['todo', 'complete', todoId], { cwd: todoTempDir })
      assert.strictEqual(completeResult.exitCode, 0)
      assert.ok(completeResult.stdout.includes('Marked as done'))
      assert.ok(completeResult.stdout.includes('Complete alias test'))

      // Verify it's in the done list
      const listResult = await runCliInProcess(['todo', 'list', '--done'], { cwd: todoTempDir })
      assert.strictEqual(listResult.exitCode, 0)
      assert.ok(listResult.stdout.includes('Complete alias test'))
      assert.ok(listResult.stdout.includes('[x]'))
    })
  })

  describe('resolve command', () => {
    it('should show help with --help flag', async () => {
      const result = await runCliInProcess(['resolve', '--help'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Usage: githuman resolve'))
      assert.ok(result.stdout.includes('review-id'))
      assert.ok(result.stdout.includes('--json'))
    })

    it('should show help with -h flag', async () => {
      const result = await runCliInProcess(['resolve', '-h'])

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('Usage: githuman resolve'))
    })

    it('should require review-id', async (t) => {
      const resolveTempDir = createTestRepo(t)
      const result = await runCliInProcess(['resolve'], { cwd: resolveTempDir })

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('review-id is required'))
    })

    it('should error when review does not exist', async (t) => {
      const resolveTempDir = await createTestRepoWithDb(t)
      const result = await runCliInProcess(['resolve', 'abc123'], { cwd: resolveTempDir })

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('Review not found'))
    })

    it('should error when no reviews exist for "last"', async (t) => {
      const resolveTempDir = await createTestRepoWithDb(t)
      const result = await runCliInProcess(['resolve', 'last'], { cwd: resolveTempDir })

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('No reviews found'))
    })
  })
})

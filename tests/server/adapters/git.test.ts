import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createGitAdapter } from '../../../src/server/adapters/git.ts'

interface TestContext {
  after: (fn: () => void) => void;
}

function createTestRepo (t: TestContext): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'git-adapter-test-'))
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

describe('Git adapter', () => {
  it('revparse returns trimmed output', async (t) => {
    const tempDir = createTestRepo(t)
    const git = createGitAdapter(tempDir)

    const result = await git.revparse(['--git-dir'])

    assert.strictEqual(result, '.git')
  })

  it('status returns structured result with staged files', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    writeFileSync(join(tempDir, 'staged.txt'), 'staged content\n')
    execSync('git add staged.txt', { cwd: tempDir, stdio: 'ignore' })

    writeFileSync(join(tempDir, 'README.md'), '# Modified\n')

    writeFileSync(join(tempDir, 'untracked.txt'), 'untracked\n')

    const result = await git.status()

    assert.ok(result.staged.includes('staged.txt'))
    assert.ok(result.modified.includes('README.md'))
    assert.ok(result.notAdded.includes('untracked.txt'))
  })

  it('status returns created files', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    writeFileSync(join(tempDir, 'new-file.txt'), 'new content\n')
    execSync('git add new-file.txt', { cwd: tempDir, stdio: 'ignore' })

    const result = await git.status()

    assert.ok(result.created.includes('new-file.txt'))
    assert.ok(result.staged.includes('new-file.txt'))
  })

  it('status returns deleted files', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    execSync('git rm README.md', { cwd: tempDir, stdio: 'ignore' })

    const result = await git.status()

    assert.ok(result.deleted.includes('README.md'))
    assert.ok(result.staged.includes('README.md'))
  })

  it('status returns renamed files', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    execSync('git mv README.md RENAMED.md', { cwd: tempDir, stdio: 'ignore' })

    const result = await git.status()

    assert.strictEqual(result.renamed.length, 1)
    assert.strictEqual(result.renamed[0].from, 'README.md')
    assert.strictEqual(result.renamed[0].to, 'RENAMED.md')
  })

  it('diff returns unified diff string', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    writeFileSync(join(tempDir, 'README.md'), '# Modified content\n')

    const result = await git.diff([])

    assert.ok(result.includes('Modified content'))
  })

  it('show returns file content at ref', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    writeFileSync(join(tempDir, 'show-test.txt'), 'show content\n')
    execSync('git add show-test.txt', { cwd: tempDir, stdio: 'ignore' })

    const result = await git.show([':show-test.txt'])

    assert.strictEqual(result, 'show content\n')
  })

  it('showBinary returns Buffer', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    writeFileSync(join(tempDir, 'binary.bin'), binaryContent)
    execSync('git add binary.bin', { cwd: tempDir, stdio: 'ignore' })

    const result = await git.showBinary([':binary.bin'])

    assert.ok(Buffer.isBuffer(result))
    assert.ok(result.equals(binaryContent))
  })

  it('add stages files', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    writeFileSync(join(tempDir, 'to-add.txt'), 'add me\n')

    await git.add(['to-add.txt'])

    const status = await git.status()
    assert.ok(status.staged.includes('to-add.txt'))
  })

  it('reset unstages files', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    writeFileSync(join(tempDir, 'to-reset.txt'), 'reset me\n')
    execSync('git add to-reset.txt', { cwd: tempDir, stdio: 'ignore' })

    await git.reset(['HEAD', '--', 'to-reset.txt'])

    const status = await git.status()
    assert.ok(!status.staged.includes('to-reset.txt'))
    assert.ok(status.notAdded.includes('to-reset.txt'))
  })

  it('branch returns branch listing', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    const result = await git.branch(['-a', '-v'])

    assert.ok(result.includes('main') || result.includes('master'))
  })

  it('getRemotes returns empty array for local repo', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    const result = await git.getRemotes()

    assert.deepStrictEqual(result, [])
  })

  it('getRemotes returns remotes with refs', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    execSync('git remote add origin https://example.com/repo.git', { cwd: tempDir, stdio: 'ignore' })

    const result = await git.getRemotes()

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].name, 'origin')
    assert.ok(result[0].refs)
    assert.ok(result[0].refs!.fetch?.includes('example.com'))
    assert.ok(result[0].refs!.push?.includes('example.com'))
  })

  it('raw executes arbitrary git commands', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    const result = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD'])

    assert.ok(result.includes('README.md'))
  })

  it('statusPorcelain returns porcelain v2 output', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    writeFileSync(join(tempDir, 'README.md'), '# Changed\n')

    const result = await git.statusPorcelain()

    assert.ok(result.length > 0)
    assert.ok(result.includes('README.md'))
  })

  it('statusPorcelain returns empty for clean repo', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    const result = await git.statusPorcelain()

    assert.strictEqual(result.trim(), '')
  })

  it('revparse throws on non-git directory', async (t) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'not-a-git-repo-'))
    t.after(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })
    const git = createGitAdapter(tempDir)

    await assert.rejects(
      () => git.revparse(['--git-dir']),
      (err: Error) => {
        assert.ok(err.message.includes('git'))
        return true
      }
    )
  })

  it('getConfigValue returns configured value', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    const email = await git.getConfigValue('user.email')
    assert.strictEqual(email, 'test@test.com')
  })

  it('getConfigValue returns null for missing key', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    const result = await git.getConfigValue('nonexistent.key')
    assert.strictEqual(result, null)
  })

  it('show throws for nonexistent ref', async (t) => {
    const tempDir = createTestRepoWithCommit(t)
    const git = createGitAdapter(tempDir)

    await assert.rejects(
      () => git.show(['nonexistent-ref:nonexistent-file']),
    )
  })
})

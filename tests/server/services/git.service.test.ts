import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitService } from '../../../src/server/services/git.service.ts'
import { createFakeGitPort } from '../helpers.ts'

// Canned git log output: 5 commits in %H|%s|%an|%ai format
const FAKE_LOG_OUTPUT = [
  'aaaa000000000000000000000000000000000001|Fifth commit|Test Author|2025-01-05 12:00:00 +0000',
  'aaaa000000000000000000000000000000000002|Fourth commit|Test Author|2025-01-04 12:00:00 +0000',
  'aaaa000000000000000000000000000000000003|Third commit|Test Author|2025-01-03 12:00:00 +0000',
  'aaaa000000000000000000000000000000000004|Second commit|Test Author|2025-01-02 12:00:00 +0000',
  'aaaa000000000000000000000000000000000005|First commit|Test Author|2025-01-01 12:00:00 +0000',
].join('\n')

const FAKE_DIFF_CONTENT = `diff --git a/file5.txt b/file5.txt
new file mode 100644
--- /dev/null
+++ b/file5.txt
@@ -0,0 +1 @@
+content 5`

function fakeRawForLog (args: string[]): string {
  if (args[0] !== 'log') return ''
  const skipArg = args.find(a => a.startsWith('--skip='))
  const skip = skipArg ? parseInt(skipArg.split('=')[1], 10) : 0
  const limitArg = args.find(a => /^-\d+$/.test(a))
  const limit = limitArg ? parseInt(limitArg.slice(1), 10) : 21

  const allLines = FAKE_LOG_OUTPUT.split('\n')

  const grepArg = args.find(a => a.startsWith('--grep='))
  let filtered = allLines
  if (grepArg) {
    const search = grepArg.split('=')[1].toLowerCase()
    filtered = allLines.filter(line => line.toLowerCase().includes(search))
  }

  return filtered.slice(skip, skip + limit).join('\n')
}

describe('git.service', () => {
  describe('getCommits', () => {
    it('should return an array of commits', async () => {
      const git = createFakeGitPort({ raw: async (args) => fakeRawForLog(args) })
      const service = new GitService(git, '/fake/repo')
      const result = await service.getCommits({ limit: 5 })
      assert.ok(Array.isArray(result.commits))
      assert.ok(result.commits.length > 0)
      assert.ok(result.commits.length <= 5)
      assert.ok(typeof result.hasMore === 'boolean')
    })

    it('should return commits with required properties', async () => {
      const git = createFakeGitPort({ raw: async (args) => fakeRawForLog(args) })
      const service = new GitService(git, '/fake/repo')
      const result = await service.getCommits({ limit: 1 })
      assert.strictEqual(result.commits.length, 1)
      const commit = result.commits[0]
      assert.ok(typeof commit.sha === 'string')
      assert.strictEqual(commit.sha.length, 40, 'SHA should be 40 characters')
      assert.ok(typeof commit.message === 'string')
      assert.ok(typeof commit.author === 'string')
      assert.ok(typeof commit.date === 'string')
    })

    it('should respect the limit parameter', async () => {
      const git = createFakeGitPort({ raw: async (args) => fakeRawForLog(args) })
      const service = new GitService(git, '/fake/repo')
      const result3 = await service.getCommits({ limit: 3 })
      const result10 = await service.getCommits({ limit: 10 })
      assert.ok(result3.commits.length <= 3)
      assert.ok(result10.commits.length <= 10)
      assert.ok(result10.commits.length >= result3.commits.length)
    })

    it('should return commits in order (newest first)', async () => {
      const git = createFakeGitPort({ raw: async (args) => fakeRawForLog(args) })
      const service = new GitService(git, '/fake/repo')
      const result = await service.getCommits({ limit: 5 })
      if (result.commits.length >= 2) {
        const date1 = new Date(result.commits[0].date)
        const date2 = new Date(result.commits[1].date)
        assert.ok(date1 >= date2, 'Commits should be ordered newest first')
      }
    })

    it('should support offset for pagination', async () => {
      const git = createFakeGitPort({ raw: async (args) => fakeRawForLog(args) })
      const service = new GitService(git, '/fake/repo')
      const firstPage = await service.getCommits({ limit: 2, offset: 0 })
      const secondPage = await service.getCommits({ limit: 2, offset: 2 })
      assert.strictEqual(firstPage.commits.length, 2)
      assert.ok(secondPage.commits.length >= 1)
      assert.notStrictEqual(firstPage.commits[0].sha, secondPage.commits[0].sha)
    })

    it('should indicate hasMore when there are more commits', async () => {
      const git = createFakeGitPort({ raw: async (args) => fakeRawForLog(args) })
      const service = new GitService(git, '/fake/repo')
      const result = await service.getCommits({ limit: 1 })
      assert.strictEqual(result.hasMore, true)
    })
  })

  describe('getCommitsDiff', () => {
    it('should return empty string for empty commits array', async () => {
      const git = createFakeGitPort()
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getCommitsDiff([])
      assert.strictEqual(diff, '')
    })

    it('should return diff for a single commit', async () => {
      const git = createFakeGitPort({ show: async () => FAKE_DIFF_CONTENT })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getCommitsDiff(['aaaa000000000000000000000000000000000001'])
      assert.ok(typeof diff === 'string')
      assert.ok(diff.length > 0, 'Diff should have content')
    })

    it('should return combined diff for multiple commits', async () => {
      const git = createFakeGitPort({ show: async () => FAKE_DIFF_CONTENT })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getCommitsDiff([
        'aaaa000000000000000000000000000000000001',
        'aaaa000000000000000000000000000000000002',
      ])
      assert.ok(typeof diff === 'string')
      assert.ok(diff.length > 0, 'Combined diff should have content')
    })

    it('should handle commits in any order', async () => {
      let callCount = 0
      const git = createFakeGitPort({
        show: async () => { callCount++; return FAKE_DIFF_CONTENT },
      })
      const service = new GitService(git, '/fake/repo')
      const diff1 = await service.getCommitsDiff(['sha1'.padEnd(40, '0'), 'sha2'.padEnd(40, '0')])
      const calls1 = callCount
      callCount = 0
      const diff2 = await service.getCommitsDiff(['sha2'.padEnd(40, '0'), 'sha1'.padEnd(40, '0')])
      assert.ok(diff1.length > 0)
      assert.ok(diff2.length > 0)
      assert.strictEqual(calls1, 2)
      assert.strictEqual(callCount, 2)
    })
  })

  describe('getCommitsFileDiff', () => {
    it('should return empty string for empty commits array', async () => {
      const git = createFakeGitPort()
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getCommitsFileDiff([], 'some-file.ts')
      assert.strictEqual(diff, '')
    })

    it('should return diff for a specific file in a commit', async () => {
      const fileDiff = `diff --git a/src.ts b/src.ts
new file mode 100644
--- /dev/null
+++ b/src.ts
@@ -0,0 +1 @@
+const x = 1;`
      const git = createFakeGitPort({
        show: async (args) => {
          if (args.includes('src.ts')) return fileDiff
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getCommitsFileDiff(['a'.repeat(40)], 'src.ts')
      assert.ok(diff.includes('src.ts'))
      assert.ok(diff.includes('+const x = 1;'))
    })

    it('should return empty string for non-existent file', async () => {
      const git = createFakeGitPort({ show: async () => '' })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getCommitsFileDiff(['a'.repeat(40)], 'non-existent.ts')
      assert.strictEqual(diff, '')
    })

    it('should combine diffs from multiple commits for same file', async () => {
      const git = createFakeGitPort({
        show: async () => 'diff --git a/src.ts b/src.ts\n+change',
      })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getCommitsFileDiff(['a'.repeat(40), 'b'.repeat(40)], 'src.ts')
      assert.ok(typeof diff === 'string')
      assert.ok(diff.includes('src.ts'))
    })
  })

  describe('getBranchFileDiff', () => {
    it('should return diff for a specific file between branches', async () => {
      const branchDiff = `diff --git a/feature.ts b/feature.ts
new file mode 100644
--- /dev/null
+++ b/feature.ts
@@ -0,0 +1 @@
+const y = 1;`
      const git = createFakeGitPort({
        diff: async (args) => {
          if (args.some(a => a.includes('...'))) return branchDiff
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getBranchFileDiff('main', 'feature.ts')
      assert.ok(diff.includes('feature.ts'))
      assert.ok(diff.includes('+const y = 1;'))
    })

    it('should return empty string for file not changed in branch', async () => {
      const git = createFakeGitPort({ diff: async () => '' })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getBranchFileDiff('main', 'README.md')
      assert.strictEqual(diff.trim(), '')
    })

    it('should return empty string for non-existent branch', async () => {
      const git = createFakeGitPort({
        diff: async () => { throw new Error('fatal: bad revision') },
      })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getBranchFileDiff('non-existent-branch', 'README.md')
      assert.strictEqual(diff, '')
    })
  })

  describe('getBranches', () => {
    it('should return an array of branches', async () => {
      const git = createFakeGitPort({
        branch: async () => '* main abc1234 Initial commit\n',
      })
      const service = new GitService(git, '/fake/repo')
      const branches = await service.getBranches()
      assert.ok(Array.isArray(branches))
      assert.ok(branches.length > 0, 'Should have at least one branch')
    })

    it('should have one current branch', async () => {
      const git = createFakeGitPort({
        branch: async () => '* main abc1234 Initial commit\n  feature def5678 Add feature\n',
      })
      const service = new GitService(git, '/fake/repo')
      const branches = await service.getBranches()
      const currentBranches = branches.filter(b => b.isCurrent)
      assert.strictEqual(currentBranches.length, 1, 'Should have exactly one current branch')
    })

    it('should return branches with required properties', async () => {
      const git = createFakeGitPort({
        branch: async () => '* main abc1234 Initial commit\n',
      })
      const service = new GitService(git, '/fake/repo')
      const branches = await service.getBranches()
      for (const branch of branches) {
        assert.ok(typeof branch.name === 'string')
        assert.ok(typeof branch.isRemote === 'boolean')
        assert.ok(typeof branch.isCurrent === 'boolean')
      }
    })
  })

  describe('isRepo', () => {
    it('should return true for a git repository', async () => {
      const git = createFakeGitPort({ revparse: async () => '.git' })
      const service = new GitService(git, '/fake/repo')
      const result = await service.isRepo()
      assert.strictEqual(result, true)
    })

    it('should return false for a non-git directory', async () => {
      const git = createFakeGitPort({
        revparse: async () => { throw new Error('fatal: not a git repository') },
      })
      const service = new GitService(git, '/tmp')
      const result = await service.isRepo()
      assert.strictEqual(result, false)
    })
  })

  describe('hasCommits', () => {
    it('should return true for a repository with commits', async () => {
      const git = createFakeGitPort({
        revparse: async (args) => {
          if (args.includes('HEAD')) return 'a'.repeat(40)
          return '.git'
        },
      })
      const service = new GitService(git, '/fake/repo')
      const result = await service.hasCommits()
      assert.strictEqual(result, true)
    })

    it('should return false for a non-git directory', async () => {
      const git = createFakeGitPort({
        revparse: async () => { throw new Error('fatal: not a git repository') },
      })
      const service = new GitService(git, '/tmp')
      const result = await service.hasCommits()
      assert.strictEqual(result, false)
    })
  })

  describe('getCurrentBranch', () => {
    it('should return the current branch name', async () => {
      const git = createFakeGitPort({ revparse: async () => 'main' })
      const service = new GitService(git, '/fake/repo')
      const branch = await service.getCurrentBranch()
      assert.ok(typeof branch === 'string')
      assert.ok(branch.length > 0)
    })
  })

  describe('getUnstagedFiles', () => {
    it('should return empty array when no unstaged changes', async () => {
      const git = createFakeGitPort()
      const service = new GitService(git, '/fake/repo')
      const files = await service.getUnstagedFiles()
      assert.deepStrictEqual(files, [])
    })

    it('should return modified files', async () => {
      const git = createFakeGitPort({
        status: async () => ({
          staged: [],
          modified: ['README.md'],
          created: [],
          deleted: [],
          renamed: [],
          notAdded: [],
        }),
      })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getUnstagedFiles()
      assert.strictEqual(files.length, 1)
      assert.strictEqual(files[0].path, 'README.md')
      assert.strictEqual(files[0].status, 'modified')
    })

    it('should return untracked files', async () => {
      const git = createFakeGitPort({
        status: async () => ({
          staged: [],
          modified: [],
          created: [],
          deleted: [],
          renamed: [],
          notAdded: ['new-file.txt'],
        }),
      })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getUnstagedFiles()
      assert.strictEqual(files.length, 1)
      assert.strictEqual(files[0].path, 'new-file.txt')
      assert.strictEqual(files[0].status, 'untracked')
    })
  })

  describe('hasUnstagedChanges', () => {
    it('should return false when no unstaged changes', async () => {
      const git = createFakeGitPort()
      const service = new GitService(git, '/fake/repo')
      const result = await service.hasUnstagedChanges()
      assert.strictEqual(result, false)
    })

    it('should return true when there are modified files', async () => {
      const git = createFakeGitPort({
        status: async () => ({
          staged: [],
          modified: ['README.md'],
          created: [],
          deleted: [],
          renamed: [],
          notAdded: [],
        }),
      })
      const service = new GitService(git, '/fake/repo')
      const result = await service.hasUnstagedChanges()
      assert.strictEqual(result, true)
    })

    it('should return true when there are untracked files', async () => {
      const git = createFakeGitPort({
        status: async () => ({
          staged: [],
          modified: [],
          created: [],
          deleted: [],
          renamed: [],
          notAdded: ['new-file.txt'],
        }),
      })
      const service = new GitService(git, '/fake/repo')
      const result = await service.hasUnstagedChanges()
      assert.strictEqual(result, true)
    })
  })

  describe('getUnstagedDiff', () => {
    it('should return empty string when no unstaged changes', async () => {
      const git = createFakeGitPort({
        diff: async () => '',
        status: async () => ({
          staged: [],
          modified: [],
          created: [],
          deleted: [],
          renamed: [],
          notAdded: [],
        }),
      })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getUnstagedDiff()
      assert.strictEqual(diff, '')
    })

    it('should return diff for modified files', async () => {
      const trackedDiff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-# Test
+# Updated content`
      const git = createFakeGitPort({
        diff: async () => trackedDiff,
        status: async () => ({
          staged: [],
          modified: ['README.md'],
          created: [],
          deleted: [],
          renamed: [],
          notAdded: [],
        }),
      })
      const service = new GitService(git, '/fake/repo')
      const diff = await service.getUnstagedDiff()
      assert.ok(diff.includes('README.md'))
      assert.ok(diff.includes('-# Test'))
      assert.ok(diff.includes('+# Updated content'))
    })

    it('should include untracked files in diff', async (t) => {
      // Needs a real temp dir because getUnstagedDiff reads untracked files from disk
      const tempDir = mkdtempSync(join(tmpdir(), 'git-service-test-'))
      t.after(() => rmSync(tempDir, { recursive: true, force: true }))
      writeFileSync(join(tempDir, 'new-file.txt'), 'line 1\nline 2\n')

      const git = createFakeGitPort({
        diff: async () => '',
        status: async () => ({
          staged: [],
          modified: [],
          created: [],
          deleted: [],
          renamed: [],
          notAdded: ['new-file.txt'],
        }),
      })
      const service = new GitService(git, tempDir)
      const diff = await service.getUnstagedDiff()
      assert.ok(diff.includes('new-file.txt'), 'should include new file name')
      assert.ok(diff.includes('new file mode'), 'should indicate new file')
      assert.ok(diff.includes('+line 1'), 'should show new file content as added')
      assert.ok(diff.includes('+line 2'), 'should show all lines as added')
    })
  })

  describe('stageFile', () => {
    it('should stage a single file', async () => {
      const addCalls: string[][] = []
      const git = createFakeGitPort({
        add: async (args) => { addCalls.push(args) },
      })
      const service = new GitService(git, '/fake/repo')
      await service.stageFile('new-file.txt')
      assert.strictEqual(addCalls.length, 1)
      assert.deepStrictEqual(addCalls[0], ['new-file.txt'])
    })
  })

  describe('stageFiles', () => {
    it('should stage multiple files', async () => {
      const addCalls: string[][] = []
      const git = createFakeGitPort({
        add: async (args) => { addCalls.push(args) },
      })
      const service = new GitService(git, '/fake/repo')
      await service.stageFiles(['file1.txt', 'file2.txt'])
      assert.strictEqual(addCalls.length, 1)
      assert.deepStrictEqual(addCalls[0], ['file1.txt', 'file2.txt'])
    })

    it('should do nothing when passed empty array', async () => {
      const addCalls: string[][] = []
      const git = createFakeGitPort({
        add: async (args) => { addCalls.push(args) },
      })
      const service = new GitService(git, '/fake/repo')
      await service.stageFiles([])
      assert.strictEqual(addCalls.length, 0)
    })
  })

  describe('stageAll', () => {
    it('should stage all changes including untracked files', async () => {
      const addCalls: string[][] = []
      const git = createFakeGitPort({
        add: async (args) => { addCalls.push(args) },
      })
      const service = new GitService(git, '/fake/repo')
      await service.stageAll()
      assert.strictEqual(addCalls.length, 1)
      assert.deepStrictEqual(addCalls[0], ['-A'])
    })
  })

  describe('unstageFile', () => {
    it('should unstage a file', async () => {
      const resetCalls: string[][] = []
      const git = createFakeGitPort({
        reset: async (args) => { resetCalls.push(args) },
      })
      const service = new GitService(git, '/fake/repo')
      await service.unstageFile('new-file.txt')
      assert.strictEqual(resetCalls.length, 1)
      assert.deepStrictEqual(resetCalls[0], ['HEAD', '--', 'new-file.txt'])
    })
  })

  describe('getFilesAtRef', () => {
    it('should return all files at HEAD', async () => {
      const git = createFakeGitPort({
        raw: async (args) => {
          if (args[0] === 'ls-tree') return 'README.md\nsrc/index.ts\n'
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getFilesAtRef('HEAD')
      assert.ok(Array.isArray(files))
      assert.ok(files.length > 0, 'Should have at least one file')
      assert.ok(files.includes('README.md'), 'Should include README.md')
    })

    it('should return files at a specific commit SHA', async () => {
      const git = createFakeGitPort({
        raw: async (args) => {
          if (args[0] === 'ls-tree') return 'README.md\n'
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getFilesAtRef('a'.repeat(40))
      assert.ok(Array.isArray(files))
      assert.ok(files.length > 0)
    })

    it('should throw for invalid ref', async () => {
      const git = createFakeGitPort({
        raw: async () => { throw new Error('fatal: not a valid object name') },
      })
      const service = new GitService(git, '/fake/repo')
      await assert.rejects(
        async () => service.getFilesAtRef('invalid-ref-that-does-not-exist-xyz'),
        { message: /fatal|not a valid/ }
      )
    })

    it('should return files from test repo', async () => {
      const git = createFakeGitPort({
        raw: async (args) => {
          if (args[0] === 'ls-tree') return 'README.md\nsrc/index.ts\n'
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getFilesAtRef('HEAD')
      assert.ok(files.includes('README.md'), 'Should include README.md')
      assert.ok(files.includes('src/index.ts'), 'Should include src/index.ts')
      assert.strictEqual(files.length, 2)
    })
  })

  describe('getWorkingDirectoryNewFiles', () => {
    it('should return empty array when no new files', async () => {
      const git = createFakeGitPort({ raw: async () => '' })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getWorkingDirectoryNewFiles()
      assert.deepStrictEqual(files, [])
    })

    it('should return untracked files', async () => {
      const git = createFakeGitPort({
        raw: async (args) => {
          if (args.includes('--others')) return 'new-file.txt\n'
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getWorkingDirectoryNewFiles()
      assert.ok(files.includes('new-file.txt'), 'Should include untracked file')
    })

    it('should return staged new files', async () => {
      const git = createFakeGitPort({
        raw: async (args) => {
          if (args.includes('--diff-filter=A')) return 'staged-new.txt\n'
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getWorkingDirectoryNewFiles()
      assert.ok(files.includes('staged-new.txt'), 'Should include staged new file')
    })

    it('should return both untracked and staged new files', async () => {
      const git = createFakeGitPort({
        raw: async (args) => {
          if (args.includes('--diff-filter=A')) return 'staged.txt\n'
          if (args.includes('--others')) return 'untracked.txt\n'
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getWorkingDirectoryNewFiles()
      assert.ok(files.includes('untracked.txt'), 'Should include untracked file')
      assert.ok(files.includes('staged.txt'), 'Should include staged new file')
      assert.strictEqual(files.length, 2)
    })

    it('should not include modified files', async () => {
      const git = createFakeGitPort({ raw: async () => '' })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getWorkingDirectoryNewFiles()
      assert.ok(!files.includes('README.md'), 'Should not include modified file')
      assert.strictEqual(files.length, 0)
    })

    it('should handle files in subdirectories', async () => {
      const git = createFakeGitPort({
        raw: async (args) => {
          if (args.includes('--others')) return 'src/utils/helper.ts\n'
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const files = await service.getWorkingDirectoryNewFiles()
      assert.ok(files.includes('src/utils/helper.ts'), 'Should include file with full path')
    })
  })

  describe('getWorkingFileContent - directory traversal prevention', () => {
    function setupTempDir (t: { after: (fn: () => void) => void }): string {
      const tempDir = mkdtempSync(join(tmpdir(), 'git-service-test-'))
      writeFileSync(join(tempDir, 'README.md'), '# Test\n')
      t.after(() => rmSync(tempDir, { recursive: true, force: true }))
      return tempDir
    }

    it('should return file contents for a valid relative path', async (t) => {
      const tempDir = setupTempDir(t)
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingFileContent('README.md')
      assert.strictEqual(content, '# Test\n')
    })

    it('should return file contents for a valid nested path', async (t) => {
      const tempDir = setupTempDir(t)
      mkdirSync(join(tempDir, 'src'))
      writeFileSync(join(tempDir, 'src/index.ts'), 'export const x = 1;\n')
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingFileContent('src/index.ts')
      assert.strictEqual(content, 'export const x = 1;\n')
    })

    it('should return file contents for a dot-normalized path that stays inside repo', async (t) => {
      const tempDir = setupTempDir(t)
      mkdirSync(join(tempDir, 'src'))
      writeFileSync(join(tempDir, 'src/index.ts'), 'export const x = 1;\n')
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingFileContent('./src/../src/index.ts')
      assert.strictEqual(content, 'export const x = 1;\n')
    })

    it('should block simple traversal with ../', async (t) => {
      const tempDir = setupTempDir(t)
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingFileContent('../etc/passwd')
      assert.strictEqual(content, null)
    })

    it('should block deep traversal with ../../', async (t) => {
      const tempDir = setupTempDir(t)
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingFileContent('../../etc/passwd')
      assert.strictEqual(content, null)
    })

    it('should block mixed traversal like src/../../etc/passwd', async (t) => {
      const tempDir = setupTempDir(t)
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingFileContent('src/../../etc/passwd')
      assert.strictEqual(content, null)
    })

    it('should block absolute paths outside repo', async (t) => {
      const tempDir = setupTempDir(t)
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingFileContent('/etc/passwd')
      assert.strictEqual(content, null)
    })

    it('should return null for nonexistent file', async (t) => {
      const tempDir = setupTempDir(t)
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingFileContent('no-such-file.txt')
      assert.strictEqual(content, null)
    })

    it('should log a warning when traversal is blocked', async (t) => {
      const tempDir = setupTempDir(t)
      const warnings: unknown[] = []
      const logger = {
        debug: () => {},
        warn: (obj: unknown, _msg: string) => warnings.push(obj),
      }
      const service = new GitService(createFakeGitPort(), tempDir, logger)
      await service.getWorkingFileContent('../etc/passwd')
      assert.strictEqual(warnings.length, 1)
      assert.deepStrictEqual((warnings[0] as Record<string, string>).filePath, '../etc/passwd')
    })

    it('should not crash when traversal is blocked without a logger', async (t) => {
      const tempDir = setupTempDir(t)
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingFileContent('../etc/passwd')
      assert.strictEqual(content, null)
    })
  })

  describe('getWorkingBinaryContent - directory traversal prevention', () => {
    it('should return buffer for a valid binary file', async (t) => {
      const tempDir = mkdtempSync(join(tmpdir(), 'git-service-test-'))
      t.after(() => rmSync(tempDir, { recursive: true, force: true }))
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
      writeFileSync(join(tempDir, 'image.png'), binaryData)
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingBinaryContent('image.png')
      assert.ok(Buffer.isBuffer(content))
      assert.ok(content.equals(binaryData))
    })

    it('should block traversal with ../', async (t) => {
      const tempDir = mkdtempSync(join(tmpdir(), 'git-service-test-'))
      t.after(() => rmSync(tempDir, { recursive: true, force: true }))
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingBinaryContent('../outside.bin')
      assert.strictEqual(content, null)
    })

    it('should block absolute paths outside repo', async (t) => {
      const tempDir = mkdtempSync(join(tmpdir(), 'git-service-test-'))
      t.after(() => rmSync(tempDir, { recursive: true, force: true }))
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingBinaryContent('/etc/passwd')
      assert.strictEqual(content, null)
    })

    it('should block mixed traversal', async (t) => {
      const tempDir = mkdtempSync(join(tmpdir(), 'git-service-test-'))
      t.after(() => rmSync(tempDir, { recursive: true, force: true }))
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingBinaryContent('src/../../etc/passwd')
      assert.strictEqual(content, null)
    })

    it('should return null for nonexistent file', async (t) => {
      const tempDir = mkdtempSync(join(tmpdir(), 'git-service-test-'))
      t.after(() => rmSync(tempDir, { recursive: true, force: true }))
      const service = new GitService(createFakeGitPort(), tempDir)
      const content = await service.getWorkingBinaryContent('no-such-file.bin')
      assert.strictEqual(content, null)
    })
  })

  describe('sanitizeSearch - regex injection prevention', () => {
    it('should pass through normal search text', async () => {
      const git = createFakeGitPort({
        raw: async (args) => {
          const grepArg = args.find((a: string) => a.startsWith('--grep='))
          if (grepArg && grepArg.includes('First')) {
            return 'a'.repeat(40) + '|First commit|Author|2025-01-01 12:00:00 +0000'
          }
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const result = await service.getCommits({ limit: 10, search: 'First' })
      assert.ok(result.commits.length >= 1)
      assert.ok(result.commits.some(c => c.message.includes('First')))
    })

    it('should not crash with regex metacharacters in search', async () => {
      const git = createFakeGitPort({ raw: async () => '' })
      const service = new GitService(git, '/fake/repo')
      const result = await service.getCommits({ limit: 10, search: '*+?[]{}()^$|\\' })
      assert.ok(Array.isArray(result.commits))
    })

    it('should handle very long search strings without error', async () => {
      const git = createFakeGitPort({ raw: async () => '' })
      const service = new GitService(git, '/fake/repo')
      const longSearch = 'a'.repeat(150)
      const result = await service.getCommits({ limit: 10, search: longSearch })
      assert.ok(Array.isArray(result.commits))
    })

    it('should preserve safe punctuation in search', async () => {
      const git = createFakeGitPort({
        raw: async (args) => {
          const grepArg = args.find((a: string) => a.startsWith('--grep='))
          if (grepArg && grepArg.includes("it's")) {
            return 'a'.repeat(40) + "|it's a \"test\"|Author|2025-01-01 12:00:00 +0000"
          }
          return ''
        },
      })
      const service = new GitService(git, '/fake/repo')
      const result = await service.getCommits({ limit: 10, search: "it's" })
      assert.ok(result.commits.length >= 1)
    })
  })

  describe('logger injection', () => {
    it('should accept an optional logger in the constructor', () => {
      const messages: string[] = []
      const logger = {
        debug: (_obj: unknown, msg: string) => messages.push(msg),
        warn: (_obj: unknown, msg: string) => messages.push(msg),
      }
      const service = new GitService(createFakeGitPort(), '/fake/repo', logger)
      assert.ok(service)
    })

    it('should use the injected logger for debug messages', async () => {
      const messages: Array<{ level: string; msg: string }> = []
      const logger = {
        debug: (_obj: unknown, msg: string) => messages.push({ level: 'debug', msg }),
        warn: (_obj: unknown, msg: string) => messages.push({ level: 'warn', msg }),
      }
      const git = createFakeGitPort({
        revparse: async () => { throw new Error('no commits') },
        getConfigValue: async () => 'main',
      })
      const service = new GitService(git, '/fake/repo', logger)
      await service.getCurrentBranch()
      assert.ok(messages.length > 0, 'Should have logged via injected logger')
      assert.ok(messages.some(m => m.level === 'debug'), 'Should have debug-level messages')
    })

    it('should work without a logger (backwards compatible)', () => {
      const service = new GitService(createFakeGitPort(), '/fake/repo')
      assert.ok(service)
    })
  })
})

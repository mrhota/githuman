/**
 * HunkResolver tests - using fakes (no real DB or git)
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { HunkResolver } from '../../../src/server/services/hunk-resolver.ts'
import type { Review } from '../../../src/shared/types.ts'

test('HunkResolver.resolve - returns stored hunks from fileRepo when hunksData exists', async () => {
  const fakeFileRepo = {
    findByReviewAndPath: (reviewId: string, path: string) => ({
      hunksData: JSON.stringify([
        {
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          lines: [{ type: 'added', content: 'const x = 1;', oldLine: null, newLine: 1 }],
        },
      ]),
    }),
  }
  const fakeGit = {}
  const resolver = new HunkResolver(fakeFileRepo as any, fakeGit as any)

  const review: Review = {
    id: 'review-1',
    repositoryPath: '/test',
    baseRef: 'abc123',
    sourceType: 'staged',
    sourceRef: null,
    status: 'in_progress',
    snapshotData: '{}',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }

  const hunks = await resolver.resolve(review, 'file.ts')

  assert.strictEqual(hunks.length, 1)
  assert.strictEqual(hunks[0].newStart, 1)
  assert.strictEqual(hunks[0].lines.length, 1)
  assert.strictEqual(hunks[0].lines[0].content, 'const x = 1;')
})

test('HunkResolver.resolve - regenerates hunks from branch when sourceType is branch', async () => {
  const fakeFileRepo = {
    findByReviewAndPath: () => null, // No stored hunks
  }
  const fakeGit = {
    getBranchFileDiff: async (branch: string, path: string) => {
      return `diff --git a/file.ts b/file.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/file.ts
@@ -0,0 +1 @@
+const z = 3;
`
    },
  }
  const resolver = new HunkResolver(fakeFileRepo as any, fakeGit as any)

  const review: Review = {
    id: 'review-1',
    repositoryPath: '/test',
    baseRef: 'abc123',
    sourceType: 'branch',
    sourceRef: 'feature-branch',
    status: 'in_progress',
    snapshotData: '{}',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }

  const hunks = await resolver.resolve(review, 'file.ts')

  assert.strictEqual(hunks.length, 1)
  assert.strictEqual(hunks[0].newStart, 1)
  assert.strictEqual(hunks[0].newLines, 1)
  assert.strictEqual(hunks[0].lines.length, 1)
  assert.strictEqual(hunks[0].lines[0].type, 'added')
  assert.strictEqual(hunks[0].lines[0].content, 'const z = 3;')
})

test('HunkResolver.resolve - regenerates hunks from commits when sourceType is commits', async () => {
  const fakeFileRepo = {
    findByReviewAndPath: () => null, // No stored hunks
  }
  const fakeGit = {
    getCommitsFileDiff: async (commits: string[], path: string) => {
      return `diff --git a/file.ts b/file.ts
new file mode 100644
index 0000000..xyz5678
--- /dev/null
+++ b/file.ts
@@ -0,0 +1,2 @@
+const a = 1;
+const b = 2;
`
    },
  }
  const resolver = new HunkResolver(fakeFileRepo as any, fakeGit as any)

  const review: Review = {
    id: 'review-1',
    repositoryPath: '/test',
    baseRef: 'abc123',
    sourceType: 'commits',
    sourceRef: 'commit1,commit2',
    status: 'in_progress',
    snapshotData: '{}',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }

  const hunks = await resolver.resolve(review, 'file.ts')

  assert.strictEqual(hunks.length, 1)
  assert.strictEqual(hunks[0].newStart, 1)
  assert.strictEqual(hunks[0].newLines, 2)
  assert.strictEqual(hunks[0].lines.length, 2)
  assert.strictEqual(hunks[0].lines[0].content, 'const a = 1;')
  assert.strictEqual(hunks[0].lines[1].content, 'const b = 2;')
})

test('HunkResolver.resolve - falls back to V1 snapshot when no stored hunks and sourceType is staged', async () => {
  const fakeFileRepo = {
    findByReviewAndPath: () => null, // No stored hunks
  }
  const fakeGit = {}
  const resolver = new HunkResolver(fakeFileRepo as any, fakeGit as any)

  // V1 snapshot with files in snapshot data
  const review: Review = {
    id: 'review-1',
    repositoryPath: '/test',
    baseRef: 'abc123',
    sourceType: 'staged',
    sourceRef: null,
    status: 'in_progress',
    snapshotData: JSON.stringify({
      repository: { name: 'test-repo', path: '/test', branch: 'main' },
      files: [
        {
          oldPath: 'file.ts',
          newPath: 'file.ts',
          changeType: 'modify',
          additions: 1,
          deletions: 0,
          hunks: [
            {
              oldStart: 1,
              oldLines: 0,
              newStart: 1,
              newLines: 1,
              lines: [{ type: 'added', content: 'const legacy = true;', oldLine: null, newLine: 1 }],
            },
          ],
        },
      ],
      summary: { files: 1, additions: 1, deletions: 0 },
    }),
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }

  const hunks = await resolver.resolve(review, 'file.ts')

  assert.strictEqual(hunks.length, 1)
  assert.strictEqual(hunks[0].lines[0].content, 'const legacy = true;')
})

test('HunkResolver.resolve - returns empty array when no hunks found anywhere', async () => {
  const fakeFileRepo = {
    findByReviewAndPath: () => null, // No stored hunks
  }
  const fakeGit = {}
  const resolver = new HunkResolver(fakeFileRepo as any, fakeGit as any)

  // V2 snapshot with no files in snapshot data
  const review: Review = {
    id: 'review-1',
    repositoryPath: '/test',
    baseRef: 'abc123',
    sourceType: 'staged',
    sourceRef: null,
    status: 'in_progress',
    snapshotData: JSON.stringify({
      repository: { name: 'test-repo', path: '/test', branch: 'main' },
      version: 2,
    }),
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }

  const hunks = await resolver.resolve(review, 'file.ts')

  assert.strictEqual(hunks.length, 0)
})

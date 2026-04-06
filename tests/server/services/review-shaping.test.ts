/**
 * Tests for review-shaping pure functions
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Review, DiffFile } from '../../../src/shared/types.ts'
import type { DiffFileMetadata } from '../../../src/server/services/review.service.ts'
import {
  computeDiffSummary,
  toReviewWithDetails,
  toReviewListItem,
} from '../../../src/server/services/review-shaping.ts'

describe('computeDiffSummary', () => {
  test('computes summary from empty array', () => {
    const result = computeDiffSummary([])
    assert.deepEqual(result, {
      totalFiles: 0,
      totalAdditions: 0,
      totalDeletions: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesRenamed: 0,
    })
  })

  test('computes summary from single file', () => {
    const files: DiffFileMetadata[] = [
      {
        oldPath: 'foo.ts',
        newPath: 'foo.ts',
        changeType: 'modified',
        additions: 10,
        deletions: 5,
      },
    ]
    const result = computeDiffSummary(files)
    assert.deepEqual(result, {
      totalFiles: 1,
      totalAdditions: 10,
      totalDeletions: 5,
      filesAdded: 0,
      filesModified: 1,
      filesDeleted: 0,
      filesRenamed: 0,
    })
  })

  test('computes summary from multiple files with different change types', () => {
    const files: DiffFileMetadata[] = [
      {
        oldPath: 'new.ts',
        newPath: 'new.ts',
        changeType: 'added',
        additions: 20,
        deletions: 0,
      },
      {
        oldPath: 'modified.ts',
        newPath: 'modified.ts',
        changeType: 'modified',
        additions: 5,
        deletions: 3,
      },
      {
        oldPath: 'deleted.ts',
        newPath: 'deleted.ts',
        changeType: 'deleted',
        additions: 0,
        deletions: 15,
      },
      {
        oldPath: 'old-name.ts',
        newPath: 'new-name.ts',
        changeType: 'renamed',
        additions: 2,
        deletions: 1,
      },
    ]
    const result = computeDiffSummary(files)
    assert.deepEqual(result, {
      totalFiles: 4,
      totalAdditions: 27,
      totalDeletions: 19,
      filesAdded: 1,
      filesModified: 1,
      filesDeleted: 1,
      filesRenamed: 1,
    })
  })
})

describe('toReviewWithDetails', () => {
  test('handles V2 snapshot with provided file metadata', () => {
    const review: Review = {
      id: 'review-1',
      repositoryPath: '/repo',
      baseRef: 'main',
      sourceType: 'branch',
      sourceRef: 'feature',
      status: 'in_progress',
      snapshotData: JSON.stringify({
        repository: {
          name: 'test-repo',
          branch: 'feature',
          remote: 'origin',
          path: '/repo',
        },
        version: 2,
      }),
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    }

    const fileMetadata: DiffFileMetadata[] = [
      {
        oldPath: 'foo.ts',
        newPath: 'foo.ts',
        changeType: 'modified',
        additions: 10,
        deletions: 5,
      },
      {
        oldPath: 'bar.ts',
        newPath: 'bar.ts',
        changeType: 'added',
        additions: 20,
        deletions: 0,
      },
    ]

    const result = toReviewWithDetails(review, fileMetadata)

    assert.equal(result.id, 'review-1')
    assert.equal(result.repositoryPath, '/repo')
    assert.equal(result.baseRef, 'main')
    assert.equal(result.sourceType, 'branch')
    assert.equal(result.sourceRef, 'feature')
    assert.equal(result.status, 'in_progress')
    assert.equal(result.createdAt, '2025-01-01T00:00:00.000Z')
    assert.equal(result.updatedAt, '2025-01-01T00:00:00.000Z')
    assert.deepEqual(result.repository, {
      name: 'test-repo',
      branch: 'feature',
      remote: 'origin',
      path: '/repo',
    })
    assert.deepEqual(result.files, fileMetadata)
    assert.deepEqual(result.summary, {
      totalFiles: 2,
      totalAdditions: 30,
      totalDeletions: 5,
      filesAdded: 1,
      filesModified: 1,
      filesDeleted: 0,
      filesRenamed: 0,
    })
  })

  test('handles V1 snapshot with embedded files', () => {
    const files: DiffFile[] = [
      {
        oldPath: 'foo.ts',
        newPath: 'foo.ts',
        changeType: 'modified',
        additions: 10,
        deletions: 5,
        hunks: [],
      },
      {
        oldPath: 'bar.ts',
        newPath: 'bar.ts',
        changeType: 'deleted',
        additions: 0,
        deletions: 15,
        hunks: [],
      },
    ]

    const review: Review = {
      id: 'review-2',
      repositoryPath: '/repo',
      baseRef: 'main',
      sourceType: 'staged',
      sourceRef: null,
      status: 'approved',
      snapshotData: JSON.stringify({
        repository: {
          name: 'legacy-repo',
          branch: 'main',
          remote: null,
          path: '/repo',
        },
        files,
      }),
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    }

    const result = toReviewWithDetails(review, [])

    assert.equal(result.id, 'review-2')
    assert.equal(result.repositoryPath, '/repo')
    assert.deepEqual(result.repository, {
      name: 'legacy-repo',
      branch: 'main',
      remote: null,
      path: '/repo',
    })
    assert.equal(result.files.length, 2)
    assert.deepEqual(result.files[0], {
      oldPath: 'foo.ts',
      newPath: 'foo.ts',
      changeType: 'modified',
      additions: 10,
      deletions: 5,
    })
    assert.deepEqual(result.files[1], {
      oldPath: 'bar.ts',
      newPath: 'bar.ts',
      changeType: 'deleted',
      additions: 0,
      deletions: 15,
    })
    assert.deepEqual(result.summary, {
      totalFiles: 2,
      totalAdditions: 10,
      totalDeletions: 20,
      filesAdded: 0,
      filesModified: 1,
      filesDeleted: 1,
      filesRenamed: 0,
    })
  })
})

describe('toReviewListItem', () => {
  test('handles V2 snapshot with provided file metadata', () => {
    const review: Review = {
      id: 'review-3',
      repositoryPath: '/repo',
      baseRef: 'main',
      sourceType: 'commits',
      sourceRef: 'abc123..def456',
      status: 'changes_requested',
      snapshotData: JSON.stringify({
        repository: {
          name: 'test-repo',
          branch: 'feature',
          remote: 'origin',
          path: '/repo',
        },
        version: 2,
      }),
      createdAt: '2025-01-03T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    }

    const fileMetadata: DiffFileMetadata[] = [
      {
        oldPath: 'a.ts',
        newPath: 'a.ts',
        changeType: 'added',
        additions: 100,
        deletions: 0,
      },
      {
        oldPath: 'b.ts',
        newPath: 'b.ts',
        changeType: 'modified',
        additions: 20,
        deletions: 10,
      },
    ]

    const result = toReviewListItem(review, fileMetadata)

    assert.equal(result.id, 'review-3')
    assert.equal(result.repositoryPath, '/repo')
    assert.equal(result.baseRef, 'main')
    assert.equal(result.sourceType, 'commits')
    assert.equal(result.sourceRef, 'abc123..def456')
    assert.equal(result.status, 'changes_requested')
    assert.equal(result.createdAt, '2025-01-03T00:00:00.000Z')
    assert.equal(result.updatedAt, '2025-01-03T00:00:00.000Z')
    assert.deepEqual(result.summary, {
      totalFiles: 2,
      totalAdditions: 120,
      totalDeletions: 10,
      filesAdded: 1,
      filesModified: 1,
      filesDeleted: 0,
      filesRenamed: 0,
    })
    // Should NOT have files array
    assert.equal('files' in result, false)
  })

  test('handles V1 snapshot with embedded files', () => {
    const files: DiffFile[] = [
      {
        oldPath: 'x.ts',
        newPath: 'x.ts',
        changeType: 'renamed',
        additions: 2,
        deletions: 1,
        hunks: [],
      },
    ]

    const review: Review = {
      id: 'review-4',
      repositoryPath: '/repo',
      baseRef: null,
      sourceType: 'staged',
      sourceRef: null,
      status: 'in_progress',
      snapshotData: JSON.stringify({
        repository: {
          name: 'legacy-repo',
          branch: 'main',
          remote: null,
          path: '/repo',
        },
        files,
      }),
      createdAt: '2025-01-04T00:00:00.000Z',
      updatedAt: '2025-01-04T00:00:00.000Z',
    }

    const result = toReviewListItem(review, [])

    assert.equal(result.id, 'review-4')
    assert.deepEqual(result.summary, {
      totalFiles: 1,
      totalAdditions: 2,
      totalDeletions: 1,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesRenamed: 1,
    })
    // Should NOT have files array
    assert.equal('files' in result, false)
  })
})

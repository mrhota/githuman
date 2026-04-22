import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert'
import type { DatabaseSync } from 'node:sqlite'
import { ExportService } from '../../../src/server/services/export.service.ts'
import { ReviewRepository } from '../../../src/server/repositories/review.repo.ts'
import { ReviewFileRepository } from '../../../src/server/repositories/review-file.repo.ts'
import { CommentRepository } from '../../../src/server/repositories/comment.repo.ts'
import { createTestDatabase } from '../../../src/server/db/index.ts'
import { buildReviewInput, buildCommentInput } from '../helpers.ts'

describe('ExportService', () => {
  let db: DatabaseSync
  let exportService: ExportService
  let reviewRepo: ReviewRepository
  let commentRepo: CommentRepository
  let testReviewId: string

  beforeEach(() => {
    db = createTestDatabase()
    reviewRepo = new ReviewRepository(db)
    const fileRepo = new ReviewFileRepository(db)
    commentRepo = new CommentRepository(db)
    exportService = new ExportService(reviewRepo, fileRepo, commentRepo)

    // Create a test review with diff data
    const snapshotData = JSON.stringify({
      files: [
        {
          oldPath: 'src/index.ts',
          newPath: 'src/index.ts',
          changeType: 'modified',
          additions: 5,
          deletions: 2,
          hunks: [
            {
              oldStart: 1,
              oldLines: 5,
              newStart: 1,
              newLines: 8,
              lines: [
                { type: 'context', content: 'const a = 1;', oldLineNumber: 1, newLineNumber: 1 },
                { type: 'removed', content: 'const b = 2;', oldLineNumber: 2, newLineNumber: null },
                { type: 'added', content: 'const b = 3;', oldLineNumber: null, newLineNumber: 2 },
                { type: 'added', content: 'const c = 4;', oldLineNumber: null, newLineNumber: 3 },
                { type: 'context', content: 'export { a, b };', oldLineNumber: 3, newLineNumber: 4 },
              ],
            },
          ],
        },
      ],
      repository: {
        name: 'test-repo',
        branch: 'main',
        remote: 'https://github.com/test/repo',
        path: '/path/to/repo',
      },
    })

    const review = reviewRepo.create(buildReviewInput({
      repositoryPath: '/path/to/repo',
      baseRef: 'abc123def456',
      snapshotData,
    }))
    testReviewId = review.id
  })

  after(() => {
    db?.close()
  })

  describe('exportToMarkdown', () => {
    it('should return null for non-existent review', () => {
      const result = exportService.exportToMarkdown('non-existent')
      assert.strictEqual(result, null)
    })

    it('should export a review without comments', () => {
      const markdown = exportService.exportToMarkdown(testReviewId)

      assert.ok(markdown)
      assert.ok(markdown.includes('# Code Review: Staged changes'))
      assert.ok(markdown.includes('test-repo'))
      assert.ok(markdown.includes('main'))
      assert.ok(markdown.includes('In Progress'))
      assert.ok(markdown.includes('**1** files changed'))
      assert.ok(markdown.includes('`src/index.ts`'))
    })

    it('should export a review with comments', () => {
      commentRepo.create(buildCommentInput({
        lineNumber: 2,
        content: 'Consider using a constant here',
      }))

      const markdown = exportService.exportToMarkdown(testReviewId)

      assert.ok(markdown)
      assert.ok(markdown.includes('## Review Comments'))
      assert.ok(markdown.includes('### src/index.ts'))
      assert.ok(markdown.includes('Consider using a constant here'))
      assert.ok(markdown.includes('**1** total comments'))
    })

    it('should include resolved badge for resolved comments', () => {
      commentRepo.create(buildCommentInput({
        lineNumber: 2,
        content: 'Fixed this',
        resolved: true,
      }))

      const markdown = exportService.exportToMarkdown(testReviewId)

      assert.ok(markdown)
      assert.ok(markdown.includes('✅'))
    })

    it('should include suggestion code blocks', () => {
      commentRepo.create(buildCommentInput({
        lineNumber: 2,
        content: 'Use this instead',
        suggestion: 'const b = 42;',
      }))

      const markdown = exportService.exportToMarkdown(testReviewId)

      assert.ok(markdown)
      assert.ok(markdown.includes('**Suggested change:**'))
      assert.ok(markdown.includes('const b = 42;'))
    })

    it('should exclude resolved comments when includeResolved is false', () => {
      commentRepo.create(buildCommentInput({
        lineNumber: 2,
        content: 'Resolved comment',
        resolved: true,
      }))

      commentRepo.create(buildCommentInput({
        id: 'test-comment-2',
        lineNumber: 3,
        content: 'Unresolved comment',
      }))

      const markdown = exportService.exportToMarkdown(testReviewId, {
        includeResolved: false,
      })

      assert.ok(markdown)
      assert.ok(!markdown.includes('Resolved comment'))
      assert.ok(markdown.includes('Unresolved comment'))
      assert.ok(markdown.includes('**1** total comments'))
    })

    it('should include diff snippets by default', () => {
      commentRepo.create(buildCommentInput({
        lineNumber: 2,
        content: 'Comment on this line',
      }))

      const markdown = exportService.exportToMarkdown(testReviewId)

      assert.ok(markdown)
      assert.ok(markdown.includes('```diff'))
      assert.ok(markdown.includes('+const b = 3;'))
    })

    it('should exclude diff snippets when includeDiffSnippets is false', () => {
      commentRepo.create(buildCommentInput({
        lineNumber: 2,
        content: 'Comment on this line',
      }))

      const markdown = exportService.exportToMarkdown(testReviewId, {
        includeDiffSnippets: false,
      })

      assert.ok(markdown)
      assert.ok(!markdown.includes('```diff'))
    })

    it('should show correct status badges', () => {
      // Test approved status
      reviewRepo.update(testReviewId, { status: 'approved' })
      let markdown = exportService.exportToMarkdown(testReviewId)
      assert.ok(markdown?.includes('✅ Approved'))

      // Test changes_requested status
      reviewRepo.update(testReviewId, { status: 'changes_requested' })
      markdown = exportService.exportToMarkdown(testReviewId)
      assert.ok(markdown?.includes('⚠️ Changes Requested'))
    })

    it('should include file list with status icons', () => {
      const markdown = exportService.exportToMarkdown(testReviewId)

      assert.ok(markdown)
      assert.ok(markdown.includes('## Files Changed'))
      assert.ok(markdown.includes('📝')) // modified icon
      assert.ok(markdown.includes('`src/index.ts`'))
      assert.ok(markdown.includes('+5/-2'))
    })

    it('should show Source Branch and Target Branch for branch reviews', () => {
      // Create a branch review
      const branchSnapshotData = JSON.stringify({
        files: [
          {
            oldPath: 'src/feature.ts',
            newPath: 'src/feature.ts',
            changeType: 'added',
            additions: 10,
            deletions: 0,
            hunks: [],
          },
        ],
        repository: {
          name: 'test-repo',
          branch: 'main',
          remote: 'https://github.com/test/repo',
          path: '/path/to/repo',
        },
      })

      const branchReview = reviewRepo.create(buildReviewInput({
        id: 'branch-review-1',
        repositoryPath: '/path/to/repo',
        baseRef: 'def456abc789',
        sourceType: 'branch',
        sourceRef: 'feature/api',
        snapshotData: branchSnapshotData,
      }))

      const markdown = exportService.exportToMarkdown(branchReview.id)

      assert.ok(markdown)
      assert.ok(markdown.includes('| Source Branch | feature/api |'), 'Should show Source Branch')
      assert.ok(markdown.includes('| Target Branch | main |'), 'Should show Target Branch')
      assert.ok(!markdown.includes('| Branch | main |'), 'Should NOT show generic Branch field')
      assert.ok(!markdown.includes('| Source | Branch: feature/api |'), 'Should NOT show Source with Branch: prefix')
    })

    it('should show Branch and Source for staged reviews', () => {
      const markdown = exportService.exportToMarkdown(testReviewId)

      assert.ok(markdown)
      assert.ok(markdown.includes('| Branch | main |'), 'Should show Branch for staged reviews')
      assert.ok(markdown.includes('| Source | Staged changes |'), 'Should show Source for staged reviews')
      assert.ok(!markdown.includes('Source Branch'), 'Should NOT show Source Branch for staged reviews')
      assert.ok(!markdown.includes('Target Branch'), 'Should NOT show Target Branch for staged reviews')
    })
  })
})

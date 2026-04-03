import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('shared schemas', () => {
  describe('diff schemas', () => {
    it('should export DiffLineSchema with correct properties', async () => {
      const { DiffLineSchema } = await import('../../../src/server/schemas/diff.ts')
      assert.ok(DiffLineSchema)
      assert.ok(DiffLineSchema.properties.type)
      assert.ok(DiffLineSchema.properties.content)
      assert.ok(DiffLineSchema.properties.oldLineNumber)
      assert.ok(DiffLineSchema.properties.newLineNumber)
    })

    it('should export DiffHunkSchema with lines array', async () => {
      const { DiffHunkSchema } = await import('../../../src/server/schemas/diff.ts')
      assert.ok(DiffHunkSchema)
      assert.ok(DiffHunkSchema.properties.oldStart)
      assert.ok(DiffHunkSchema.properties.lines)
    })

    it('should export DiffFileSchema with hunks', async () => {
      const { DiffFileSchema } = await import('../../../src/server/schemas/diff.ts')
      assert.ok(DiffFileSchema)
      assert.ok(DiffFileSchema.properties.hunks)
    })

    it('should export DiffFileMetadataSchema without hunks', async () => {
      const { DiffFileMetadataSchema } = await import('../../../src/server/schemas/diff.ts')
      assert.ok(DiffFileMetadataSchema)
      assert.ok(DiffFileMetadataSchema.properties.oldPath)
      assert.strictEqual((DiffFileMetadataSchema.properties as Record<string, unknown>).hunks, undefined)
    })

    it('should export DiffSummarySchema', async () => {
      const { DiffSummarySchema } = await import('../../../src/server/schemas/diff.ts')
      assert.ok(DiffSummarySchema)
      assert.ok(DiffSummarySchema.properties.totalFiles)
    })

    it('should export RepositoryInfoSchema', async () => {
      const { RepositoryInfoSchema } = await import('../../../src/server/schemas/diff.ts')
      assert.ok(RepositoryInfoSchema)
      assert.ok(RepositoryInfoSchema.properties.name)
      assert.ok(RepositoryInfoSchema.properties.branch)
    })
  })

  describe('review schemas', () => {
    it('should export ReviewStatusSchema', async () => {
      const { ReviewStatusSchema } = await import('../../../src/server/schemas/review.ts')
      assert.ok(ReviewStatusSchema)
    })

    it('should export ReviewSourceTypeSchema', async () => {
      const { ReviewSourceTypeSchema } = await import('../../../src/server/schemas/review.ts')
      assert.ok(ReviewSourceTypeSchema)
    })
  })
})

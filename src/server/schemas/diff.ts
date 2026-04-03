/**
 * Shared TypeBox schemas for diff-related types
 */
import { Type } from '@fastify/type-provider-typebox'

export const DiffLineSchema = Type.Object({
  type: Type.Union([Type.Literal('added'), Type.Literal('removed'), Type.Literal('context')]),
  content: Type.String(),
  oldLineNumber: Type.Union([Type.Integer(), Type.Null()]),
  newLineNumber: Type.Union([Type.Integer(), Type.Null()]),
})

export const DiffHunkSchema = Type.Object({
  oldStart: Type.Integer(),
  oldLines: Type.Integer(),
  newStart: Type.Integer(),
  newLines: Type.Integer(),
  lines: Type.Array(DiffLineSchema),
})

const FileStatusSchema = Type.Union([
  Type.Literal('added'),
  Type.Literal('modified'),
  Type.Literal('deleted'),
  Type.Literal('renamed'),
])

export const DiffFileMetadataSchema = Type.Object(
  {
    oldPath: Type.String({ description: 'Original file path' }),
    newPath: Type.String({ description: 'New file path' }),
    status: FileStatusSchema,
    additions: Type.Integer({ description: 'Number of lines added' }),
    deletions: Type.Integer({ description: 'Number of lines deleted' }),
  },
  { description: 'Diff file metadata (without hunks for lazy loading)' }
)

export const DiffFileSchema = Type.Object(
  {
    oldPath: Type.String({ description: 'Original file path' }),
    newPath: Type.String({ description: 'New file path' }),
    status: FileStatusSchema,
    additions: Type.Integer({ description: 'Number of lines added' }),
    deletions: Type.Integer({ description: 'Number of lines deleted' }),
    hunks: Type.Array(DiffHunkSchema),
  },
  { description: 'Diff file' }
)

export const DiffSummarySchema = Type.Object(
  {
    totalFiles: Type.Integer({ description: 'Total number of files' }),
    totalAdditions: Type.Integer({ description: 'Total lines added' }),
    totalDeletions: Type.Integer({ description: 'Total lines deleted' }),
    filesAdded: Type.Integer({ description: 'Number of files added' }),
    filesModified: Type.Integer({ description: 'Number of files modified' }),
    filesDeleted: Type.Integer({ description: 'Number of files deleted' }),
    filesRenamed: Type.Integer({ description: 'Number of files renamed' }),
  },
  { description: 'Diff summary statistics' }
)

export const RepositoryInfoSchema = Type.Object(
  {
    name: Type.String({ description: 'Repository name' }),
    branch: Type.String({ description: 'Current branch' }),
    remote: Type.Union([Type.String(), Type.Null()], { description: 'Remote URL' }),
    path: Type.String({ description: 'Repository path' }),
  },
  { description: 'Repository information' }
)

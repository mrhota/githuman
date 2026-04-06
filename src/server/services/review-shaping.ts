/**
 * Pure functions for shaping Review data into API response formats.
 *
 * These functions have no side effects and don't depend on repositories,
 * services, or other infrastructure. All data is passed in as parameters.
 */
import type { Review, DiffSummary, RepositoryInfo } from '../../shared/types.ts'
import type { DiffFileMetadata } from './review.service.ts'
import { parseSnapshotData, isV2Snapshot } from './snapshot.ts'
import { getDiffSummary } from './diff.service.ts'

/**
 * Compute summary statistics from file metadata.
 *
 * @param files - Array of file metadata (without hunks)
 * @returns Summary with totals and change type counts
 */
export function computeDiffSummary (files: DiffFileMetadata[]): DiffSummary {
  let totalAdditions = 0
  let totalDeletions = 0

  for (const file of files) {
    totalAdditions += file.additions
    totalDeletions += file.deletions
  }

  return {
    totalFiles: files.length,
    totalAdditions,
    totalDeletions,
    filesAdded: files.filter((f) => f.changeType === 'added').length,
    filesModified: files.filter((f) => f.changeType === 'modified').length,
    filesDeleted: files.filter((f) => f.changeType === 'deleted').length,
    filesRenamed: files.filter((f) => f.changeType === 'renamed').length,
  }
}

/**
 * Shape a Review into ReviewWithDetails format.
 *
 * For V2 snapshots, uses the provided file metadata.
 * For V1 snapshots, extracts file metadata from embedded files.
 *
 * @param review - Raw review from database
 * @param v2FileMetadata - Pre-fetched file metadata (used for V2 snapshots)
 * @returns Review with files array, summary, and repository info (without snapshotData)
 */
export function toReviewWithDetails (
  review: Review,
  v2FileMetadata: DiffFileMetadata[]
): Omit<Review, 'snapshotData'> & {
  files: DiffFileMetadata[]
  summary: DiffSummary
  repository: RepositoryInfo
} {
  const snapshot = parseSnapshotData(review.snapshotData)

  let fileMetadata: DiffFileMetadata[]
  let summary: DiffSummary

  if (isV2Snapshot(snapshot)) {
    // New format: use provided file metadata
    fileMetadata = v2FileMetadata
    summary = computeDiffSummary(fileMetadata)
  } else {
    // Legacy format: extract metadata from embedded files
    const files = snapshot.files
    fileMetadata = files.map((file) => ({
      oldPath: file.oldPath,
      newPath: file.newPath,
      changeType: file.changeType,
      additions: file.additions,
      deletions: file.deletions,
    }))
    summary = getDiffSummary(files)
  }

  return {
    id: review.id,
    repositoryPath: review.repositoryPath,
    baseRef: review.baseRef,
    sourceType: review.sourceType,
    sourceRef: review.sourceRef,
    status: review.status,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    files: fileMetadata,
    summary,
    repository: snapshot.repository,
  }
}

/**
 * Shape a Review into ReviewListItem format (no files array).
 *
 * For V2 snapshots, computes summary from provided file metadata.
 * For V1 snapshots, computes summary from embedded files.
 *
 * @param review - Raw review from database
 * @param v2FileMetadata - Pre-fetched file metadata (used for V2 snapshots)
 * @returns Review with summary only (no files array or snapshotData)
 */
export function toReviewListItem (
  review: Review,
  v2FileMetadata: DiffFileMetadata[]
): Omit<Review, 'snapshotData'> & {
  summary: DiffSummary
} {
  const snapshot = parseSnapshotData(review.snapshotData)

  let summary: DiffSummary

  if (isV2Snapshot(snapshot)) {
    // New format: compute summary from provided file metadata
    summary = computeDiffSummary(v2FileMetadata)
  } else {
    // Legacy format: compute summary from embedded files
    summary = getDiffSummary(snapshot.files)
  }

  return {
    id: review.id,
    repositoryPath: review.repositoryPath,
    baseRef: review.baseRef,
    sourceType: review.sourceType,
    sourceRef: review.sourceRef,
    status: review.status,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    summary,
  }
}

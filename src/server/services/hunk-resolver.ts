/**
 * HunkResolver - 4-path hunk resolution strategy
 *
 * Resolves diff hunks for a specific file in a review by trying:
 * 1. Stored hunks in review_files table
 * 2. Branch regeneration from git
 * 3. Commits regeneration from git
 * 4. V1 legacy snapshot fallback
 * 5. Empty array default
 */
import { ReviewFileRepository } from '../repositories/review-file.repo.ts'
import { GitService } from './git.service.ts'
import { parseSingleFileDiff } from './diff.service.ts'
import { parseSnapshotData, isV2Snapshot } from './snapshot.ts'
import type { Review, DiffHunk, DiffFile } from '../../shared/types.ts'

export class HunkResolver {
  private fileRepo: ReviewFileRepository
  private git: GitService

  constructor (fileRepo: ReviewFileRepository, git: GitService) {
    this.fileRepo = fileRepo
    this.git = git
  }

  /**
   * Resolve hunks for a file in a review using the 4-path strategy
   */
  async resolve (review: Review, filePath: string): Promise<DiffHunk[]> {
    // Path 1: Try to get from review_files table (new format with stored hunks)
    const fileRecord = this.fileRepo.findByReviewAndPath(review.id, filePath)
    if (fileRecord && fileRecord.hunksData) {
      return ReviewFileRepository.parseHunks(fileRecord.hunksData)
    }

    // Path 2: For branch reviews, regenerate from git
    if (review.sourceType === 'branch' && review.sourceRef) {
      const diffText = await this.git.getBranchFileDiff(review.sourceRef, filePath)
      const file = parseSingleFileDiff(diffText)
      return file?.hunks ?? []
    }

    // Path 3: For commits reviews, regenerate from git
    if (review.sourceType === 'commits' && review.sourceRef) {
      const commits = review.sourceRef.split(',').map(s => s.trim())
      const diffText = await this.git.getCommitsFileDiff(commits, filePath)
      const file = parseSingleFileDiff(diffText)
      return file?.hunks ?? []
    }

    // Path 4: For staged reviews without stored hunks (V1 legacy), try snapshot
    const snapshot = parseSnapshotData(review.snapshotData)
    if (!isV2Snapshot(snapshot)) {
      const legacyFile = snapshot.files.find((f: DiffFile) => f.newPath === filePath)
      if (legacyFile) {
        return legacyFile.hunks
      }
    }

    // Path 5: Default - no hunks found anywhere
    return []
  }
}

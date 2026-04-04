/**
 * Resolve command - mark a review as approved and resolve all comments
 */
import { parseArgs } from 'node:util'
import { initDatabase, closeDatabase, getDatabase } from '../../server/db/index.ts'
import { createConfig } from '../../server/config.ts'
import { ReviewRepository } from '../../server/repositories/review.repo.ts'
import { ReviewFileRepository } from '../../server/repositories/review-file.repo.ts'
import { CommentRepository } from '../../server/repositories/comment.repo.ts'
import { ReviewService, ReviewError } from '../../server/services/review.service.ts'
import { GitService } from '../../server/services/git.service.ts'

function printHelp () {
  console.log(`
Usage: githuman resolve <review-id|last> [options]

Mark a review as approved and resolve all its comments.

Arguments:
  review-id              The ID of the review to resolve, or "last" for the most recent

Options:
  --json                 Output as JSON
  -h, --help             Show this help message
`)
}

interface ResolveResult {
  reviewId: string;
  previousStatus: string;
  newStatus: string;
  commentsResolved: number;
  commentsAlreadyResolved: number;
}

export async function resolveCommand (args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    printHelp()
    process.exit(0)
  }

  let reviewId = positionals[0]

  if (!reviewId) {
    console.error('Error: review-id is required\n')
    printHelp()
    process.exit(1)
  }

  const config = createConfig()

  try {
    initDatabase(config.dbPath)
    const db = getDatabase()
    const reviewRepo = new ReviewRepository(db)
    const fileRepo = new ReviewFileRepository(db)
    const commentRepo = new CommentRepository(db)
    const git = new GitService(process.cwd())
    const reviewService = new ReviewService(reviewRepo, fileRepo, git)

    // Handle "last" keyword
    if (reviewId === 'last') {
      const lastId = reviewRepo.findLastId()
      if (!lastId) {
        console.error('Error: No reviews found')
        process.exit(1)
      }
      reviewId = lastId
    }

    // Get current review to capture previous status
    const review = reviewRepo.findById(reviewId)
    if (!review) {
      console.error(`Error: Review not found: ${reviewId}`)
      process.exit(1)
    }

    const previousStatus = review.status

    // Reject if already approved (terminal state - no valid transitions out)
    if (previousStatus === 'approved') {
      console.error('Error: Invalid status transition from \'approved\' to \'approved\'. Review is already approved.')
      process.exit(1)
    }

    // Update review status via service layer (enforces VALID_TRANSITIONS)
    try {
      reviewService.update(reviewId, { status: 'approved' })
    } catch (err) {
      if (err instanceof ReviewError && err.code === 'INVALID_TRANSITION') {
        console.error(`Error: ${err.message}`)
        process.exit(1)
      }
      throw err
    }

    // Resolve all unresolved comments
    const comments = commentRepo.findByReview(reviewId)
    const unresolvedComments = comments.filter((c) => !c.resolved)
    const alreadyResolved = comments.length - unresolvedComments.length

    for (const comment of unresolvedComments) {
      commentRepo.setResolved(comment.id, true)
    }

    const result: ResolveResult = {
      reviewId,
      previousStatus,
      newStatus: 'approved',
      commentsResolved: unresolvedComments.length,
      commentsAlreadyResolved: alreadyResolved,
    }

    if (values.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`Review ${reviewId} resolved:`)
      console.log(`  Status: ${previousStatus} -> approved`)
      console.log(`  Comments resolved: ${unresolvedComments.length}`)
      if (alreadyResolved > 0) {
        console.log(`  Comments already resolved: ${alreadyResolved}`)
      }
    }

    closeDatabase()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('Error: Database does not exist. No reviews have been created yet.')
      process.exit(1)
    } else {
      throw err
    }
  }
}

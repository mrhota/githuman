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
import { createGitAdapter } from '../../server/adapters/git.ts'
import { type CliContext, systemCliContext } from '../context.ts'

function printHelp (ctx: CliContext) {
  ctx.stdout(`
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

export async function resolveCommand (args: string[], ctx: CliContext = systemCliContext) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    printHelp(ctx)
    ctx.exit(0)
  }

  let reviewId = positionals[0]

  if (!reviewId) {
    ctx.stderr('Error: review-id is required\n')
    printHelp(ctx)
    ctx.exit(1)
  }

  const config = createConfig({ cwd: ctx.cwd() })

  try {
    initDatabase(config.dbPath)
    const db = getDatabase()
    const reviewRepo = new ReviewRepository(db)
    const fileRepo = new ReviewFileRepository(db)
    const commentRepo = new CommentRepository(db)
    const git = new GitService(createGitAdapter(ctx.cwd()), ctx.cwd())
    const reviewService = new ReviewService(reviewRepo, fileRepo, git)

    // Handle "last" keyword
    if (reviewId === 'last') {
      const lastId = reviewRepo.findLastId()
      if (!lastId) {
        ctx.stderr('Error: No reviews found')
        ctx.exit(1)
      }
      reviewId = lastId
    }

    // Get current review to capture previous status
    const review = reviewRepo.findById(reviewId)
    if (!review) {
      ctx.stderr(`Error: Review not found: ${reviewId}`)
      ctx.exit(1)
    }

    const previousStatus = review.status

    // Reject if already approved (terminal state - no valid transitions out)
    if (previousStatus === 'approved') {
      ctx.stderr('Error: Invalid status transition from \'approved\' to \'approved\'. Review is already approved.')
      ctx.exit(1)
    }

    // Update review status via service layer (enforces VALID_TRANSITIONS)
    try {
      reviewService.update(reviewId, { status: 'approved' })
    } catch (err) {
      if (err instanceof ReviewError && err.code === 'INVALID_TRANSITION') {
        ctx.stderr(`Error: ${err.message}`)
        ctx.exit(1)
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
      ctx.stdout(JSON.stringify(result, null, 2))
    } else {
      ctx.stdout(`Review ${reviewId} resolved:`)
      ctx.stdout(`  Status: ${previousStatus} -> approved`)
      ctx.stdout(`  Comments resolved: ${unresolvedComments.length}`)
      if (alreadyResolved > 0) {
        ctx.stdout(`  Comments already resolved: ${alreadyResolved}`)
      }
    }

    closeDatabase()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      ctx.stderr('Error: Database does not exist. No reviews have been created yet.')
      ctx.exit(1)
    } else {
      throw err
    }
  }
}

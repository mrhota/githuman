/**
 * List command - list all saved reviews
 */
import { parseArgs } from 'node:util'
import { initDatabase, closeDatabase } from '../../server/db/index.ts'
import { createConfig } from '../../server/config.ts'
import { ReviewRepository } from '../../server/repositories/review.repo.ts'
import type { ReviewStatus } from '../../shared/types.ts'

function printHelp () {
  console.log(`
Usage: githuman list [options]

List all saved reviews for the current repository.

Options:
  --status <status>      Filter by status (in_progress|approved|changes_requested)
  --json                 Output as JSON
  -h, --help             Show this help message
`)
}

export async function listCommand (args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      status: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    printHelp()
    process.exit(0)
  }

  const config = createConfig()

  try {
    const db = initDatabase(config.dbPath)
    const reviewRepo = new ReviewRepository(db)

    const result = reviewRepo.findAll({
      status: values.status as ReviewStatus | undefined,
      pageSize: 1000,
    })

    const reviews = result.data

    if (values.json) {
      // Output the same shape as before for backwards compatibility
      console.log(JSON.stringify(reviews.map((r) => ({
        id: r.id,
        source_type: r.sourceType,
        source_ref: r.sourceRef,
        status: r.status,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      })), null, 2))
    } else if (reviews.length === 0) {
      console.log('No reviews found.')
    } else {
      console.log('Reviews:\n')
      for (const review of reviews) {
        const statusIcon =
          review.status === 'approved'
            ? '[+]'
            : review.status === 'changes_requested'
              ? '[!]'
              : '[ ]'

        // Build a display name based on source type
        let displayName: string = review.sourceType
        if (review.sourceType === 'branch' && review.sourceRef) {
          displayName = `Branch: ${review.sourceRef}`
        } else if (review.sourceType === 'commits' && review.sourceRef) {
          const commits = review.sourceRef.split(',')
          displayName = `Commits: ${commits.length} commit${commits.length > 1 ? 's' : ''}`
        } else if (review.sourceType === 'staged') {
          displayName = 'Staged changes'
        }

        console.log(`${statusIcon} ${displayName}`)
        console.log(`    ID: ${review.id}`)
        console.log(`    Created: ${review.createdAt}\n`)
      }
    }

    closeDatabase()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('No reviews found. Database does not exist yet.')
    } else {
      throw err
    }
  }
}

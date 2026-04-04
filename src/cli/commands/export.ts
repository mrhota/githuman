/**
 * Export command - export a review to markdown
 */
import { parseArgs } from 'node:util'
import { writeFileSync } from 'node:fs'
import { initDatabase, closeDatabase, getDatabase } from '../../server/db/index.ts'
import { createConfig } from '../../server/config.ts'
import { ExportService } from '../../server/services/export.service.ts'
import { ReviewRepository } from '../../server/repositories/review.repo.ts'
import { ReviewFileRepository } from '../../server/repositories/review-file.repo.ts'
import { CommentRepository } from '../../server/repositories/comment.repo.ts'

function printHelp () {
  console.log(`
Usage: githuman export <review-id|last> [options]

Export a review to markdown format.

Arguments:
  review-id              The ID of the review to export, or "last" for the most recent

Options:
  -o, --output <file>    Output file path (default: stdout)
  --no-resolved          Exclude resolved comments
  --no-snippets          Exclude diff snippets
  -h, --help             Show this help message
`)
}

export async function exportCommand (args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      'no-resolved': { type: 'boolean', default: false },
      'no-snippets': { type: 'boolean', default: false },
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

    // Handle "last" keyword
    if (reviewId === 'last') {
      const reviewRepo = new ReviewRepository(db)
      const lastId = reviewRepo.findLastId()
      if (!lastId) {
        console.error('Error: No reviews found')
        process.exit(1)
      }
      reviewId = lastId
    }

    const exportService = new ExportService(
      new ReviewRepository(db),
      new ReviewFileRepository(db),
      new CommentRepository(db),
    )

    const markdown = exportService.exportToMarkdown(reviewId, {
      includeResolved: !values['no-resolved'],
      includeDiffSnippets: !values['no-snippets'],
    })

    if (!markdown) {
      console.error(`Error: Review not found: ${reviewId}`)
      process.exit(1)
    }

    if (values.output) {
      writeFileSync(values.output, markdown, 'utf-8')
      console.log(`Exported to ${values.output}`)
    } else {
      console.log(markdown)
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

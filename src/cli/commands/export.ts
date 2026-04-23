/**
 * Export command - export a review to markdown
 */
import { parseArgs } from 'node:util'
import { writeFileSync } from 'node:fs'
import { initDatabase } from '../../server/db/index.ts'
import { createConfig } from '../../server/config.ts'
import { ExportService } from '../../server/services/export.service.ts'
import { ReviewRepository } from '../../server/repositories/review.repo.ts'
import { ReviewFileRepository } from '../../server/repositories/review-file.repo.ts'
import { CommentRepository } from '../../server/repositories/comment.repo.ts'
import { type CliContext, systemCliContext } from '../context.ts'

function printHelp (ctx: CliContext) {
  ctx.stdout(`
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

export async function exportCommand (args: string[], ctx: CliContext = systemCliContext) {
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
    const db = initDatabase(config.dbPath)

    // Handle "last" keyword
    if (reviewId === 'last') {
      const reviewRepo = new ReviewRepository(db)
      const lastId = reviewRepo.findLastId()
      if (!lastId) {
        ctx.stderr('Error: No reviews found')
        ctx.exit(1)
      }
      reviewId = lastId
    }

    const exportService = new ExportService(
      new ReviewRepository(db),
      new ReviewFileRepository(db),
      new CommentRepository(db)
    )

    const markdown = exportService.exportToMarkdown(reviewId, {
      includeResolved: !values['no-resolved'],
      includeDiffSnippets: !values['no-snippets'],
    })

    if (!markdown) {
      ctx.stderr(`Error: Review not found: ${reviewId}`)
      ctx.exit(1)
    }

    if (values.output) {
      writeFileSync(values.output, markdown, 'utf-8')
      ctx.stdout(`Exported to ${values.output}`)
    } else {
      ctx.stdout(markdown)
    }

    db.close()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      ctx.stderr('Error: Database does not exist. No reviews have been created yet.')
      ctx.exit(1)
    } else {
      throw err
    }
  }
}

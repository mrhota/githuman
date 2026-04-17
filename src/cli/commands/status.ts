/**
 * Status command - show overview of reviews and todos
 */
import { parseArgs } from 'node:util'
import { initDatabase, closeDatabase, getDatabase } from '../../server/db/index.ts'
import { createConfig } from '../../server/config.ts'
import { ReviewRepository } from '../../server/repositories/review.repo.ts'
import { TodoRepository } from '../../server/repositories/todo.repo.ts'
import { type CliContext, systemCliContext } from '../context.ts'

function printHelp (ctx: CliContext) {
  ctx.stdout(`
Usage: githuman status [options]

Show an overview of reviews and todos in the current repository.

Options:
  --json                 Output as JSON
  -h, --help             Show this help message
`)
}

interface StatusResult {
  reviews: {
    total: number;
    inProgress: number;
    approved: number;
    changesRequested: number;
  };
  todos: {
    total: number;
    pending: number;
    completed: number;
  };
}

export async function statusCommand (args: string[], ctx: CliContext = systemCliContext) {
  const { values } = parseArgs({
    args,
    options: {
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    printHelp(ctx)
    ctx.exit(0)
  }

  const config = createConfig({ cwd: ctx.cwd() })

  try {
    initDatabase(config.dbPath)
    const db = getDatabase()
    const reviewRepo = new ReviewRepository(db)
    const todoRepo = new TodoRepository(db)

    const status: StatusResult = {
      reviews: {
        total: reviewRepo.countAll(),
        inProgress: reviewRepo.countByStatus('in_progress'),
        approved: reviewRepo.countByStatus('approved'),
        changesRequested: reviewRepo.countByStatus('changes_requested'),
      },
      todos: {
        total: todoRepo.countAll(),
        pending: todoRepo.countPending(),
        completed: todoRepo.countCompleted(),
      },
    }

    if (values.json) {
      ctx.stdout(JSON.stringify(status, null, 2))
    } else {
      ctx.stdout('GitHuman Status\n')

      // Reviews section
      ctx.stdout('Reviews:')
      if (status.reviews.total === 0) {
        ctx.stdout('  No reviews yet')
      } else {
        ctx.stdout(`  Total: ${status.reviews.total}`)
        if (status.reviews.inProgress > 0) {
          ctx.stdout(`  [ ] In progress: ${status.reviews.inProgress}`)
        }
        if (status.reviews.approved > 0) {
          ctx.stdout(`  [+] Approved: ${status.reviews.approved}`)
        }
        if (status.reviews.changesRequested > 0) {
          ctx.stdout(`  [!] Changes requested: ${status.reviews.changesRequested}`)
        }
        ctx.stdout('  Run "githuman list" for details')
      }

      ctx.stdout('')

      // Todos section
      ctx.stdout('Todos:')
      if (status.todos.total === 0) {
        ctx.stdout('  No todos yet')
      } else {
        ctx.stdout(`  Total: ${status.todos.total}`)
        ctx.stdout(`  [ ] Pending: ${status.todos.pending}`)
        ctx.stdout(`  [x] Completed: ${status.todos.completed}`)
        ctx.stdout('  Run "githuman todo list" for details')
      }
    }

    closeDatabase()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      if (values.json) {
        ctx.stdout(JSON.stringify({
          reviews: { total: 0, inProgress: 0, approved: 0, changesRequested: 0 },
          todos: { total: 0, pending: 0, completed: 0 },
        }, null, 2))
      } else {
        ctx.stdout('GitHuman Status\n')
        ctx.stdout('No database found. Run "githuman serve" to get started.')
      }
    } else {
      throw err
    }
  }
}

/**
 * Todo command - manage todo items
 */
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'
import { initDatabase, closeDatabase, getDatabase } from '../../server/db/index.ts'
import { createConfig } from '../../server/config.ts'
import { TodoRepository } from '../../server/repositories/todo.repo.ts'
import { type CliContext, systemCliContext } from '../context.ts'

/**
 * Notify the running server that todos have changed.
 * This is fire-and-forget - if the server isn't running, we silently continue.
 */
async function notifyServer (config: { port: number; host: string; authToken: string | null }) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`
    }

    const res = await fetch(`http://${config.host}:${config.port}/api/events/notify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'todos', action: 'updated' }),
      signal: AbortSignal.timeout(1000), // 1 second timeout
    })
    // Consume the response body to avoid resource leaks
    await res.text()
  } catch {
    // Server not running or unreachable - silently continue
  }
}

function printHelp (ctx: CliContext) {
  ctx.stdout(`
Usage: githuman todo <subcommand> [options]

Manage todo items for tracking tasks during review.

Subcommands:
  add <content>          Add a new todo item
  list                   List todos (defaults to pending only)
  done <id>              Mark todo as completed (alias: complete)
  undone <id>            Mark todo as not completed
  move <id> <position>   Move todo to a new position (0-indexed)
  remove <id>            Delete a todo
  clear                  Remove todos (use with --done to clear completed)

Options:
  --review <id>          Scope todo to a specific review
  --done                 Show/clear completed (done) todos instead of pending
  --all                  Show all todos (list only)
  --json                 Output as JSON
  -h, --help             Show this help message

Examples:
  githuman todo add "Fix the type error in utils.ts"
  githuman todo list                    # Shows pending todos
  githuman todo list --done             # Shows completed todos
  githuman todo list --all              # Shows all todos
  githuman todo done abc123
  githuman todo move abc123 0           # Move to top
  githuman todo clear --done
`)
}

export async function todoCommand (args: string[], ctx: CliContext = systemCliContext) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      review: { type: 'string' },
      done: { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help || positionals.length === 0) {
    printHelp(ctx)
    ctx.exit(0)
  }

  const subcommand = positionals[0]
  const config = createConfig({ cwd: ctx.cwd() })
  let didMutate = false

  try {
    initDatabase(config.dbPath)
    const db = getDatabase()
    const repo = new TodoRepository(db)

    switch (subcommand) {
      case 'add': {
        const content = positionals.slice(1).join(' ')
        if (!content) {
          ctx.stderr('Error: Todo content is required')
          ctx.stderr('Usage: githuman todo add <content>')
          ctx.exit(1)
        }

        const todo = repo.create({
          id: randomUUID(),
          content,
          completed: false,
          reviewId: values.review ?? null,
        })

        if (values.json) {
          ctx.stdout(JSON.stringify(todo, null, 2))
        } else {
          ctx.stdout(`Created todo: ${todo.id.slice(0, 8)}`)
          ctx.stdout(`  ${todo.content}`)
        }
        didMutate = true
        break
      }

      case 'list': {
        let todos
        // Default to showing pending only, unless --all or --done is specified
        const showDone = values.done
        const showAll = values.all

        if (values.review) {
          if (showAll) {
            todos = repo.findByReview(values.review)
          } else {
            todos = repo.findByReviewAndCompleted(values.review, showDone)
          }
        } else if (showAll) {
          todos = repo.findAll()
        } else {
          todos = repo.findByCompleted(showDone)
        }

        if (values.json) {
          ctx.stdout(JSON.stringify(todos, null, 2))
        } else if (todos.length === 0) {
          ctx.stdout('No todos found.')
        } else {
          ctx.stdout('Todos:\n')
          for (const todo of todos) {
            const statusIcon = todo.completed ? '[x]' : '[ ]'
            ctx.stdout(`${statusIcon} ${todo.content}`)
            ctx.stdout(`    ID: ${todo.id.slice(0, 8)}`)
            if (todo.reviewId) {
              ctx.stdout(`    Review: ${todo.reviewId.slice(0, 8)}`)
            }
            ctx.stdout('')
          }

          // Show summary
          const pending = todos.filter(t => !t.completed).length
          const completed = todos.filter(t => t.completed).length
          ctx.stdout(`Total: ${todos.length} (${pending} pending, ${completed} completed)`)
        }
        break
      }

      case 'complete':
      case 'done': {
        const id = positionals[1]
        if (!id) {
          ctx.stderr('Error: Todo ID is required')
          ctx.stderr('Usage: githuman todo done <id>')
          ctx.exit(1)
        }

        const todo = findTodoByPrefix(repo, id, ctx)
        if (!todo) {
          ctx.stderr(`Error: Todo not found: ${id}`)
          ctx.exit(1)
        }

        const updated = repo.update(todo.id, { completed: true })
        if (values.json) {
          ctx.stdout(JSON.stringify(updated, null, 2))
        } else {
          ctx.stdout(`Marked as done: ${todo.content}`)
        }
        didMutate = true
        break
      }

      case 'undone': {
        const id = positionals[1]
        if (!id) {
          ctx.stderr('Error: Todo ID is required')
          ctx.stderr('Usage: githuman todo undone <id>')
          ctx.exit(1)
        }

        const todo = findTodoByPrefix(repo, id, ctx)
        if (!todo) {
          ctx.stderr(`Error: Todo not found: ${id}`)
          ctx.exit(1)
        }

        const updated = repo.update(todo.id, { completed: false })
        if (values.json) {
          ctx.stdout(JSON.stringify(updated, null, 2))
        } else {
          ctx.stdout(`Marked as pending: ${todo.content}`)
        }
        didMutate = true
        break
      }

      case 'move': {
        const id = positionals[1]
        const posStr = positionals[2]
        if (!id || posStr === undefined) {
          ctx.stderr('Error: Todo ID and position are required')
          ctx.stderr('Usage: githuman todo move <id> <position>')
          ctx.exit(1)
        }

        const position = parseInt(posStr, 10)
        if (Number.isNaN(position) || position < 0) {
          ctx.stderr('Error: Position must be a non-negative integer')
          ctx.exit(1)
        }

        const todo = findTodoByPrefix(repo, id, ctx)
        if (!todo) {
          ctx.stderr(`Error: Todo not found: ${id}`)
          ctx.exit(1)
        }

        const moved = repo.move(todo.id, position)
        if (values.json) {
          ctx.stdout(JSON.stringify(moved, null, 2))
        } else {
          ctx.stdout(`Moved "${todo.content}" to position ${position}`)
        }
        didMutate = true
        break
      }

      case 'remove': {
        const id = positionals[1]
        if (!id) {
          ctx.stderr('Error: Todo ID is required')
          ctx.stderr('Usage: githuman todo remove <id>')
          ctx.exit(1)
        }

        const todo = findTodoByPrefix(repo, id, ctx)
        if (!todo) {
          ctx.stderr(`Error: Todo not found: ${id}`)
          ctx.exit(1)
        }

        repo.delete(todo.id)
        if (values.json) {
          ctx.stdout(JSON.stringify({ success: true, id: todo.id }, null, 2))
        } else {
          ctx.stdout(`Removed: ${todo.content}`)
        }
        didMutate = true
        break
      }

      case 'clear': {
        if (values.done) {
          const count = repo.deleteCompleted()
          if (values.json) {
            ctx.stdout(JSON.stringify({ deleted: count }, null, 2))
          } else {
            ctx.stdout(`Cleared ${count} completed todo${count === 1 ? '' : 's'}`)
          }
          if (count > 0) {
            didMutate = true
          }
        } else {
          ctx.stderr('Error: --done flag is required to clear todos')
          ctx.stderr('Usage: githuman todo clear --done')
          ctx.exit(1)
        }
        break
      }

      default:
        ctx.stderr(`Unknown subcommand: ${subcommand}`)
        printHelp(ctx)
        ctx.exit(1)
    }

    // Notify server of changes if mutation occurred
    if (didMutate) {
      await notifyServer(config)
    }

    closeDatabase()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      if (subcommand === 'list') {
        if (values.json) {
          ctx.stdout('[]')
        } else {
          ctx.stdout('No todos found.')
        }
      } else {
        ctx.stderr('Error: Database does not exist yet. Run "githuman serve" first.')
        ctx.exit(1)
      }
    } else {
      throw err
    }
  }
}

/**
 * Find a todo by ID prefix (for convenience)
 */
function findTodoByPrefix (repo: TodoRepository, prefix: string, ctx: CliContext) {
  // First try exact match
  const exact = repo.findById(prefix)
  if (exact) return exact

  // Then try prefix match
  const all = repo.findAll()
  const matches = all.filter(t => t.id.startsWith(prefix))

  if (matches.length === 1) {
    return matches[0]
  } else if (matches.length > 1) {
    ctx.stderr(`Error: Multiple todos match prefix "${prefix}". Be more specific.`)
    for (const match of matches) {
      ctx.stderr(`  ${match.id.slice(0, 8)}: ${match.content}`)
    }
    ctx.exit(1)
  }

  return null
}

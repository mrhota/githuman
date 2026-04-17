/**
 * CLI command dispatcher - extracted from index.ts for testability
 */
import { type CliContext, systemCliContext } from './context.ts'

export async function dispatch (command: string | undefined, args: string[], ctx: CliContext = systemCliContext): Promise<void> {
  // Handle flags that can appear as the "command" position
  if (!command || command === '--help' || command === '-h') {
    printHelp(ctx)
    ctx.exit(0)
  }

  if (command === '--version' || command === '-v') {
    ctx.stdout('githuman v0.1.0')
    ctx.exit(0)
  }

  switch (command) {
    case 'serve': {
      const { serveCommand } = await import('./commands/serve.ts')
      await serveCommand(args, ctx)
      break
    }
    case 'status': {
      const { statusCommand } = await import('./commands/status.ts')
      await statusCommand(args, ctx)
      break
    }
    case 'list': {
      const { listCommand } = await import('./commands/list.ts')
      await listCommand(args, ctx)
      break
    }
    case 'export': {
      const { exportCommand } = await import('./commands/export.ts')
      await exportCommand(args, ctx)
      break
    }
    case 'resolve': {
      const { resolveCommand } = await import('./commands/resolve.ts')
      await resolveCommand(args, ctx)
      break
    }
    case 'todo': {
      const { todoCommand } = await import('./commands/todo.ts')
      await todoCommand(args, ctx)
      break
    }
    default:
      ctx.stderr(`Unknown command: ${command}`)
      printHelp(ctx)
      ctx.exit(1)
  }
}

function printHelp (ctx: CliContext) {
  ctx.stdout(`
GitHuman - Review AI agent code changes before commit

Usage: githuman <command> [options]

Commands:
  serve          Start the review server and open web interface
  status         Show overview of reviews and todos
  list           List all saved reviews for the current repository
  export         Export a review to markdown
  resolve        Mark a review as approved and resolve all comments
  todo           Manage todo items for tracking tasks

Options:
  -h, --help      Show this help message
  -v, --version   Show version number

Run 'githuman <command> --help' for command-specific help.
`)
}

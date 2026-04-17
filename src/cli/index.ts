#!/usr/bin/env node
/**
 * GitHuman CLI - Review AI agent code changes before commit
 */

// Suppress SQLite experimental warning
// Must be done before any imports that might load sqlite
const originalEmitWarning = process.emitWarning
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  if (typeof warning === 'string' && warning.includes('SQLite')) {
    return
  }
  if (warning instanceof Error && warning.message.includes('SQLite')) {
    return
  }
  return (originalEmitWarning as Function).call(process, warning, ...args)
}) as typeof process.emitWarning

// Use dynamic imports so warning suppression is in place first
const { parseArgs } = await import('node:util')

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
})

const command = positionals[0]

if (values.version && !command) {
  console.log('githuman v0.1.0')
  process.exit(0)
}

const { dispatch } = await import('./dispatch.ts')
await dispatch(command, process.argv.slice(3))

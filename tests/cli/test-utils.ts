/**
 * Shared utilities for CLI tests
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { dispatch } from '../../src/cli/dispatch.ts'
import { createTestCliContext, CliExitError } from '../../src/cli/context.ts'

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface TestContext {
  after: (fn: () => void) => void;
}

/**
 * Creates a temporary git repository for testing.
 * Automatically cleans up after the test.
 */
export function createTestRepo (t: TestContext): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'))
  execSync('git init', { cwd: tempDir, stdio: 'ignore' })
  execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' })
  execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' })

  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  return tempDir
}

/**
 * Creates a temporary git repository with an initialized database.
 * Automatically cleans up after the test.
 */
export async function createTestRepoWithDb (t: TestContext): Promise<string> {
  const tempDir = createTestRepo(t)

  const { initDatabase, closeDatabase } = await import('../../src/server/db/index.ts')
  initDatabase(join(tempDir, '.githuman', 'reviews.db'))
  closeDatabase()

  return tempDir
}

/**
 * Run a CLI command in-process using dispatch + CliContext injection.
 * Eliminates subprocess overhead (~250-500ms per test).
 */
export async function runCliInProcess (args: string[], options?: { cwd?: string }): Promise<ExecResult> {
  const ctx = createTestCliContext(options?.cwd)
  try {
    const command = args[0]
    await dispatch(command, args.slice(1), ctx)
  } catch (e) {
    if (e instanceof CliExitError) {
      // exit code already captured in ctx
    } else {
      // Unexpected error - capture message in stderr and set exit code 1
      const msg = e instanceof Error ? e.message : String(e)
      ctx.stderr(msg)
      try { ctx.exit(1) } catch { /* CliExitError from exit(1) */ }
    }
  }
  return {
    stdout: ctx.getStdout(),
    stderr: ctx.getStderr(),
    exitCode: ctx.getExitCode(),
  }
}

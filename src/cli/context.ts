/**
 * CLI context - ports-and-adapters pattern for CLI I/O
 *
 * Commands accept a CliContext parameter (defaulting to systemCliContext)
 * so tests can inject a capturing context instead of spawning subprocesses.
 */

export interface CliContext {
  stdout: (msg: string) => void
  stderr: (msg: string) => void
  exit: (code: number) => never
  cwd: () => string
}

export class CliExitError extends Error {
  readonly exitCode: number
  constructor (exitCode: number) {
    super(`exit ${exitCode}`)
    this.exitCode = exitCode
  }
}

export const systemCliContext: CliContext = {
  stdout: (msg) => console.log(msg),
  stderr: (msg) => console.error(msg),
  exit: (code) => process.exit(code),
  cwd: () => process.cwd(),
}

export interface TestCliContext extends CliContext {
  getStdout: () => string
  getStderr: () => string
  getExitCode: () => number
}

export function createTestCliContext (cwd?: string): TestCliContext {
  const output: string[] = []
  const errors: string[] = []
  let exitCode = 0

  return {
    stdout: (msg: string) => { output.push(msg) },
    stderr: (msg: string) => { errors.push(msg) },
    exit: (code: number): never => {
      exitCode = code
      throw new CliExitError(code)
    },
    cwd: () => cwd ?? process.cwd(),
    getStdout: () => output.join('\n'),
    getStderr: () => errors.join('\n'),
    getExitCode: () => exitCode,
  }
}

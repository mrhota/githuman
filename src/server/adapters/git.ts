import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitPort, GitRemote, GitStatusResult } from '../ports.ts'

const execFile = promisify(execFileCb)

function parseStatusPorcelainV2 (output: string): GitStatusResult {
  const staged: string[] = []
  const modified: string[] = []
  const created: string[] = []
  const deleted: string[] = []
  const renamed: Array<{ from: string; to: string }> = []
  const notAdded: string[] = []

  for (const line of output.split('\n')) {
    if (!line) continue

    if (line.startsWith('? ')) {
      notAdded.push(line.slice(2))
      continue
    }

    if (line.startsWith('1 ')) {
      const parts = line.split(' ')
      const xy = parts[1]
      const indexStatus = xy[0]
      const worktreeStatus = xy[1]
      const filePath = parts.slice(8).join(' ')

      if (indexStatus !== '.') {
        staged.push(filePath)
      }
      if (indexStatus === 'A') {
        created.push(filePath)
      }
      if (indexStatus === 'D') {
        deleted.push(filePath)
      }
      if (worktreeStatus === 'M' || worktreeStatus === 'D') {
        modified.push(filePath)
      }
      continue
    }

    if (line.startsWith('2 ')) {
      const parts = line.split(' ')
      const xy = parts[1]
      const indexStatus = xy[0]
      // porcelain v2 rename format:
      // 2 XY sub mH mI mW hH hI Xscore path\torigPath
      // The tab separates newPath from origPath within the last field
      const tabIdx = line.indexOf('\t')
      const origPath = line.slice(tabIdx + 1)
      // newPath is between the last space before tab and tab
      const beforeTab = line.slice(0, tabIdx)
      const lastSpaceIdx = beforeTab.lastIndexOf(' ')
      const newPath = beforeTab.slice(lastSpaceIdx + 1)

      if (indexStatus !== '.') {
        staged.push(newPath)
      }
      renamed.push({ from: origPath, to: newPath })
      continue
    }
  }

  return { staged, modified, created, deleted, renamed, notAdded }
}

function parseRemotes (output: string): GitRemote[] {
  const remoteMap = new Map<string, { fetch?: string; push?: string }>()

  for (const line of output.split('\n')) {
    if (!line) continue
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
    if (!match) continue
    const [, name, url, type] = match
    const existing = remoteMap.get(name) ?? {}
    existing[type as 'fetch' | 'push'] = url
    remoteMap.set(name, existing)
  }

  return Array.from(remoteMap.entries()).map(([name, refs]) => ({
    name,
    refs,
  }))
}

export function createGitAdapter (repoPath: string): GitPort {
  const execOpts = {
    cwd: repoPath,
    maxBuffer: 50 * 1024 * 1024,
  }

  async function run (args: string[]): Promise<string> {
    const { stdout } = await execFile('git', args, execOpts)
    return stdout
  }

  const statusArgs = [
    '--no-optional-locks',
    'status',
    '--porcelain=v2',
    '--untracked-files=normal',
  ]

  return {
    async revparse (args) {
      const result = await run(['rev-parse', ...args])
      return result.trim()
    },

    async status () {
      const output = await run(statusArgs)
      return parseStatusPorcelainV2(output)
    },

    async diff (args) {
      return run(['diff', ...args])
    },

    async show (args) {
      return run(['show', ...args])
    },

    async showBinary (args) {
      const { stdout } = await execFile('git', ['show', ...args], {
        cwd: repoPath,
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'buffer',
      }) as unknown as { stdout: Buffer }
      return stdout
    },

    async add (args) {
      await run(['add', ...args])
    },

    async reset (args) {
      await run(['reset', ...args])
    },

    async branch (args) {
      return run(['branch', ...args])
    },

    async getRemotes () {
      const output = await run(['remote', '-v'])
      return parseRemotes(output)
    },

    async getConfigValue (key) {
      try {
        const result = await run(['config', '--get', key])
        return result.trim() || null
      } catch {
        return null
      }
    },

    async raw (args) {
      return run(args)
    },

    async statusPorcelain () {
      return run(statusArgs)
    },
  }
}

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DEAD_DEPS = ['zod', 'diff2html', 'close-with-grace', 'open', 'clsx'] as const

function collectTsFiles (dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory() && entry !== 'node_modules') {
      results.push(...collectTsFiles(full))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      results.push(full)
    }
  }
  return results
}

describe('dead dependency detection', () => {
  const srcDir = join(import.meta.dirname, '..', '..', 'src')
  const files = collectTsFiles(srcDir)

  for (const dep of DEAD_DEPS) {
    it(`should have zero imports of "${dep}" in src/`, () => {
      const importPattern = new RegExp(
        `(?:from\\s+['"]${dep}['"]|require\\s*\\(\\s*['"]${dep}['"]|import\\s+['"]${dep}['"])`,
      )

      const matches: string[] = []
      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        if (importPattern.test(content)) {
          matches.push(file)
        }
      }

      assert.deepStrictEqual(
        matches,
        [],
        `Expected zero imports of "${dep}" but found in: ${matches.join(', ')}`,
      )
    })
  }
})

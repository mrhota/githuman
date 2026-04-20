#!/usr/bin/env node
/**
 * Scans src/ for imports of packages that should never be used.
 * Run as a lint step. Exits non-zero on any hit.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEAD_DEPS = ['zod', 'diff2html', 'close-with-grace', 'open', 'clsx']

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

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'src')
const files = collectTsFiles(srcDir)

let hasViolation = false
for (const dep of DEAD_DEPS) {
  const pattern = new RegExp(
    `(?:from\\s+['"]${dep}['"]|require\\s*\\(\\s*['"]${dep}['"]|import\\s+['"]${dep}['"])`
  )
  const matches = files.filter((f) => pattern.test(readFileSync(f, 'utf-8')))
  if (matches.length > 0) {
    hasViolation = true
    console.error(`Dead dependency "${dep}" imported in:`)
    for (const m of matches) console.error(`  ${m}`)
  }
}

if (hasViolation) {
  process.exit(1)
}

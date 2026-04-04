/**
 * Tests for snapshot data parsing and type safety.
 *
 * These tests prove that the current ad-hoc JSON.parse approach to
 * snapshotData allows silent data corruption, then verify that the
 * typed parser catches these problems.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import type { RepositoryInfo, DiffFile } from '../../../src/shared/types.ts'

const validRepo: RepositoryInfo = {
  name: 'test',
  branch: 'main',
  remote: null,
  path: '/tmp/test',
}

const validV1Files: DiffFile[] = [{
  oldPath: 'a.ts',
  newPath: 'a.ts',
  changeType: 'modified',
  additions: 1,
  deletions: 0,
  hunks: [],
}]

describe('snapshot data parsing — proving data corruption risks', () => {
  /**
   * These tests demonstrate silent failures with raw JSON.parse.
   * They should pass, documenting the dangerous behavior.
   */
  describe('current behavior (raw JSON.parse) — silent corruption', () => {
    it('V1 snapshot accessed as V2 silently loses files (undefined, no error)', () => {
      const v2 = JSON.stringify({ repository: validRepo, version: 2 })
      const parsedV2 = JSON.parse(v2) as { files?: DiffFile[] }

      // Silent corruption: accessing .files on V2 returns undefined, not an error
      assert.strictEqual(parsedV2.files, undefined)
      // Code that does `snapshot.files ?? []` silently gets empty array — data lost
    })

    it('malformed snapshot (missing repository) parses without error', () => {
      const bad = JSON.stringify({ version: 2 })
      const parsed = JSON.parse(bad)

      // No error thrown — repository is undefined
      assert.strictEqual(parsed.repository, undefined)
      // Downstream code accessing parsed.repository.name would crash at runtime
    })

    it('unknown version (e.g., 3) is silently treated as V1 by isNewFormat check', () => {
      const futureVersion = JSON.stringify({ repository: validRepo, version: 3 })
      const parsed = JSON.parse(futureVersion)

      // Current isNewFormat: `snapshot.version === 2`
      // Version 3 is NOT === 2, so it's treated as legacy V1
      const isNew = parsed.version === 2
      assert.strictEqual(isNew, false)
      // But V1 expects a `files` array — which doesn't exist here
      assert.strictEqual(parsed.files, undefined)
      // Silent data loss: code falls through to legacy path with no files
    })

    it('completely invalid JSON structure parses as "valid" object', () => {
      const garbage = JSON.stringify({ foo: 'bar', baz: 42 })
      const parsed = JSON.parse(garbage)

      // No error — parsed is a regular object
      assert.strictEqual(parsed.repository, undefined)
      assert.strictEqual(parsed.version, undefined)
      assert.strictEqual(parsed.files, undefined)
      // Every field access silently returns undefined
    })
  })

  /**
   * These tests verify the typed parser catches corruption.
   * They will FAIL until we implement parseSnapshotData.
   */
  describe('typed parser — catches corruption', () => {
    // Dynamic import so we can test the module once it exists
    let parseSnapshotData: (raw: string) => unknown

    it('should be importable from snapshot module', async () => {
      const mod = await import('../../../src/server/services/snapshot.ts')
      parseSnapshotData = mod.parseSnapshotData
      assert.strictEqual(typeof parseSnapshotData, 'function')
    })

    it('should parse valid V1 snapshot', async () => {
      const mod = await import('../../../src/server/services/snapshot.ts')
      const v1 = JSON.stringify({ repository: validRepo, files: validV1Files })
      const result = mod.parseSnapshotData(v1)

      assert.ok(!('version' in result) || result.version !== 2)
      assert.ok('files' in result)
      assert.strictEqual(result.files.length, 1)
      assert.deepStrictEqual(result.repository, validRepo)
    })

    it('should parse valid V2 snapshot', async () => {
      const mod = await import('../../../src/server/services/snapshot.ts')
      const v2 = JSON.stringify({ repository: validRepo, version: 2 })
      const result = mod.parseSnapshotData(v2)

      assert.ok(mod.isV2Snapshot(result))
      assert.strictEqual(result.version, 2)
      assert.deepStrictEqual(result.repository, validRepo)
    })

    it('should throw on missing repository field', async () => {
      const mod = await import('../../../src/server/services/snapshot.ts')
      const bad = JSON.stringify({ version: 2 })

      assert.throws(
        () => mod.parseSnapshotData(bad),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          return true
        }
      )
    })

    it('should throw on unknown version (e.g., 3)', async () => {
      const mod = await import('../../../src/server/services/snapshot.ts')
      const futureVersion = JSON.stringify({ repository: validRepo, version: 3 })

      assert.throws(
        () => mod.parseSnapshotData(futureVersion),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          return true
        }
      )
    })

    it('should throw on completely invalid structure', async () => {
      const mod = await import('../../../src/server/services/snapshot.ts')
      const garbage = JSON.stringify({ foo: 'bar' })

      assert.throws(
        () => mod.parseSnapshotData(garbage),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          return true
        }
      )
    })

    it('should throw on invalid JSON string', async () => {
      const mod = await import('../../../src/server/services/snapshot.ts')

      assert.throws(
        () => mod.parseSnapshotData('not json at all'),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          return true
        }
      )
    })

    it('should preserve V1 files data through parse roundtrip', async () => {
      const mod = await import('../../../src/server/services/snapshot.ts')
      const v1 = JSON.stringify({ repository: validRepo, files: validV1Files })
      const result = mod.parseSnapshotData(v1)

      assert.ok('files' in result)
      assert.strictEqual(result.files[0].newPath, 'a.ts')
      assert.strictEqual(result.files[0].changeType, 'modified')
    })

    it('should use isV2Snapshot type guard correctly', async () => {
      const mod = await import('../../../src/server/services/snapshot.ts')

      const v1 = mod.parseSnapshotData(JSON.stringify({ repository: validRepo, files: validV1Files }))
      const v2 = mod.parseSnapshotData(JSON.stringify({ repository: validRepo, version: 2 }))

      assert.strictEqual(mod.isV2Snapshot(v1), false)
      assert.strictEqual(mod.isV2Snapshot(v2), true)
    })
  })
})

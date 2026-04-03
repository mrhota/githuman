/**
 * Typed snapshot data parsing for review snapshots.
 *
 * Reviews store a JSON "snapshotData" string that varies by version:
 * - V1 (legacy): contains files with hunks inline
 * - V2 (current): contains only repository info; files stored separately
 *
 * This module provides validated parsing that prevents silent data
 * corruption from malformed or unrecognized snapshot formats.
 */
import type { DiffFile, RepositoryInfo } from '../../shared/types.ts'

/** V1 snapshot: files with hunks stored inline (legacy format). */
export interface SnapshotV1 {
  repository: RepositoryInfo
  files: DiffFile[]
}

/** V2 snapshot: files stored in review_files table, only repo info here. */
export interface SnapshotV2 {
  repository: RepositoryInfo
  version: 2
}

export type SnapshotData = SnapshotV1 | SnapshotV2

export class SnapshotParseError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'SnapshotParseError'
  }
}

function isObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasRepository (obj: Record<string, unknown>): obj is Record<string, unknown> & { repository: RepositoryInfo } {
  return isObject(obj.repository) &&
    typeof (obj.repository as Record<string, unknown>).name === 'string' &&
    typeof (obj.repository as Record<string, unknown>).branch === 'string' &&
    typeof (obj.repository as Record<string, unknown>).path === 'string'
}

/**
 * Parse and validate a snapshot data JSON string.
 *
 * Throws SnapshotParseError on:
 * - Invalid JSON
 * - Missing required `repository` field
 * - Unrecognized version number
 * - Non-object structure
 */
export function parseSnapshotData (raw: string): SnapshotData {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new SnapshotParseError('Invalid JSON in snapshot data')
  }

  if (!isObject(parsed)) {
    throw new SnapshotParseError('Snapshot data must be an object')
  }

  if (!hasRepository(parsed)) {
    throw new SnapshotParseError('Snapshot data missing required repository field')
  }

  const version = parsed.version

  if (version === undefined || version === null) {
    // V1 format: must have files array
    if (!Array.isArray(parsed.files)) {
      throw new SnapshotParseError('V1 snapshot data missing required files array')
    }
    return { repository: parsed.repository, files: parsed.files as DiffFile[] }
  }

  if (version === 2) {
    return { repository: parsed.repository, version: 2 }
  }

  throw new SnapshotParseError(`Unknown snapshot version: ${version}`)
}

/** Type guard: is this a V2 (current format) snapshot? */
export function isV2Snapshot (snapshot: SnapshotData): snapshot is SnapshotV2 {
  return 'version' in snapshot && snapshot.version === 2
}

/** Type guard: is this a V1 (legacy format) snapshot? */
export function isV1Snapshot (snapshot: SnapshotData): snapshot is SnapshotV1 {
  return !isV2Snapshot(snapshot)
}

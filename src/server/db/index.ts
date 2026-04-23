/**
 * Database connection and initialization
 */
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { migrate, migrations } from './migrations.ts'

export function initDatabase (dbPath: string): DatabaseSync {
  // Ensure directory exists
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const db = new DatabaseSync(dbPath, {
    enableForeignKeyConstraints: true,
  })

  // Run migrations
  migrate(db, migrations)

  return db
}

/**
 * Create an in-memory database for testing
 */
export function createTestDatabase (): DatabaseSync {
  const testDb = new DatabaseSync(':memory:', {
    enableForeignKeyConstraints: true,
  })
  migrate(testDb, migrations)
  return testDb
}

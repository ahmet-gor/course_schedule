import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { runMigrations } from './migrations'
import { DEFAULT_SETTINGS } from '@shared/types'

let db: BetterSQLite3Database<typeof schema> | null = null
let sqlite: Database.Database | null = null

export function initDb(path: string): void {
  sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = OFF')
  runMigrations(sqlite)
  sqlite.pragma('foreign_keys = ON')
  sqlite
    .prepare('INSERT OR IGNORE INTO settings (id, json) VALUES (1, ?)')
    .run(JSON.stringify(DEFAULT_SETTINGS))
  db = drizzle(sqlite, { schema })
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function getSqlite(): Database.Database {
  if (!sqlite) throw new Error('Database not initialized')
  return sqlite
}
